import { normalizedMarks, type RichRuns, type RichMark, type RichBlock, type RichDocumentV2 } from "@/features/chats/rich-text";
/** Read detached HTML through a semantic whitelist; never insert source HTML. */
export function pasteContent(html:string):RichDocumentV2 {
 const doc=new DOMParser().parseFromString(html.slice(0,100000),"text/html");
 const blocked=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","SVG","MATH","TEMPLATE","IMG","VIDEO","AUDIO"]);
 const tags:Record<string,RichMark["type"]>={B:"bold",STRONG:"bold",I:"italic",EM:"italic",U:"underline",S:"strike",STRIKE:"strike",DEL:"strike",CODE:"code",A:"link"};
 function inline(node:Node,marks:RichMark[]=[]):RichRuns {
 if(node.nodeType===Node.TEXT_NODE)return [{text:node.textContent??"",marks:normalizedMarks(marks)}];
 if(!(node instanceof Element)||blocked.has(node.tagName))return [];
 if(node.tagName==="BR")return [{text:"\n",marks:[]}];
 const mark=tags[node.tagName], next=mark?[...marks,{type:mark,...(mark==="link"?{href:node.getAttribute("href")??""}:{})}]:marks;
 return [...node.childNodes].flatMap(n=>inline(n,next));
 }
 const blocks:RichBlock[]=[];let pending:RichRuns=[];
 const codeText=(node:Node):string=>node.nodeType===Node.TEXT_NODE?node.textContent??"":node instanceof Element&&node.tagName==="BR"?"\n":[...node.childNodes].map((child,i,all)=>codeText(child)+(child instanceof Element&&["DIV","P","LI"].includes(child.tagName)&&i<all.length-1?"\n":"")).join("");
 const flush=()=>{if(pending.length){blocks.push({type:"paragraph",align:"left",content:pending});pending=[];}};
 function walk(node:Node){
 if(node instanceof Element){
 if(blocked.has(node.tagName))return;
 if(node.tagName==="PRE"){flush();const language=(node.getAttribute("data-language")??node.querySelector("code")?.className.replace(/^language-/,""))?.slice(0,40);blocks.push({type:"code_block",text:codeText(node).replace(/\r\n/g,"\n"),...(language&&/^[A-Za-z0-9_+#.-]+$/.test(language)?{language:language.toLowerCase()}:{})});return;}
 if(["UL","OL"].includes(node.tagName)){flush();blocks.push({type:node.tagName==="OL"?"ordered_list":"bullet_list",items:[...node.children].filter(n=>n.tagName==="LI").slice(0,500).map(n=>({content:inline(n)}))});return;}
 if(node.tagName==="BLOCKQUOTE"){flush();blocks.push({type:"blockquote",content:inline(node)});return;}
 if(["P","DIV"].includes(node.tagName)){flush();if(node.querySelector("p,div,pre,ul,ol,blockquote")){for(const child of node.childNodes)walk(child);flush();}else{const align=(node as HTMLElement).style.textAlign;blocks.push({type:"paragraph",align:align==="center"||align==="right"?align:"left",content:inline(node)});}return;}
 }
 pending.push(...inline(node));
 }
 for(const node of doc.body.childNodes)walk(node);flush();return {version:2,blocks:blocks.slice(0,500)};
}
