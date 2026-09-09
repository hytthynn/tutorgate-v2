import { z } from "zod";

export const markTypes = ["bold", "italic", "underline", "strike", "code", "link", "blockquote"] as const;
const markSchema = z.object({ type: z.enum(markTypes), href: z.string().max(2048).optional() }).strict().refine(m => m.type !== "link" || safeLink(m.href));
const legacySchema = z.array(z.object({ text: z.string().max(8000), marks: z.array(markSchema).max(7) }).strict()).max(4000).refine(c => [...c.map(n => n.text).join("")].length <= 4000);
export type RichRuns = z.infer<typeof legacySchema>;
export type RichMark = RichRuns[number]["marks"][number];
export function safeLink(value?: string): boolean {
  if (!value || /[\u0000-\u0020]/.test(value)) return false;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}
export const plainText = (c: RichContent): string => Array.isArray(c) ? c.map(n => n.text).join("") : c.blocks.map(blockText).join("\n");
export const plainContent = (text: string): RichRuns => [{ text, marks: [] }];
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tags = { bold: "b", italic: "i", underline: "u", strike: "s", code: "code", link: "a", blockquote: "blockquote" };
export function normalizedMarks(marks: RichMark[]): RichMark[] {
  // Telegram code cannot contain other entities; keep a deterministic subset.
  if (marks.some(m => m.type === "code")) return [{ type: "code" }];
  return (["blockquote", ...markTypes.filter(t => t !== "blockquote")] as RichMark["type"][]).flatMap(type => { const mark = marks.find(m => m.type === type); return mark && (type !== "link" || safeLink(mark.href)) ? [mark] : []; });
}
export function spliceContent(content: RichRuns, start: number, end: number, inserted: RichRuns): RichRuns {
  const slice = (from: number, to: number) => { let offset = 0; return content.flatMap(n => { const base = offset; offset += n.text.length; const text = n.text.slice(Math.max(0,from-base),Math.max(0,Math.min(n.text.length,to-base))); return text ? [{ ...n,text }] : []; }); };
  let remaining = 4000;
  const limited = [...slice(0,start), ...inserted, ...slice(end,Infinity)].flatMap(n => {
    const text = [...n.text].slice(0,remaining).join(""); remaining -= [...text].length;
    return text ? [{...n,text}] : [];
  });
  return limited.reduce<RichRuns>((runs,run)=>{
    const marks=normalizedMarks(run.marks), last=runs.at(-1);
    if(last && JSON.stringify(last.marks)===JSON.stringify(marks)) last.text+=run.text;
    else runs.push({text:run.text,marks});
    return runs;
  },[]);
}
function telegramRuns(parsed: RichRuns, outerOpen = "", outerClose = ""): string[] {
  const parts: string[] = []; let part = "";
  for (const node of parsed) {
    const marks = normalizedMarks(node.marks);
    const open = outerOpen + marks.map(m => m.type === "link" ? `<a href="${escape(m.href!)}">` : `<${tags[m.type]}>`).join("");
    const close = [...marks].reverse().map(m => `</${tags[m.type]}>`).join("") + outerClose;
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
export type TelegramEntity = { type: string; offset: number; length: number; url?: string; language?: string };
function telegramInline(text: string, entities: TelegramEntity[] = []): RichRuns {
  const map: Record<string, RichMark["type"]> = { bold: "bold", italic: "italic", underline: "underline", strikethrough: "strike", code: "code", pre: "code", blockquote: "blockquote", text_link: "link", url: "link" };
  const boundaries = new Set([0, text.length]);
  const valid = entities.filter(e => Number.isInteger(e.offset) && Number.isInteger(e.length) && e.offset >= 0 && e.length > 0 && e.offset + e.length <= text.length && map[e.type]);
  for (const e of valid) { boundaries.add(e.offset); boundaries.add(e.offset + e.length); }
  const sorted = [...boundaries].sort((a,b) => a-b);
  return sorted.slice(0,-1).map((start,i) => ({ text: text.slice(start,sorted[i+1]), marks: normalizedMarks(valid.filter(e => e.offset <= start && e.offset + e.length >= sorted[i+1]).map(e => ({ type: map[e.type], ...(map[e.type] === "link" ? { href: e.url ?? text.slice(e.offset,e.offset+e.length) } : {}) }))) }));
}

// Linkify plain HTTP(S)/www URLs without permitting script or data schemes.
export function linkedContent(content: RichRuns): RichRuns {
  return content.flatMap(run => {
    if (run.marks.some(mark=>mark.type==="link"||mark.type==="code")) return [run];
    const result: RichRuns = []; let cursor=0;
    for (const match of run.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+/gi)) {
      const url=match[0].replace(/[.,!?;:)\]}]+$/g,""); const start=match.index!;
      if(start>cursor)result.push({text:run.text.slice(cursor,start),marks:run.marks});
      const href=url.startsWith("www.")?`https://${url}`:url;
      result.push({text:url,marks:safeLink(href)?[...run.marks,{type:"link",href}]:run.marks});cursor=start+url.length;
    }
    if(cursor<run.text.length)result.push({text:run.text.slice(cursor),marks:run.marks});return result.length?result:[run];
  });
}

const runsSchema = z.array(z.object({text:z.string().max(8000),marks:z.array(markSchema.refine(m=>m.type!=="blockquote")).max(7)}).strict()).max(4000);
export const languageSchema = z.string().max(40).regex(/^[A-Za-z0-9_+#.-]+$/).transform(s=>s.toLowerCase());
const blockSchema = z.discriminatedUnion("type",[
 z.object({type:z.literal("paragraph"),align:z.enum(["left","center","right"]),content:runsSchema}).strict(),
 z.object({type:z.literal("blockquote"),content:runsSchema}).strict(),
 z.object({type:z.literal("code_block"),language:languageSchema.optional(),text:z.string().max(8000)}).strict(),
 z.object({type:z.enum(["bullet_list","ordered_list"]),items:z.array(z.object({content:runsSchema}).strict()).max(500)}).strict(),
]);
export type RichBlock = z.infer<typeof blockSchema>;
export type RichDocumentV2 = {version:2;blocks:RichBlock[]};
export type RichContent = RichRuns | RichDocumentV2;
export function blockText(b:RichBlock):string { return b.type==="code_block" ? b.text : "items" in b ? b.items.map(i=>plainText(i.content)).join("\n") : plainText(b.content); }
export function normalizeDocument(c:RichContent):RichDocumentV2 {
 if(!Array.isArray(c)) return c;
 // Promote legacy quote styling to its paragraph without changing its plain text.
 const quote=c.some(r=>r.marks.some(m=>m.type==="blockquote"));
 const content=c.map(r=>({text:r.text,marks:r.marks.filter(m=>m.type!=="blockquote")}));
 return {version:2,blocks:c.length?[quote?{type:"blockquote",content}:{type:"paragraph",align:"left",content}]:[]};
}
const documentSchema=z.object({version:z.literal(2),blocks:z.array(blockSchema).max(500)}).strict();
export const contentSchema=z.union([legacySchema,documentSchema]).transform(normalizeDocument).transform(markdownDocument).refine(c=>[...plainText(c)].length<=4000);
export const parseRichContent=(input:unknown):RichDocumentV2=>contentSchema.parse(input);
export const parseRichDocument=parseRichContent;
export function fromTelegram(text:string,entities:TelegramEntity[]=[]):RichDocumentV2 {
 const blocks:RichBlock[]=[];let cursor=0;
 for(const e of entities.filter(e=>e.type==="pre"&&Number.isInteger(e.offset)&&Number.isInteger(e.length)&&e.offset>=0&&e.length>0&&e.offset+e.length<=text.length).sort((a,b)=>a.offset-b.offset)){
 if(e.offset<cursor)continue;
 const add=(start:number,end:number)=>{if(end>start)blocks.push({type:"paragraph",align:"left",content:telegramInline(text.slice(start,end),entities.filter(n=>n.offset>=start&&n.offset+n.length<=end).map(n=>({...n,offset:n.offset-start})))});};
 add(cursor,e.offset);const lang=languageSchema.safeParse(e.language);
 blocks.push({type:"code_block",text:text.slice(e.offset,e.offset+e.length).replace(/\r\n/g,"\n"),...(lang.success?{language:lang.data}:{})});cursor=e.offset+e.length;
 }
 if(cursor<text.length)blocks.push(...normalizeDocument(telegramInline(text.slice(cursor),entities.filter(e=>e.offset>=cursor).map(e=>({...e,offset:e.offset-cursor})))).blocks);
 return {version:2,blocks};
}
export function telegramContent(content:RichContent):string[]{
 const doc=parseRichContent(content),parts:string[]=[];
 const append=(part:string)=>{const last=parts.at(-1);if(last!==undefined&&last.length+part.length+1<=3900)parts[parts.length-1]=last+"\n"+part;else parts.push(part);};
 for(const b of doc.blocks){let chunks:string[];
 if(b.type==="code_block")chunks=telegramRuns(plainContent(b.text),b.language?`<pre><code class="language-${escape(b.language)}">`:"<pre>",b.language?"</code></pre>":"</pre>");
 else if("items" in b)chunks=b.items.flatMap((item,i)=>telegramRuns([{text:b.type==="ordered_list"?`${i+1}. `:"• ",marks:[]},...item.content]));
 else chunks=telegramRuns(b.content,b.type==="blockquote"?"<blockquote>":"",b.type==="blockquote"?"</blockquote>":"");
 for(const c of chunks)append(c);
 }return parts;
}
function inlineCodeRuns(runs:RichRuns):RichRuns {
 return runs.flatMap(run=>{
 if(run.marks.some(m=>m.type==="code"))return [run];
 const result:RichRuns=[];let cursor=0;
 for(const match of run.text.matchAll(/`([^`\n]+)`/g)){if(match.index!>cursor)result.push({text:run.text.slice(cursor,match.index),marks:run.marks});result.push({text:match[1],marks:[{type:"code"}]});cursor=match.index!+match[0].length;}
 if(cursor<run.text.length)result.push({text:run.text.slice(cursor),marks:run.marks});return result.length?result:[run];
 });
}
/** Recognize fences only outside existing code; preserve code whitespace. */
export function markdownDocument(input:RichContent):RichDocumentV2 {
 const doc=normalizeDocument(input);
 return {version:2,blocks:doc.blocks.flatMap((b):RichBlock[]=>{
 if(b.type==="code_block")return [b];
 if("items" in b)return [{...b,items:b.items.map(i=>({content:inlineCodeRuns(i.content)}))}];
 if(b.type==="blockquote"||b.content.some(r=>r.marks.length))return [{...b,content:inlineCodeRuns(b.content)}];
 const text=plainText(b.content).replace(/\r\n/g,"\n"),blocks:RichBlock[]=[];let cursor=0;
 const paragraph=(t:string)=>{const runs:RichRuns=[];let from=0;for(const m of t.matchAll(/`([^`\n]+)`/g)){if(m.index!>from)runs.push({text:t.slice(from,m.index),marks:[]});runs.push({text:m[1],marks:[{type:"code"}]});from=m.index!+m[0].length;}if(from<t.length)runs.push({text:t.slice(from),marks:[]});if(t)blocks.push({...b,content:runs});};
 for(const m of text.matchAll(/^```([A-Za-z0-9_+#.-]{0,40})[ \t]*\n([\s\S]*?)^```[ \t]*(?:\n|$)/gm)){paragraph(text.slice(cursor,m.index));blocks.push({type:"code_block",...(m[1]?{language:m[1].toLowerCase()}:{}),text:m[2]});cursor=m.index!+m[0].length;}
 paragraph(text.slice(cursor));return blocks.length?blocks:[b];
 })};
}
export function latexSegments(text:string):{text:string;source?:string;display?:boolean}[]{
 const result:{text:string;source?:string;display?:boolean}[]=[];let cursor=0;
 const pattern=/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/g;
 for(const m of text.matchAll(pattern)){if(m.index!>cursor)result.push({text:text.slice(cursor,m.index)});result.push({text:m[0],source:m[1]??m[2]??m[3]??m[4],display:m[1]!==undefined||m[2]!==undefined});cursor=m.index!+m[0].length;}
 if(cursor<text.length)result.push({text:text.slice(cursor)});return result;
}
