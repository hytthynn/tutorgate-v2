"use client";
import {useState,useSyncExternalStore} from "react";
import {saveLatexConfig} from "@/features/latex/actions";
import {type LatexConfig} from "@/features/latex/config";
import {libraryCommands} from "@/features/latex/browser-libraries";
import {Button} from "@/components/ui/button";
import {toast} from "@/components/ui/toaster";
import CompiledLatex from "@/components/chats/compiled-latex";
const subscribeHydration=()=>()=>{};
export function LatexForm({initial}:{initial:LatexConfig}){
 const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
 const [libraries,setLibraries]=useState(initial.libraries),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [sample,setSample]=useState(String.raw`\begin{tikzpicture}
\draw[->] (0,0) -- (3,0) node[right] {$x$};
\draw[->] (0,0) -- (0,2) node[above] {$y$};
\draw[thick] (0,0) parabola (2,1);
\end{tikzpicture}`);
 return <section className="panel settings-panel latex-settings"><h2>LaTeX и рисунки</h2><p>Формулы, таблицы и TikZ отображаются прямо в браузере. Устанавливать сервер компиляции не требуется.</p>
 <div className="latex-capabilities"><span>Формулы и матрицы</span><span>Русский и английский текст</span><span>TikZ</span><span>Базовый Asymptote 2D</span></div>
 <p>Asymptote: точки, линии, окружности, заливка и подписи. Произвольные программы, 3D и все пакеты TeX не поддерживаются.</p>
 <label>Добавить библиотеку команд (.sty)<input disabled={!hydrated||busy} aria-label="Добавить библиотеки LaTeX" type="file" accept=".sty" onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{if(libraries.length>=8||file.size>64000||!/^\w[\w-]*\.sty$/.test(file.name))throw new Error("До 8 библиотек .sty с именем латиницей.");if(libraries.some(f=>f.name===file.name))throw new Error("Библиотека с таким именем уже добавлена.");const source=await file.text();if(source.length>16000)throw new Error("Максимум 16 000 символов.");libraryCommands(source);setLibraries(old=>[...old,{name:file.name,source}]);setError("");}catch(err){setError(err instanceof Error?err.message:"Не удалось прочитать библиотеку.");}}}/></label>
 <small>Поддерживаются библиотеки с определениями newcommand, renewcommand и providecommand.</small>
 {libraries.map(file=><div className="latex-library" key={file.name}><span>{file.name}</span><Button disabled={busy} variant="ghost" size="sm" onClick={()=>setLibraries(old=>old.filter(f=>f.name!==file.name))}>Удалить {file.name}</Button></div>)}
 {error&&<p className="field-error" role="alert">{error}</p>}
 <Button loading={busy} disabled={!hydrated} onClick={async()=>{setBusy(true);setError("");try{const result=await saveLatexConfig({...initial,preamble:"",libraries});if(result.error)setError(result.error);else toast.success("Настройки LaTeX сохранены.");}finally{setBusy(false);}}}>Сохранить LaTeX</Button>
 <label>Проверить рисунок<textarea disabled={!hydrated} aria-label="Код для проверки LaTeX" rows={7} maxLength={16000} spellCheck={false} value={sample} onChange={e=>setSample(e.target.value)}/></label>
 <CompiledLatex key={sample} source={sample} libraries={libraries}/>
 </section>;
}
