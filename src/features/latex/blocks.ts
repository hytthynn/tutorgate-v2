import {blockText,type RichBlock} from "@/features/chats/rich-text";
export type LatexBlock={source:string;mode:"document"|"asy"};
/** Fold complete standalone environments across editor paragraphs without changing stored content. */
export function renderableBlocks(blocks:RichBlock[]):(RichBlock|LatexBlock)[]{
 const result:(RichBlock|LatexBlock)[]=[];
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i];
  if(block.type==="code_block"&&["tex","latex","tikz","asy","asymptote"].includes(block.language??"")){result.push({source:block.text,mode:["asy","asymptote"].includes(block.language!)?"asy":"document"});continue;}
  const start=block.type==="paragraph"&&blockText(block).match(/^\s*\\begin\{(asy|tikzpicture|tabular\*?|tabularx|longtable|align\*?|gather\*?|equation\*?)\}/);
  if(start){let source=blockText(block),end=i;const close=`\\end{${start[1]}}`;while(!source.includes(close)&&end+1<blocks.length&&blocks[end+1].type==="paragraph")source+="\n"+blockText(blocks[++end]);if(source.trimEnd().endsWith(close)){result.push({source,mode:"document"});i=end;continue;}}
  result.push(block);
 }
 return result;
}
