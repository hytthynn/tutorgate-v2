"use client";
import {useState} from "react";
import {compileLatex} from "@/features/latex/actions";
import {Button} from "@/components/ui/button";
export default function CompiledLatex({source,mode="document"}:{source:string;mode?:"math"|"document"|"asy"}){
 const [image,setImage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 return <span className="compiled-latex-view">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {image?<img className="compiled-latex" src={image} alt="Рисунок LaTeX"/>:<code className="latex-source">{source}</code>}
 <Button size="sm" variant="secondary" loading={busy} onClick={async()=>{setBusy(true);setError("");try{const result=await compileLatex(source,mode);if(result.error)setError(result.error);else setImage(result.image!);}finally{setBusy(false);}}}>{image?"Обновить рисунок":"Отобразить LaTeX"}</Button>
 {error&&<span className="field-error" role="alert">{error}</span>}
 </span>;
}
