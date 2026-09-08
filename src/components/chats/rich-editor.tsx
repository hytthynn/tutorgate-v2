"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fromTelegram, plainText, safeLink, spliceContent, type RichContent, type RichMark, type TelegramEntity } from "@/features/chats/rich-text";
import { RichMessage } from "./rich-content";
import { pasteContent } from "./paste-content";

const labels: Record<RichMark["type"], string> = { bold: "Жирный", italic: "Курсив", underline: "Подчёркивание", strike: "Зачёркивание", blockquote: "Цитата", code: "Моноширинный", link: "Ссылка" };
export function RichEditor({ value, onChange, disabled, onSend }: { value: RichContent; onChange: (value: RichContent) => void; disabled: boolean; onSend: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const selection = useRef({ start: 0, end: 0 });
  const text = plainText(value);
  function entities(): TelegramEntity[] {
    let offset = 0;
    return value.flatMap(n => { const start = offset; offset += n.text.length; return n.marks.map(m => ({ type: m.type === "strike" ? "strikethrough" : m.type === "link" ? "text_link" : m.type, offset: start, length: n.text.length, url: m.href })); });
  }
  function format(type: RichMark["type"], href?: string) {
    const { start, end } = selection.current;
    if (start === end) return;
    if (type === "link" && href === undefined) { setLink(""); return; }
    onChange(fromTelegram(text, [...entities(), { type: type === "strike" ? "strikethrough" : type === "link" ? "text_link" : type, offset: start, length: end-start, url: href }]));
    setLink(null); ref.current?.focus();
  }
  return <div className="rich-editor">
    <div className="rich-toolbar" role="toolbar" aria-label="Форматирование сообщения">{(Object.keys(labels) as RichMark["type"][]).map(type => <Button key={type} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => format(type)}>{labels[type]}</Button>)}</div>
    {link !== null && <div><label>Адрес ссылки<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></label><Button type="button" disabled={!safeLink(link)} onClick={() => format("link",link)}>Добавить ссылку</Button><Button type="button" variant="ghost" onClick={() => setLink(null)}>Отмена</Button></div>}
    <textarea ref={ref} id="chat-message" aria-label="Сообщение ученику" value={text} rows={3} disabled={disabled} placeholder="Напишите сообщение…" aria-describedby="chat-composer-help"
      onPaste={e => { const html = e.clipboardData.getData("text/html"); if (html) { e.preventDefault(); onChange(spliceContent(value,e.currentTarget.selectionStart,e.currentTarget.selectionEnd,pasteContent(html))); } }}
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
