import { z } from "zod";

export const markTypes = ["bold", "italic", "underline", "strike", "code", "link", "blockquote"] as const;
const markSchema = z.object({ type: z.enum(markTypes), href: z.string().max(2048).optional() }).strict().refine(m => m.type !== "link" || safeLink(m.href));
export const contentSchema = z.array(z.object({ text: z.string().max(8000), marks: z.array(markSchema).max(7) }).strict()).max(4000).refine(c => [...c.map(n => n.text).join("")].length <= 4000);
export type RichContent = z.infer<typeof contentSchema>;
export type RichMark = RichContent[number]["marks"][number];
export function safeLink(value?: string): boolean {
  if (!value || /[\u0000-\u0020]/.test(value)) return false;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}
export const plainText = (c: RichContent) => c.map(n => n.text).join("");
export const plainContent = (text: string): RichContent => [{ text, marks: [] }];
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tags = { bold: "b", italic: "i", underline: "u", strike: "s", code: "code", link: "a", blockquote: "blockquote" };
export function normalizedMarks(marks: RichMark[]): RichMark[] {
  // Telegram code cannot contain other entities; keep a deterministic subset.
  if (marks.some(m => m.type === "code")) return [{ type: "code" }];
  return (["blockquote", ...markTypes.filter(t => t !== "blockquote")] as RichMark["type"][]).flatMap(type => { const mark = marks.find(m => m.type === type); return mark && (type !== "link" || safeLink(mark.href)) ? [mark] : []; });
}
export function spliceContent(content: RichContent, start: number, end: number, inserted: RichContent): RichContent {
  const slice = (from: number, to: number) => { let offset = 0; return content.flatMap(n => { const base = offset; offset += n.text.length; const text = n.text.slice(Math.max(0,from-base),Math.max(0,Math.min(n.text.length,to-base))); return text ? [{ ...n,text }] : []; }); };
  let remaining = 4000;
  const limited = [...slice(0,start), ...inserted, ...slice(end,Infinity)].flatMap(n => {
    const text = [...n.text].slice(0,remaining).join(""); remaining -= [...text].length;
    return text ? [{...n,text}] : [];
  });
  return limited.reduce<RichContent>((runs,run)=>{
    const marks=normalizedMarks(run.marks), last=runs.at(-1);
    if(last && JSON.stringify(last.marks)===JSON.stringify(marks)) last.text+=run.text;
    else runs.push({text:run.text,marks});
    return runs;
  },[]);
}
export function telegramContent(content: RichContent): string[] {
  const parsed = contentSchema.parse(content);
  const parts: string[] = []; let part = "";
  for (const node of parsed) {
    const marks = normalizedMarks(node.marks);
    const open = marks.map(m => m.type === "link" ? `<a href="${escape(m.href!)}">` : `<${tags[m.type]}>`).join("");
    const close = [...marks].reverse().map(m => `</${tags[m.type]}>`).join("");
    // Bound encoded HTML too, and close every entity at each split boundary.
    let text = "";
    for (const char of node.text) {
      const escaped = escape(char);
      if (part.length + open.length + text.length + escaped.length + close.length > 3900) {
        if (text) part += open + text + close;
        if (part) parts.push(part);
        part = ""; text = "";
      }
      text += escaped;
    }
    if (text) part += open + text + close;
  }
  if (part) parts.push(part);
  return parts;
}
export type TelegramEntity = { type: string; offset: number; length: number; url?: string };
export function fromTelegram(text: string, entities: TelegramEntity[] = []): RichContent {
  const map: Record<string, RichMark["type"]> = { bold: "bold", italic: "italic", underline: "underline", strikethrough: "strike", code: "code", pre: "code", blockquote: "blockquote", text_link: "link", url: "link" };
  const boundaries = new Set([0, text.length]);
  const valid = entities.filter(e => Number.isInteger(e.offset) && Number.isInteger(e.length) && e.offset >= 0 && e.length > 0 && e.offset + e.length <= text.length && map[e.type]);
  for (const e of valid) { boundaries.add(e.offset); boundaries.add(e.offset + e.length); }
  const sorted = [...boundaries].sort((a,b) => a-b);
  return sorted.slice(0,-1).map((start,i) => ({ text: text.slice(start,sorted[i+1]), marks: normalizedMarks(valid.filter(e => e.offset <= start && e.offset + e.length >= sorted[i+1]).map(e => ({ type: map[e.type], ...(map[e.type] === "link" ? { href: e.url ?? text.slice(e.offset,e.offset+e.length) } : {}) }))) }));
}

// Linkify plain HTTP(S)/www URLs without permitting script or data schemes.
export function linkedContent(content: RichContent): RichContent {
  return content.flatMap(run => {
    if (run.marks.some(mark=>mark.type==="link"||mark.type==="code")) return [run];
    const result: RichContent = []; let cursor=0;
    for (const match of run.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+/gi)) {
      const url=match[0].replace(/[.,!?;:)\]}]+$/g,""); const start=match.index!;
      if(start>cursor)result.push({text:run.text.slice(cursor,start),marks:run.marks});
      const href=url.startsWith("www.")?`https://${url}`:url;
      result.push({text:url,marks:safeLink(href)?[...run.marks,{type:"link",href}]:run.marks});cursor=start+url.length;
    }
    if(cursor<run.text.length)result.push({text:run.text.slice(cursor),marks:run.marks});return result.length?result:[run];
  });
}
