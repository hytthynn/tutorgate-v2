"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, Quote, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizedMarks, plainText, spliceContent, type RichContent, type RichMark } from "@/features/chats/rich-text";
import { pasteContent } from "./paste-content";
const controls = { bold: ["Жирный", Bold], italic: ["Курсив", Italic], underline: ["Подчёркивание", Underline], strike: ["Зачёркивание", Strikethrough], blockquote: ["Цитата", Quote], code: ["Моноширинный", Code] } as const;
type Style = keyof typeof controls;
const tags: Record<RichMark["type"], string> = { bold:"strong", italic:"em", underline:"u", strike:"s", blockquote:"span", code:"code", link:"a" };
export function RichEditor({ value, onChange, disabled, onSend, onFiles }: { value: RichContent; onChange: (value: RichContent) => void; disabled: boolean; onSend: () => void; onFiles: (files: File[]) => void }) {
  const ref = useRef<HTMLDivElement>(null), emitted = useRef(""), composing = useRef(false);
  const selection = useRef({start:0,end:0});
  const [active, setActive] = useState<Style[]>([]);
  function locate() {
    const el = ref.current, selected = window.getSelection();
    if (!el || !selected?.rangeCount || !el.contains(selected.anchorNode) || !el.contains(selected.focusNode)) return selection.current;
    const range = selected.getRangeAt(0), before = range.cloneRange(); before.selectNodeContents(el); before.setEnd(range.startContainer,range.startOffset);
    const start = before.toString().length;
    return selection.current = {start,end:start+range.toString().length};
  }
  function restore(start: number, end = start) {
    const el = ref.current; if (!el) return;
    el.focus(); const walker = document.createTreeWalker(el,NodeFilter.SHOW_TEXT), nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const point = (offset:number): [Node,number] => {
      for (const node of nodes) { if (offset <= node.length) return [node,offset]; offset -= node.length; }
      return [el,el.childNodes.length];
    };
    const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
    const selected = window.getSelection(); selected?.removeAllRanges(); selected?.addRange(range); selection.current = {start,end};
  }
  function paint(content: RichContent) {
    const el = ref.current; if (!el) return;
    const fragment = document.createDocumentFragment();
    for (const run of content) {
      let node: Node = document.createTextNode(run.text);
      for (const mark of normalizedMarks(run.marks).reverse()) {
        const wrapper = document.createElement(tags[mark.type]);
        if (mark.type === "link") { wrapper.setAttribute("href",mark.href!); wrapper.setAttribute("rel","noopener noreferrer"); }
        if (mark.type === "blockquote") { wrapper.className = "chat-quote"; wrapper.dataset.quote = "true"; }
        wrapper.appendChild(node); node = wrapper;
      }
      fragment.appendChild(node);
    }
    if (plainText(content).endsWith("\n")) { const caret=document.createElement("br");caret.dataset.caret="true";fragment.appendChild(caret); }
    el.replaceChildren(fragment);
  }
  useLayoutEffect(() => {
    const signature = JSON.stringify(value);
    if (signature !== emitted.current) { paint(value); emitted.current = signature; }
  }, [value]);
  function commit(next: RichContent, start?: number, end?: number) {
    emitted.current = JSON.stringify(next); paint(next); onChange(next);
    if (start !== undefined) restore(start,end ?? start);
  }
  function read(): RichContent {
    const el = ref.current; if (!el) return [];
    // Read and whitelist the DOM. Pasted HTML is never inserted directly.
    return spliceContent([],0,0,pasteContent(el.innerHTML));
  }
  function syncStyles() {
    const {start} = locate(); let offset=0;
    const run=read().find(run=>{offset+=run.text.length;return offset>=start;});
    setActive((run?.marks ?? []).filter(mark=>mark.type!=="link").map(mark=>mark.type as Style));
  }
  function format(type: Style) {
    const {start,end} = locate();
    if (start === end) { setActive(active.includes(type) ? active.filter(mark=>mark!==type) : [...active,type]); ref.current?.focus(); return; }
    let offset = 0;
    const pieces = value.flatMap(run => {
      const base = offset; offset += run.text.length;
      const cuts = [0,Math.max(0,Math.min(run.text.length,start-base)),Math.max(0,Math.min(run.text.length,end-base)),run.text.length];
      return [...new Set(cuts)].sort((a,b)=>a-b).slice(0,-1).map((from,i,all) => ({text:run.text.slice(from,all[i+1] ?? run.text.length),marks:run.marks,selected:base+from>=start && base+from<end})).filter(run=>run.text);
    });
    const remove = pieces.filter(run=>run.selected).every(run=>run.marks.some(mark=>mark.type===type));
    const next = pieces.map(run=>({text:run.text,marks:run.selected ? normalizedMarks([...run.marks.filter(mark=>mark.type!==type),...(remove?[]:[{type}])]) : run.marks}));
    setActive(remove ? active.filter(mark=>mark!==type) : [...active,type]); commit(next,start,end);
  }
  function insert(content: RichContent) {
    const {start,end} = locate(), next = spliceContent(read(),start,end,content);
    commit(next,Math.min(plainText(next).length,start+plainText(content).length));
  }
  return <div className="rich-editor">
    <div className="rich-toolbar" role="toolbar" aria-label="Форматирование сообщения">{(Object.keys(controls) as Style[]).map(type => {const [label,Icon]=controls[type];return <Button key={type} type="button" variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={active.includes(type)} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>format(type)}><Icon size={16} aria-hidden /></Button>;})}</div>
    <div ref={ref} id="chat-message" className="rich-input" role="textbox" aria-label="Сообщение ученику" aria-multiline="true" aria-disabled={disabled} aria-describedby="chat-composer-help" contentEditable={!disabled} suppressContentEditableWarning data-placeholder="Напишите сообщение…"
      onMouseUp={()=>syncStyles()} onKeyUp={event=>{if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key)) syncStyles();else locate();}}
      onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;const next=read();emitted.current=JSON.stringify(next);onChange(next);}}
      onInput={()=>{if(composing.current)return;const position=locate();const next=read();emitted.current=JSON.stringify(next);onChange(next);if(plainText(next).length < (ref.current?.textContent?.length ?? 0))commit(next,Math.min(position.end,plainText(next).length));}}
      onPaste={event=>{event.preventDefault();if(event.clipboardData.files.length){onFiles(Array.from(event.clipboardData.files));return;}const html=event.clipboardData.getData("text/html");insert(html?pasteContent(html):[{text:event.clipboardData.getData("text/plain"),marks:[]}]);}}
      onDrop={event=>{event.preventDefault();}}
      onBeforeInput={event=>{const input=event.nativeEvent as InputEvent;if(!composing.current&&input.data&&(!input.inputType||input.inputType==="insertText")){event.preventDefault();insert([{text:input.data,marks:active.map(type=>({type}))}]);}}}
      onKeyDown={event=>{
        if((event.ctrlKey||event.metaKey)&&["b","i","u"].includes(event.key.toLowerCase())){event.preventDefault();format(event.key.toLowerCase()==="b"?"bold":event.key.toLowerCase()==="i"?"italic":"underline");}
        if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();if(event.shiftKey)insert([{text:"\n",marks:[]}]);else onSend();}
      }} />
  </div>;
}
