import katex from "katex";
export function renderLatex(source:string,display=false):string|null {
 try{return katex.renderToString(source,{displayMode:display,throwOnError:true,trust:false,strict:"error",maxExpand:200,maxSize:20,output:"htmlAndMathml"});}catch{return null;}
}
