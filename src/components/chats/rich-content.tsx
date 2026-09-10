"use client";
import dynamic from "next/dynamic";
import { Fragment, memo, lazy, Suspense, type ReactNode } from "react";
import CompiledLatex from "./compiled-latex";
import {renderableBlocks} from "@/features/latex/blocks";
const MathFormula=lazy(()=>import("./math-formula"));
const CodeBlock=dynamic(()=>import("./code-block"),{ssr:false});
import { linkedContent, normalizedMarks, markdownDocument, latexSegments, type RichContent, type RichRuns } from "@/features/chats/rich-text";
function MathText({text}:{text:string}){return <>{latexSegments(text).map((part,i)=>{
 if(part.source===undefined)return <Fragment key={i}>{part.text}</Fragment>;
 return <Suspense key={i} fallback={<span>{part.text}</span>}><MathFormula source={part.source} raw={part.text} display={part.display}/></Suspense>;
 })}</>;}
function Runs({content}:{content:RichRuns}){return <>{linkedContent(content).map((run,i)=>{
 let node:ReactNode=run.marks.some(m=>m.type==="code")?run.text:<MathText text={run.text}/>;
 for(const mark of normalizedMarks(run.marks).reverse())switch(mark.type){case "bold":node=<strong>{node}</strong>;break;case "italic":node=<em>{node}</em>;break;case "underline":node=<u>{node}</u>;break;case "strike":node=<s>{node}</s>;break;case "code":node=<code>{node}</code>;break;case "blockquote":node=<span className="chat-quote">{node}</span>;break;case "link":node=<a href={mark.href} target="_blank" rel="noopener noreferrer">{node}</a>;break;}
 return <Fragment key={i}>{node}</Fragment>;
 })}</>;}
export const RichMessage=memo(function RichMessage({content}:{content:RichContent}){return <div className="chat-rich-document">{renderableBlocks(markdownDocument(content).blocks).map((b,i)=>{
 if("source" in b)return <CompiledLatex key={`${i}:${b.source}`} source={b.source} mode={b.mode}/>;
 if(b.type==="code_block"){
 return <Suspense key={i} fallback={<pre><code>{b.text}</code></pre>}><CodeBlock text={b.text} language={b.language}/></Suspense>;
 }
 if("items" in b){const Tag=b.type==="ordered_list"?"ol":"ul";return <Tag key={i}>{b.items.map((item,j)=><li key={j}><Runs content={item.content}/></li>)}</Tag>;}
 if(b.type==="blockquote")return <blockquote key={i}><Runs content={b.content}/></blockquote>;
 return <div key={i} style={{textAlign:b.align}}><Runs content={b.content}/></div>;
 })}</div>;});
