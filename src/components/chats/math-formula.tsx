"use client";
import { memo } from "react";
import { renderLatex } from "@/features/chats/latex";
import "katex/dist/katex.min.css";
import CompiledLatex from "./compiled-latex";
export default memo(function MathFormula({source,raw,display}:{source:string;raw:string;display?:boolean}){
 const html=renderLatex(source,display);
 return html===null?<span><span className="sr-only">{raw}</span><CompiledLatex key={source} source={source} mode="math"/></span>:<span className={display?"chat-math is-block":"chat-math"} dangerouslySetInnerHTML={{__html:html}}/>;
});
