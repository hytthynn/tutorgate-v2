import { latexSegments, normalizedMarks, parseRichContent, type RichContent, type RichRuns } from "./rich-text";
import { renderLatex } from "./latex";

// Bot API InputRichMessage / RichText. Structured data never interprets user HTML.
export type TelegramRichText = string | TelegramRichText[] | { type:string; text?:TelegramRichText; expression?:string; url?:string };
export type TelegramRichBlock = {type:string; text?:TelegramRichText; expression?:string; language?:string; blocks?:TelegramRichBlock[]; items?:{blocks:TelegramRichBlock[];value?:number;type?:string}[]; cells?:{text:TelegramRichText;align:string;valign:string}[][]};
export function telegramRichMessage(content:RichContent,tutorName:string):{blocks:TelegramRichBlock[]}|null {
 const doc=parseRichContent(content);
 const hasMath=(runs:RichRuns)=>runs.some(run=>!run.marks.some(m=>m.type==="code")&&latexSegments(run.text).some(s=>s.source!==undefined));
 if(!doc.blocks.some(b=>b.type==="paragraph"&&b.align!=="left"||b.type!=="code_block"&&("items" in b?b.items.some(i=>hasMath(i.content)):hasMath(b.content))))return null;
 function inline(runs:RichRuns):TelegramRichText {return runs.map(run=>{
  let text:TelegramRichText=run.marks.some(m=>m.type==="code")?run.text:latexSegments(run.text).map(segment=>segment.source!==undefined&&renderLatex(segment.source,segment.display)!==null?{type:"mathematical_expression",expression:segment.source}:segment.text);
  for(const mark of normalizedMarks(run.marks).reverse())text={type:mark.type==="strike"?"strikethrough":mark.type==="link"?"url":mark.type,text,...(mark.type==="link"?{url:mark.href}:{})};
  return text;
 });}
 const blocks:TelegramRichBlock[]=[{type:"paragraph",text:{type:"bold",text:`💬 Сообщение от репетитора\n${tutorName}`}}];
 for(const b of doc.blocks){
  if(b.type==="code_block"){blocks.push({type:"pre",text:b.text,...(b.language?{language:b.language}:{})});continue;}
  if("items" in b){blocks.push({type:"list",items:b.items.map((item,i)=>({blocks:[{type:"paragraph",text:inline(item.content)}],...(b.type==="ordered_list"?{value:i+1,type:"1"}:{})}))});continue;}
  const text=inline(b.content);
  if(b.type==="blockquote"){blocks.push({type:"blockquote",blocks:[{type:"paragraph",text}]});continue;}
  if(b.align!=="left"){blocks.push({type:"table",cells:[[{text,align:b.align,valign:"top"}]]});continue;}
  // Standalone display formulas get a real math block, not an inline entity.
  if(b.content.length===1&&!b.content[0].marks.length){const segments=latexSegments(b.content[0].text);if(segments.length===1&&segments[0].display&&segments[0].source&&renderLatex(segments[0].source,true)!==null){blocks.push({type:"mathematical_expression",expression:segments[0].source});continue;}}
  blocks.push({type:"paragraph",text});
 }
 return {blocks};
}
