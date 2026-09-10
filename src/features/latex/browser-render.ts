import {renderLatex} from "@/features/chats/latex";
import {asymptoteToSvg} from "./simple-asymptote";
export type BrowserRender={html?:string;image?:string;error?:string};
const cache=new Map<string,BrowserRender>();
let queue=Promise.resolve();
/** Raster-style SVG image context + whitelist: TeX output never becomes executable page markup. */
async function safeSvg(html:string,attributes:Record<string,string>){
 const parsed=new DOMParser().parseFromString(html,"text/html"),svg=parsed.querySelector("svg");
 if(!svg)throw new Error("Рисунок не получен. Проверьте поддерживаемые команды.");
 const tags=new Set("svg g path defs clipPath use rect line polyline polygon circle ellipse text tspan foreignObject span div".toLowerCase().split(" "));
 for(const element of [svg,...svg.querySelectorAll("*")]){
  if(!tags.has(element.tagName.toLowerCase())){element.remove();continue;}
  for(const attr of [...element.attributes])if(/^on/i.test(attr.name)||["src","srcset"].includes(attr.name)||(/href$/.test(attr.name)&&!attr.value.startsWith("#"))||(/url\s*\(|@import|expression\s*\(/i.test(attr.value)&&!/^url\(#[\w-]+\)$/.test(attr.value)))element.removeAttribute(attr.name);
 }
 for(const name of ["width","height","viewBox"])if(attributes[name]&&/^[\d.\s+-]+(?:pt)?$/.test(attributes[name]))svg.setAttribute(name,attributes[name]);
 svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
 const fonts=[...new Set([...svg.querySelectorAll("[style]")].flatMap(el=>[...el.getAttribute("style")!.matchAll(/font-family:\s*['"]?([a-z]+\d+)/g)].map(m=>m[1])))];
 const css=await Promise.all(fonts.slice(0,20).map(async font=>{const response=await fetch(`/vendor/tikzjax/fonts/${font}.ttf`,{credentials:"omit"});if(!response.ok)throw new Error("Не удалось загрузить шрифт рисунка.");const bytes=new Uint8Array(await response.arrayBuffer());let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);return `@font-face{font-family:${font};src:url(data:font/ttf;base64,${btoa(raw)})}`;}));
 const style=document.createElementNS("http://www.w3.org/2000/svg","style");style.textContent=css.join("\n");svg.prepend(style);
 return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
function tikz(source:string):Promise<BrowserRender>{return new Promise(resolve=>{
 const worker=new Worker("/vendor/tikzjax/worker.js");
 let done=false;
 const finish=(result:BrowserRender)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();resolve(result);};
 const timedOut=()=>finish({error:"Рисунок слишком сложный или команда не поддерживается. Упростите код."});
 let timer=setTimeout(timedOut,60000);
 worker.onerror=()=>finish({error:"Не удалось обработать рисунок в браузере."});
 worker.onmessage=async event=>{try{const data=event.data;if(data.phase==="compile"){clearTimeout(timer);timer=setTimeout(timedOut,20000);return;}if(data.error)return finish({error:`Ошибка TikZ: ${String(data.error).slice(0,500)}`});if(typeof data.html!=="string"||data.html.length>2_000_000)throw new Error("Рисунок слишком большой.");finish({image:await safeSvg(data.html,data.attributes??{})});}catch(error){finish({error:String(error)});}};
 worker.postMessage(source);
});}
export async function renderInBrowser(source:string,mode:"math"|"document"|"asy"="document"):Promise<BrowserRender>{
 if(!source.trim()||source.length>16000)return {error:"Код: от 1 до 16 000 символов."};
 const key=mode+":"+source;if(cache.has(key))return cache.get(key)!;
 let result:BrowserRender;
 if(mode==="asy"||/\\begin\{asy\}/.test(source)){try{result={image:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(asymptoteToSvg(source))};}catch(error){result={error:error instanceof Error?error.message:"Ошибка Asymptote."};}}
 else if(mode==="math"||!source.includes("\\begin{tikz")){
  const math=source.replace(/\\(?:newcommand|renewcommand)\*?\s*\{\\([A-Za-z]+)\}\s*(?:\[([0-9])\]\s*)?\{/g,(_,name:string,count:string)=>`\\def\\${name}${Array.from({length:Number(count??0)},(_,i)=>`#${i+1}`).join("")}{`).replace(/\\begin\{(?:tabular|longtable)\}/g,"\\begin{array}").replace(/\\end\{(?:tabular|longtable)\}/g,"\\end{array}").replace(/\\(?:toprule|midrule|bottomrule)\b/g,"\\hline");
  const html=renderLatex(math,true);result=html?{html}:{error:"Эта команда не поддерживается браузерным LaTeX. Используйте формулы, array/tabular или TikZ."};
 }else{
  let release!:()=>void;const previous=queue;queue=new Promise<void>(resolve=>release=resolve);await previous;
  try{result=await tikz(source);}finally{release();}
 }
 if(!result.error){if(cache.size>=30)cache.delete(cache.keys().next().value!);cache.set(key,result);}
 return result;
}
