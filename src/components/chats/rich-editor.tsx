"use client";
import { useDeferredValue, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bold, Italic, Underline, Strikethrough, Quote, Code, ListOrdered, List, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { normalizedMarks, normalizeDocument, markdownDocument, plainContent, plainText, contentSchema, type RichContent, type RichRuns, type RichDocumentV2 } from "@/features/chats/rich-text";
import { pasteContent } from "./paste-content";
import { RichMessage } from "./rich-content";
const subscribeHydration=()=>()=>{};
const selectionElement=()=>{const node=window.getSelection()?.anchorNode;return node instanceof Element?node:node?.parentElement;};
const controls=[["bold","Жирный",Bold],["italic","Курсив",Italic],["underline","Подчёркивание",Underline],["strikeThrough","Зачёркивание",Strikethrough],["quote","Цитата",Quote],["code","Код",Code],["insertOrderedList","Нумерованный список",ListOrdered],["insertUnorderedList","Маркированный список",List],["justifyLeft","По левому краю",AlignLeft],["justifyCenter","По центру",AlignCenter],["justifyRight","По правому краю",AlignRight],["undo","Отменить",Undo2],["redo","Вернуть",Redo2]] as const;
function fragment(value:RichContent){
 const result=document.createDocumentFragment();
 const runs=(content:RichRuns)=>{const f=document.createDocumentFragment();for(const run of content){let node:Node=document.createTextNode(run.text);for(const mark of normalizedMarks(run.marks).reverse()){const el=document.createElement(({bold:"strong",italic:"em",underline:"u",strike:"s",code:"code",link:"a",blockquote:"blockquote"})[mark.type]);if(mark.type==="link")el.setAttribute("href",mark.href!);el.append(node);node=el;}f.append(node);}return f;};
 for(const b of normalizeDocument(value).blocks){const el=document.createElement(b.type==="code_block"?"pre":b.type==="blockquote"?"blockquote":b.type==="ordered_list"?"ol":b.type==="bullet_list"?"ul":"div");
 if(b.type==="code_block"){el.textContent=b.text;if(b.language)el.dataset.language=b.language;}
 else if("items" in b)for(const item of b.items){const li=document.createElement("li");li.append(runs(item.content));if(!li.textContent)li.append(document.createElement("br"));el.append(li);}
 else{el.append(runs(b.content));if(b.type==="paragraph")el.style.textAlign=b.align;}
 if(!el.childNodes.length)el.append(document.createElement("br"));result.append(el);
 }return result;
}
export function RichEditor({value,onChange,disabled,onSend,onFiles}:{value:RichContent;onChange:(value:RichContent)=>void;disabled:boolean;onSend:()=>void;onFiles:(files:File[])=>void}){
 const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false),previewValue=useDeferredValue(value);
 const ref=useRef<HTMLDivElement>(null),emitted=useRef(""),history=useRef<RichDocumentV2[]>([]),index=useRef(-1),composing=useRef(false);
 const [active,setActive]=useState<string[]>([]),[revision,setRevision]=useState(0),[canUndo,setCanUndo]=useState(false),[canRedo,setCanRedo]=useState(false);
 const paint=(doc:RichContent)=>ref.current?.replaceChildren(fragment(doc));
 useLayoutEffect(()=>{const signature=JSON.stringify(value);if(signature!==emitted.current){paint(value);emitted.current=signature;history.current=[normalizeDocument(value)];index.current=0;queueMicrotask(()=>{if(emitted.current===signature){setCanUndo(false);setCanRedo(false);setActive([]);}});}},[value]);
 function record(doc:RichDocumentV2){if(JSON.stringify(history.current[index.current])!==JSON.stringify(doc)){history.current=history.current.slice(0,index.current+1);history.current.push(doc);if(history.current.length>100)history.current.shift();index.current=history.current.length-1;}emitted.current=JSON.stringify(doc);onChange(doc);setRevision(n=>n+1);setCanUndo(index.current>0);setCanRedo(index.current<history.current.length-1);}
 function read(){return pasteContent(ref.current?.innerHTML??"");}
 function sync(){const doc=read();const valid=contentSchema.safeParse(doc);if(!valid.success){toast.error("Сообщение: максимум 4000 символов.");paint(history.current[index.current]??value);return;}record(doc);}
 function undo(direction:number){const next=index.current+direction;if(next<0||next>=history.current.length)return;index.current=next;const doc=history.current[next];paint(doc);emitted.current=JSON.stringify(doc);onChange(doc);setRevision(n=>n+1);setCanUndo(index.current>0);setCanRedo(index.current<history.current.length-1);ref.current?.focus();}
 function format(command:string){ref.current?.focus();if(command==="undo"||command==="redo"){undo(command==="undo"?-1:1);return;}
 const currentBlock=selectionElement()?.closest("pre,li,blockquote");
 if(command.startsWith("justify")&&currentBlock)return;
 if(command==="quote"||command==="code"){const parent=selectionElement();const existing=parent?.closest(command==="code"?"pre":"blockquote");
 if(existing&&ref.current?.contains(existing)){
 const paragraph=document.createElement("div");
 if(command==="code")paragraph.textContent=existing.textContent;else paragraph.append(...existing.childNodes);
 existing.replaceWith(paragraph);const range=document.createRange();range.selectNodeContents(paragraph);range.collapse(false);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
 }else document.execCommand("formatBlock",false,command==="code"?"pre":"blockquote");}
 else document.execCommand(command,false);
 sync();setActive(current=>current.includes(command)?current.filter(c=>c!==command):[...current,command]);
 }
 function insert(doc:RichContent){const selection=window.getSelection();if(!selection||!ref.current)return;if(!selection.rangeCount||!ref.current.contains(selection.anchorNode)){ref.current.focus();const end=document.createRange();end.selectNodeContents(ref.current);end.collapse(false);selection.removeAllRanges();selection.addRange(end);}const range=selection.getRangeAt(0);range.deleteContents();const f=fragment(doc),last=f.lastChild;range.insertNode(f);if(last){range.setStartAfter(last);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}sync();}
 return <div className="rich-editor" data-history-revision={revision}>
 <div className="rich-toolbar" role="toolbar" aria-label="Форматирование сообщения">{controls.map(([command,label,Icon])=><Button key={command} type="button" variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={active.includes(command)} disabled={!hydrated||disabled||(command==="undo"&&!canUndo)||(command==="redo"&&!canRedo)} onMouseDown={e=>e.preventDefault()} onClick={()=>format(command)}><Icon size={16} aria-hidden/></Button>)}</div>
 <div ref={ref} id="chat-message" className="rich-input" role="textbox" aria-label="Сообщение ученику" aria-multiline="true" aria-disabled={!hydrated||disabled} aria-describedby="chat-composer-help" contentEditable={hydrated&&!disabled} suppressContentEditableWarning data-placeholder="Напишите сообщение…"
 onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;sync();}} onInput={()=>{if(!composing.current)sync();}}
 onPaste={e=>{e.preventDefault();if(e.clipboardData.files.length){onFiles([...e.clipboardData.files]);return;}const html=e.clipboardData.getData("text/html"),text=e.clipboardData.getData("text/plain").replace(/\r\n/g,"\n");if(html)insert(pasteContent(html));else if(text.includes("```"))insert(markdownDocument(plainContent(text)));else{document.execCommand("insertText",false,text);sync();}}}
 onDrop={e=>e.preventDefault()}
 onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo(e.shiftKey?1:-1);return;}if((e.ctrlKey||e.metaKey)&&["b","i","u"].includes(e.key.toLowerCase())){e.preventDefault();format(e.key.toLowerCase()==="b"?"bold":e.key.toLowerCase()==="i"?"italic":"underline");return;}
 if(e.key==="Enter"&&!e.nativeEvent.isComposing){const parent=selectionElement();const block=parent?.closest("li,pre,blockquote");if(block?.tagName==="PRE"){e.preventDefault();document.execCommand("insertText",false,"\n");sync();}else if(!block&&!e.shiftKey){e.preventDefault();onSend();}}}}/>
 {plainText(value)&&<div className="chat-live-preview" aria-label="Предпросмотр сообщения"><small>Предпросмотр</small><RichMessage content={previewValue}/></div>}
 </div>;
}
