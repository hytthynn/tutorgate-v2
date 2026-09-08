"use client";
import { DraftFile, MessageFile } from "./attachments";
import { prepareChatUpload, finalizeChatUploads } from "@/features/chats/attachment-actions";
import { MAX_ATTACHMENTS, validateAttachment } from "@/features/chats/attachments";
import { RichEditor } from "./rich-editor";
import { RichMessage } from "./rich-content";
import { plainContent, plainText, type RichContent } from "@/features/chats/rich-text";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Send } from "lucide-react";
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
  const fileInput = useRef<HTMLInputElement>(null);
  const draftFiles = selected ? files[selected] ?? [] : [];
  function addFiles(incoming: File[]) {
    if (!selected || pending) return;
    try {
      if (draftFiles.length + incoming.length > MAX_ATTACHMENTS) throw new Error("Не больше 10 файлов в сообщении.");
      for (const file of incoming) { try { validateAttachment({ name: file.name, size: file.size, type: file.type }); } catch { throw new Error(`${file.name}: размер должен быть от 1 байта до 10 МБ.`); } }
      setFiles(all => ({ ...all, [selected]: [...draftFiles,...incoming] })); setSendError("");
    } catch (error) { setSendError(error instanceof Error ? error.message : "Не удалось добавить файлы."); }
  }
  const requestId = useRef(0),
    sending = useRef(false),
    selectedRef = useRef(selected),
    acknowledged = useRef<Record<string, string>>({}),
    bottom = useRef<HTMLDivElement>(null);
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
      const merged = delta ? { ...previous.snapshot, ...incoming,
        hasMore: previous.snapshot.hasMore,
        conversations: incoming.conversations ?? previous.snapshot.conversations,
        messages: [...new Map([...previous.snapshot.messages,...incoming.messages].map(m => [m.id,m])).values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
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
  const messages = loadedFor === selected ? snapshot.messages : [],
    lastId = messages.at(-1)?.id;
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
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [selected, lastId]);
  const content = selected ? (drafts[selected] ?? plainContent("")) : plainContent("");
  const draft = plainText(content);
  async function send() {
    if (
      !selected ||
      !current ||
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
        const uploaded = await fetch(prepared.data!.url,{ method: "PUT", body: file, headers: { "Content-Type": "application/octet-stream" } });
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
          {!snapshot.conversations.length && (
            <p className="chat-empty">Пока нет назначенных учеников.</p>
          )}
          <div className="chat-contacts">
            {snapshot.conversations.map((c) => (
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
                <span className="chat-contact-top">
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
                <h2>{current.studentName}</h2>
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
                      <p className="chat-empty">
                        Сообщений пока нет. Напишите ученику первым.
                      </p>
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
                          <p><RichMessage content={m.content ?? plainContent(m.body)} /></p>
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
                <div ref={bottom} />
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
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => fileInput.current?.click()}>Прикрепить файл</Button>
                {draftFiles.map((file,i) => <DraftFile key={`${file.name}-${i}`} file={file} remove={() => { if (!pending) setFiles(all => ({ ...all, [selected!]: draftFiles.filter((_,index) => index !== i) })); }} />)}
                <label htmlFor="chat-message">Сообщение ученику</label>
                <RichEditor value={content} disabled={pending} onChange={value => setDrafts(all => ({ ...all, [selected!]: value }))} onSend={() => void send()} />
                <div className="chat-composer-bottom">
                  <span id="chat-composer-help">
                    {codePointLength(draft)} / 4000{" "}
                    <span className="chat-key-hint">
                      · Enter — отправить, Shift+Enter — новая строка
                    </span>
                  </span>
                  <Button
                    type="submit"
                    loading={pending}
                    loadingText="Отправляем…"
                    disabled={(!draft.trim() && !draftFiles.length) || loadedFor !== selected}
                  >
                    <Send size={16} aria-hidden />
                    Отправить
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
