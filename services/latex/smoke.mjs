// Integration smoke: requires the real renderer, never substitutes fixture output.
import assert from "node:assert/strict";
const config={packages:["amsmath","amssymb","tikz","pgfplots","asymptote","booktabs","tabularx","xparse"],preamble:String.raw`\newcommand{\R}{\mathbb{R}}`,libraries:[]};
const samples=[
 ["Russian and English","document",String.raw`Русский текст и English. $x\in\R$`],
 ["TikZ","document",String.raw`\begin{tikzpicture}\draw (0,0) circle (1);\end{tikzpicture}`],
 ["Table","document",String.raw`\begin{tabular}{ll}\toprule Имя & Value \\\midrule Проверка & 42 \\\bottomrule\end{tabular}`],
 ["Asymptote","asy","size(120); draw(unitsquare);"],
];
for(const [name,mode,source] of samples){const response=await fetch(process.env.LATEX_RENDER_URL??"http://127.0.0.1:3201/render",{method:"POST",headers:{Authorization:`Bearer ${process.env.LATEX_RENDER_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({config,source,mode}),signal:AbortSignal.timeout(50000)});assert.equal(response.status,200);const result=await response.json();assert.ok(result.image?.startsWith("data:image/png;base64,"),`${name}: ${result.error}`);const png=Buffer.from(result.image.split(",")[1],"base64");assert.ok(png.length>100);assert.equal(png.subarray(1,4).toString(),"PNG");console.log(`PASS ${name}`);}
