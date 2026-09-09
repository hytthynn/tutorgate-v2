/** Derive toolbar state from the actual selection, never from previous clicks. */
export function selectionFormatting(root:HTMLElement):string[]|null {
 const selection=window.getSelection();if(!selection?.rangeCount||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return null;
 const range=selection.getRangeAt(0),elements:Element[]=[];
 if(range.collapsed){const n=selection.anchorNode;elements.push(n instanceof Element?n:n!.parentElement!);}
 else {const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null;while((node=walker.nextNode()))if(node.textContent&&range.intersectsNode(node)&&!(node===range.startContainer&&range.startOffset===node.textContent.length)&&!(node===range.endContainer&&range.endOffset===0))elements.push(node.parentElement!);}
 if(!elements.length)elements.push(root);
 const ancestors=(el:Element)=>{const result:Element[]=[];while(root.contains(el)&&el!==root){result.push(el);el=el.parentElement!;}return result;};
 const all=(test:(el:Element)=>boolean)=>elements.every(test),active:string[]=[];
 for(const [command,tag,style] of [["bold","B,STRONG","bold"],["italic","I,EM","italic"],["underline","U","underline"],["strikeThrough","S,STRIKE,DEL","line-through"]]){
  const applied=range.collapsed?document.queryCommandState(command):all(el=>ancestors(el).some(n=>n.matches(tag)||(style==="bold"?Number(getComputedStyle(n).fontWeight)>=600:style==="italic"?getComputedStyle(n).fontStyle==="italic":getComputedStyle(n).textDecorationLine.includes(style))));
  if(applied)active.push(command);
 }
 for(const [command,selector] of [["quote","blockquote"],["code","pre,code"],["insertOrderedList","ol"],["insertUnorderedList","ul"]])if(all(el=>!!el.closest(selector)&&root.contains(el.closest(selector))))active.push(command);
 if(!active.some(c=>["quote","code","insertOrderedList","insertUnorderedList"].includes(c)))for(const [command,align] of [["justifyLeft","left"],["justifyCenter","center"],["justifyRight","right"]])if(all(el=>{const value=getComputedStyle(el).textAlign;return value===align||(align==="left"&&value==="start");}))active.push(command);
 return active;
}
