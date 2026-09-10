"use client";
import {useState} from "react";
import {browserLatexLibraries} from "@/features/latex/actions";
import {Button} from "@/components/ui/button";
import type {BrowserRender} from "@/features/latex/browser-render";
import {libraryCommands} from "@/features/latex/browser-libraries";
export default function CompiledLatex({source,mode="document",libraries}:{source:string;mode?:"math"|"document"|"asy";libraries?:{name:string;source:string}[]}){
 const [result,setResult]=useState<BrowserRender>({}),[busy,setBusy]=useState(false);
 async function render(){setBusy(true);setResult({});try{const files=libraries??await browserLatexLibraries();const commands=files.filter(f=>f.name.endsWith(".sty")).map(f=>libraryCommands(f.source)).join("\n");const {renderInBrowser}=await import("@/features/latex/browser-render");setResult(await renderInBrowser((mode==="asy"||source.includes("\\begin{asy}"))?source:commands+"\n"+source,mode));}catch(error){setResult({error:error instanceof Error?error.message:"Не удалось отобразить рисунок."});}finally{setBusy(false);}}
 return <span className="compiled-latex-view">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {result.image?<img className="compiled-latex" src={result.image} alt="Рисунок LaTeX"/>:result.html?<span className="chat-math is-block" dangerouslySetInnerHTML={{__html:result.html}}/>:<code className="latex-source">{source}</code>}
 <Button size="sm" variant="secondary" loading={busy} onClick={()=>void render()}>{result.image||result.html?"Обновить рисунок":"Отобразить LaTeX"}</Button>
 {result.error&&<span className="field-error" role="alert">{result.error}</span>}
 </span>;
}
