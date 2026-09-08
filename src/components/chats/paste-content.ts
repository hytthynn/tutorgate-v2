import { normalizedMarks, type RichContent, type RichMark } from "@/features/chats/rich-text";

/** Read a detached document; never insert pasted HTML into the live document. */
export function pasteContent(html: string): RichContent {
  const doc = new DOMParser().parseFromString(html.slice(0,100000),"text/html");
  const content: RichContent = [];
  const tags: Record<string,RichMark["type"]> = { B:"bold",STRONG:"bold",I:"italic",EM:"italic",U:"underline",S:"strike",STRIKE:"strike",DEL:"strike",CODE:"code",PRE:"code",A:"link",BLOCKQUOTE:"blockquote" };
  function walk(node: Node, marks: RichMark[]) {
    if (node.nodeType === Node.TEXT_NODE) { content.push({text:node.textContent ?? "",marks:normalizedMarks(marks)}); return; }
    if (!(node instanceof Element) || ["SCRIPT","STYLE","IFRAME","OBJECT","SVG","MATH","TEMPLATE"].includes(node.tagName)) return;
    if (node.tagName === "BR") { content.push({text:"\n",marks:[]}); return; }
    const mark = tags[node.tagName];
    const next = mark ? [...marks,{ type:mark,...(mark === "link" ? {href:node.getAttribute("href") ?? ""} : {}) }] : marks;
    for (const child of node.childNodes) walk(child,next);
    if (["P","DIV","BLOCKQUOTE","PRE","LI"].includes(node.tagName) && content.length && !content.at(-1)!.text.endsWith("\n")) content.push({text:"\n",marks:[]});
  }
  for(const child of doc.body.childNodes) walk(child,[]);
  return content;
}
