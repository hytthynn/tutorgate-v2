"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, Quote, Code, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fromTelegram, plainText, safeLink, spliceContent, type RichContent, type RichMark, type TelegramEntity } from "@/features/chats/rich-text";
import { RichMessage } from "./rich-content";
import { pasteContent } from "./paste-content";

const labels: Record<RichMark["type"], string> = { bold: "Жирный", italic: "Курсив", underline: "Подчёркивание", strike: "Зачёркивание", blockquote: "Цитата", code: "Моноширинный", link: "Ссылка" };
const icons = { bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough, blockquote: Quote, code: Code, link: Link };
export function RichEditor({ value, onChange, disabled, onSend, onFiles }: { value: RichContent; onChange: (value: RichContent) => void; disabled: boolean; onSend: () => void; onFiles: (files: File[]) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const selection = useRef({ start: 0, end: 0 });
  const text = plainText(value);
  useLayoutEffect(() => {
    const input = ref.current; if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(160, Math.max(54, input.scrollHeight))}px`;
  }, [text]);
  function entities(): TelegramEntity[] {
    let offset = 0;
    return value.flatMap(n => { const start = offset; offset += n.text.length; return n.marks.map(m => ({ type: m.type === "strike" ? "strikethrough" : m.type === "link" ? "text_link" : m.type, offset: start, length: n.text.length, url: m.href })); });
  }
  function format(type: RichMark["type"], href?: string) {
    const { start, end } = selection.current;
    if (start === end) return;
    if (type === "link" && href === undefined) { setLink(""); return; }
    const entityType = type === "strike" ? "strikethrough" : type === "link" ? "text_link" : type;
    const existing = entities();
    const covered = existing.filter(m => m.type === entityType && m.offset < end && m.offset + m.length > start)
      .reduce((sum,m) => sum + Math.min(end,m.offset+m.length)-Math.max(start,m.offset),0) >= end-start;
    const trimmed = existing.flatMap(m => {
      if (m.type !== entityType || m.offset >= end || m.offset+m.length <= start) return [m];
      return [...(m.offset < start ? [{...m,length:start-m.offset}] : []), ...(m.offset+m.length > end ? [{...m,offset:end,length:m.offset+m.length-end}] : [])];
    });
    onChange(fromTelegram(text, covered && type !== "link" ? trimmed : [...trimmed, { type: entityType, offset: start, length: end-start, url: href }]));
    setLink(null); ref.current?.focus(); ref.current?.setSelectionRange(start,end);
  }
  return <div className="rich-editor">
    <div className="rich-toolbar" role="toolbar" aria-label="Форматирование сообщения">{(Object.keys(labels) as RichMark["type"][]).map(type => { const Icon = icons[type]; return <Button key={type} type="button" variant="ghost" size="icon" title={labels[type]} aria-label={labels[type]} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => format(type)}><Icon size={16} aria-hidden /></Button>; })}</div>
    {link !== null && <div><label>Адрес ссылки<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></label><Button type="button" disabled={!safeLink(link)} onClick={() => format("link",link)}>Добавить ссылку</Button><Button type="button" variant="ghost" onClick={() => setLink(null)}>Отмена</Button></div>}
    <textarea ref={ref} id="chat-message" aria-label="Сообщение ученику" value={text} rows={1} disabled={disabled} placeholder="Напишите сообщение…" aria-describedby="chat-composer-help"
      onPaste={e => {
        if (e.clipboardData.files.length) { e.preventDefault(); onFiles(Array.from(e.clipboardData.files)); return; }
        const html = e.clipboardData.getData("text/html"); if (html) { e.preventDefault(); onChange(spliceContent(value,e.currentTarget.selectionStart,e.currentTarget.selectionEnd,pasteContent(html))); }
      }}
      onSelect={e => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
      onChange={e => {
        const next = [...e.target.value].slice(0,4000).join("");
        let prefix = 0; while (prefix < text.length && prefix < next.length && text[prefix] === next[prefix]) prefix++;
        let suffix = 0; while (suffix < text.length-prefix && suffix < next.length-prefix && text[text.length-1-suffix] === next[next.length-1-suffix]) suffix++;
        const oldEnd = text.length-suffix, newEnd = next.length-suffix;
        const shifted = entities().flatMap(m => {
          const end = m.offset+m.length;
          if (end <= prefix) return [m];
          if (m.offset >= oldEnd) return [{ ...m, offset: m.offset+newEnd-oldEnd }];
          const start = Math.min(m.offset,prefix), finish = end >= oldEnd ? end+newEnd-oldEnd : newEnd;
          return finish > start ? [{ ...m, offset: start, length: finish-start }] : [];
        });
        onChange(fromTelegram(next,shifted));
      }}
      onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && ["b","i","u"].includes(e.key.toLowerCase())) { e.preventDefault(); format(e.key.toLowerCase() === "b" ? "bold" : e.key.toLowerCase() === "i" ? "italic" : "underline"); }
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); }
      }} />
    {value.some(n => n.marks.length) && <div className="rich-preview" aria-label="Предпросмотр форматирования"><RichMessage content={value} /></div>}
  </div>;
}
