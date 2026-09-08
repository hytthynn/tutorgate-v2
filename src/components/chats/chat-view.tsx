"use client";
import { DraftFile, MessageFile } from "./attachments";
import { prepareChatUpload, finalizeChatUploads } from "@/features/chats/attachment-actions";
import { MAX_ATTACHMENTS, validateAttachment, validateAttachmentTotal } from "@/features/chats/attachments";
import { RichEditor } from "./rich-editor";
import { RichMessage } from "./rich-content";
import { plainContent, plainText, type RichContent } from "@/features/chats/rich-text";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCheck, MessageSquare, Paperclip, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  chatPreviousAction,
  chatUpdatesAction,
  chatMarkReadAction,
  chatSendAction,
  chatSnapshotAction,
} from "@/features/chats/actions";
import { useVisiblePolling } from "@/features/chats/use-visible-polling";
import { codePointLength } from "@/lib/telegram/templates";
import type { ChatSnapshot } from "@/features/chats/types";
import { CHAT_TIME_ZONE, chatDateLabel } from "@/features/chats/dates";
const day = (value: string) =>
  new Date(value).toLocaleDateString("ru-RU", { timeZone: CHAT_TIME_ZONE });
const initials = (name: string) => name.trim().split(/\s+/).slice(0,2).map(word => word[0]).join("");
export function ChatView({
  initial,
  initialError,
  initialStudent,
}: {
  initial: ChatSnapshot;
  initialError?: string;
  initialStudent: string | null;
}) {
  const params = useSearchParams(),
    raw = params.get("student");
  const requested =
    raw && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(raw)
      ? raw
      : null;
  const selected =
    requested ?? initialStudent ?? initial.conversations[0]?.studentId ?? null;
  const [snapshot, setSnapshot] = useState(initial),
    [loadedFor, setLoadedFor] = useState(initialStudent);
  const [error, setError] = useState(initialError ?? ""),
    [readError, setReadError] = useState(""),
    [sendError, setSendError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RichContent>>({}),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const scrollState = useRef({ student: initialStudent, first: "", last: "", height: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const draftFiles = selected ? files[selected] ?? [] : [];
  function addFiles(incoming: File[]) {
    if (!selected || pending) return;
    try {
      if (draftFiles.length + incoming.length > MAX_ATTACHMENTS) throw new Error("Не больше 10 файлов в сообщении.");
      validateAttachmentTotal([...draftFiles,...incoming]);
      for (const file of incoming) { try { validateAttachment({ name: file.name, size: file.size, type: file.type }); } catch { throw new Error(`${file.name}: размер должен быть от 1 байта до 10 МБ.`); } }
      setFiles(all => ({ ...all, [selected]: [...draftFiles,...incoming] })); setSendError("");
    } catch (error) { setSendError(error instanceof Error ? error.message : "Не удалось добавить файлы."); }
  }
  const requestId = useRef(0),
    sending = useRef(false),
    selectedRef = useRef(selected),
    acknowledged = useRef<Record<string, string>>({});
  useEffect(() => {
    selectedRef.current = selected;
    const requests = requestId;
    return () => {
      requests.current++;
    };
  }, [selected]);
  const snapshotRef = useRef({ snapshot: initial, student: initialStudent });
  const refresh = useCallback(async () => {
    const version = ++requestId.current;
    setLoading(true);
    try {
      const previous = snapshotRef.current;
      const delta = previous.student === selected && previous.snapshot.cursor !== undefined;
      const result = delta ? await chatUpdatesAction(selected,previous.snapshot.cursor!,previous.snapshot.directoryVersion ?? "0") : await chatSnapshotAction(selected);
      if (version !== requestId.current || selectedRef.current !== selected)
        return;
      if (result.error) {
        setError(result.error);
        return;
      }
      setError("");
      const incoming = result.data!;
      const nextConversations = incoming.conversations ?? previous.snapshot.conversations;
      const previousConversation = previous.snapshot.conversations.find(c=>c.studentId===selected);
      const nextConversation = nextConversations.find(c=>c.studentId===selected);
      const sameConversation = previousConversation?.conversationId === nextConversation?.conversationId;
      if (selected && previousConversation && !nextConversation) {
        setDrafts(all=>({...all,[selected]:plainContent("")}));
        setFiles(all=>({...all,[selected]:[]}));
      }
      const merged = delta ? { ...previous.snapshot, ...incoming,
        hasMore: sameConversation && previous.snapshot.hasMore,
        conversations: nextConversations,
        messages: [...new Map([...(sameConversation ? previous.snapshot.messages : []),...incoming.messages].map(m => [m.id,m])).values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
      } : incoming;
      snapshotRef.current = { student: selected, snapshot: merged };
      setSnapshot(merged);
      window.dispatchEvent(new CustomEvent("tutorgate:chat-unread", { detail: merged.totalUnread }));
      setLoadedFor(selected);
    } catch {
      if (version === requestId.current)
        setError("Не удалось обновить чат. Проверьте подключение.");
    } finally {
      if (version === requestId.current) setLoading(false);
    }
  }, [selected]);
  useVisiblePolling(refresh);
  const current = snapshot.conversations.find((c) => c.studentId === selected),
    hasCurrent = !!current;
  const messages = useMemo(() => loadedFor === selected ? snapshot.messages : [], [loadedFor, selected, snapshot.messages]);
  const lastId = messages.at(-1)?.id;
  // Acknowledge only the last message actually rendered for this visible conversation.
  useEffect(() => {
    if (!selected || !lastId || !hasCurrent) return;
    let disposed = false,
      busy = false;
    const mark = async () => {
      if (
        disposed ||
        busy ||
        document.visibilityState !== "visible" ||
        acknowledged.current[selected] === lastId
      )
        return;
      busy = true;
      try {
        const result = await chatMarkReadAction(selected, lastId);
        if (disposed) return;
        if (result.error) {
          setReadError(result.error);
          return;
        }
        acknowledged.current[selected] = lastId;
        setReadError("");
        setSnapshot((s) => ({
          ...s,
          conversations: s.conversations.map((c) =>
            c.studentId === selected ? { ...c, unread: 0 } : c,
          ),
        }));
        window.dispatchEvent(new Event("tutorgate:chat-read"));
      } catch {
        if (!disposed)
          setReadError("Не удалось отметить сообщения прочитанными.");
      } finally {
        busy = false;
      }
    };
    void mark();
    const timer = setInterval(() => void mark(), 5000);
    document.addEventListener("visibilitychange", mark);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [selected, lastId, hasCurrent]);
  useLayoutEffect(() => {
    const el = history.current; if (!el) return;
    const previous = scrollState.current, first = messages[0]?.id ?? "";
    if (previous.student !== selected || !previous.last || (previous.last !== lastId && nearBottom.current)) el.scrollTop = el.scrollHeight;
    else if (first !== previous.first) el.scrollTop += el.scrollHeight - previous.height;
    scrollState.current = { student: selected, first, last: lastId ?? "", height: el.scrollHeight };
  }, [selected, lastId, messages]);
  const content = selected ? (drafts[selected] ?? plainContent("")) : plainContent("");
  const draft = plainText(content);
  async function send() {
    if (
      !selected ||
      !current ||
      loadedFor !== selected ||
      sending.current ||
      (!draft.trim() && !draftFiles.length) ||
      codePointLength(draft) > 4000
    )
      return;
    sending.current = true;
    setPending(true);
    setSendError("");
    const student = selected,
      sentText = draft;
    try {
      const ids: string[] = [];
      for (const file of draftFiles) {
        const prepared = await prepareChatUpload(student,{ name: file.name, size: file.size, type: file.type });
        if (prepared.error) { setSendError(`${file.name}: ${prepared.error}`); return; }
        const uploaded = await fetch(prepared.data!.url,{ method: "PUT", body: file, headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(60000) });
        if (!uploaded.ok) { setSendError(`${file.name}: загрузка не удалась.`); return; }
        ids.push(prepared.data!.id);
      }
      const result = ids.length ? await finalizeChatUploads(student,ids,content) : await chatSendAction(student, sentText, content);
      if (result.error) {
        setSendError(result.error);
        return;
      }
      setDrafts((all) => ({
        ...all,
        [student]: all[student] === content ? plainContent("") : all[student],
      }));
      setFiles(all => ({ ...all, [student]: [] }));
      nearBottom.current = true;
      await refresh();
    } catch {
      setSendError(
        "Не удалось подтвердить результат отправки. Обновите историю перед повторной отправкой.",
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <>
      {error && (
        <div className="chat-alert" role="alert">
          {error}
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => void refresh()}
          >
            Повторить
          </Button>
        </div>
      )}
      <section className="chat-layout panel" aria-label="Чаты с учениками">
        <aside className="chat-directory" aria-label="Диалоги">
          <div className="chat-directory-heading">
            Ученики{" "}
            <span className="muted">{snapshot.conversations.length}</span>
          </div>
          <label className="chat-search"><Search size={16} aria-hidden /><input aria-label="Поиск диалогов" placeholder="Найти ученика" value={search} onChange={event => setSearch(event.target.value)} /></label>
          {!snapshot.conversations.length && (
            <p className="chat-empty">Пока нет назначенных учеников.</p>
          )}
          <div className="chat-contacts">
            {search.trim() && !snapshot.conversations.some(c => c.studentName.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"))) && <p className="chat-empty">Никого не нашли. Попробуйте другое имя.</p>}
            {snapshot.conversations.filter(c => c.studentName.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"))).map((c) => (
              <button
                type="button"
                key={c.studentId}
                className={`chat-contact ${selected === c.studentId ? "is-selected" : ""}`}
                aria-pressed={selected === c.studentId}
                disabled={pending}
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("student", c.studentId);
                  window.history.replaceState(null, "", url);
                  setSendError("");
                }}
              >
                <span className="chat-avatar" aria-hidden>{initials(c.studentName)}</span>
                <span className="chat-contact-content"><span className="chat-contact-top">
                  <strong>{c.studentName}</strong>
                  {c.unread > 0 && (
                    <span
                      className="chat-unread"
                      aria-label={`${c.unread} непрочитанных`}
                    >
                      {c.unread}
                    </span>
                  )}
                </span>
                <span className="chat-preview">
                  {c.lastMessage ?? "Начните переписку"}
                </span>
                {c.lastAt && (
                  <time className="chat-contact-time" dateTime={c.lastAt}>
                    {new Date(c.lastAt).toLocaleString("ru-RU", {
                      timeZone: CHAT_TIME_ZONE,
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <div className="chat-conversation">
          {!current ? (
            <div className="chat-empty chat-empty-main">
              <MessageSquare size={28} aria-hidden />
              <h2>
                {selected && !loading ? "Чат недоступен" : "Выберите ученика"}
              </h2>
              <p>
                {selected
                  ? "Проверьте назначение или выберите другой диалог."
                  : "Сообщения ученика из Telegram появятся здесь."}
              </p>
            </div>
          ) : (
            <>
              <header className="chat-heading">
                <span className="chat-avatar" aria-hidden>{initials(current.studentName)}</span>
                <div><h2>{current.studentName}</h2><p>Переписка через Telegram</p></div>
                <MessageSquare size={20} className="chat-heading-icon" aria-hidden />
              </header>
              {snapshot.hasMore && loadedFor === selected && (
                <Button variant="ghost" size="sm" loading={loading} onClick={async () => {
                  const first = messages[0]; if (!selected || !first) return;
                  setLoading(true);
                  try {
                    const result = await chatPreviousAction(selected,first.created_at,first.id);
                    if (selectedRef.current !== selected) return;
                    if (result.error) { setError(result.error); return; }
                    const previous = snapshotRef.current.snapshot;
                    const updated = { ...previous, hasMore: result.data!.length === 200, messages: [...new Map([...result.data!,...previous.messages].map(m => [m.id,m])).values()] };
                    snapshotRef.current = { student: selected, snapshot: updated }; setSnapshot(updated);
                  } finally { setLoading(false); }
                }}>Загрузить предыдущие</Button>
              )}
              <div
                className="chat-history"
                ref={history}
                onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}
                role="region"
                aria-label="История сообщений"
                tabIndex={0}
              >
                {loadedFor !== selected ? (
                  <p className="chat-empty" role="status">
                    Загрузка сообщений…
                  </p>
                ) : (
                  <>
                    {!messages.length && (
                      <div className="chat-empty-thread"><MessageSquare size={26} aria-hidden /><h3>Начните разговор</h3><p>Сообщений пока нет. Напишите ученику первым.</p></div>
                    )}
                    {messages.map((m, i) => (
                      <Fragment key={m.id}>
                        {(i === 0 ||
                          day(messages[i - 1].created_at) !==
                            day(m.created_at)) && (
                          <div className="chat-date">
                            {chatDateLabel(m.created_at)}
                          </div>
                        )}
                        <article
                          className={`chat-bubble ${m.sender_role === "tutor" ? "is-tutor" : "is-student"}`}
                          aria-label={
                            m.sender_role === "tutor"
                              ? "Ваше сообщение"
                              : "Сообщение ученика"
                          }
                        >
                          {m.body && <p><RichMessage content={m.content ?? plainContent(m.body)} /></p>}
                          {m.attachments?.map(file => <MessageFile key={file.id} file={file} />)}
                          <footer>
                            <span>
                              {m.sender_role === "tutor" ? "Вы" : "Ученик"}
                            </span>
                            <time dateTime={m.created_at}>
                              {new Date(m.created_at).toLocaleTimeString(
                                "ru-RU",
                                {
                                  timeZone: CHAT_TIME_ZONE,
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </time>
                            {m.sender_role === "tutor" && m.delivery_status === "sent" && <CheckCheck size={14} aria-label="Доставлено в Telegram" />}
                          </footer>
                          {m.sender_role === "tutor" &&
                            m.delivery_status === "failed" && (
                              <span className="chat-delivery-failed">
                                Не доставлено в Telegram
                              </span>
                            )}
                          {m.sender_role === "tutor" &&
                            m.delivery_status === "pending" && (
                              <span className="chat-delivery-pending">
                                Доставка в Telegram не подтверждена
                              </span>
                            )}
                        </article>
                      </Fragment>
                    ))}
                  </>
                )}
              </div>
              <form
                className={`chat-composer ${dragging ? "is-file-drop" : ""}`}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
                onDrop={event => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                {(sendError || readError) && (
                  <p className="field-error" role="alert">
                    {sendError || readError}
                  </p>
                )}
                {dragging && <p>Перетащите файлы сюда</p>}
                <input ref={fileInput} type="file" multiple hidden onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
                {!!draftFiles.length && <div className="chat-draft-files">{draftFiles.map((file,i) => <DraftFile key={`${file.name}-${i}`} file={file} remove={() => { if (!pending) setFiles(all => ({ ...all, [selected!]: draftFiles.filter((_,index) => index !== i) })); }} />)}</div>}
                <label className="sr-only" htmlFor="chat-message">Сообщение ученику</label>
                <RichEditor value={content} disabled={pending} onChange={value => setDrafts(all => ({ ...all, [selected!]: value }))} onSend={() => void send()} onFiles={addFiles} />
                <div className="chat-composer-bottom">
                  <Button type="button" variant="ghost" size="icon" aria-label="Прикрепить файл" title="Прикрепить файл · до 10 МБ" disabled={pending} onClick={() => fileInput.current?.click()}><Paperclip size={20} /></Button>
                  <span id="chat-composer-help">
                    {codePointLength(draft)} / 4000{" "}
                    <span className="sr-only">Enter — отправить, Shift+Enter — новая строка</span>
                  </span>
                  <Button
                    className="chat-send"
                    type="submit"
                    loading={pending}
                    loadingText="Отправляем…"
                    disabled={(!draft.trim() && !draftFiles.length) || loadedFor !== selected}
                  >
                    <Send size={16} aria-hidden />
                    <span>Отправить</span>
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
}
