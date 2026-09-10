"use client";
import {useState,useSyncExternalStore} from "react";
import {saveLatexConfig,compileLatex} from "@/features/latex/actions";
import {type LatexConfig,latexConfigSchema} from "@/features/latex/config";
import {Button} from "@/components/ui/button";
import {toast} from "@/components/ui/toaster";
const subscribeHydration=()=>()=>{};
export function LatexForm({initial,connected}:{initial:LatexConfig;connected:boolean}){
 const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
 const [packages,setPackages]=useState(initial.packages.join(", ")),[preamble,setPreamble]=useState(initial.preamble),[libraries,setLibraries]=useState(initial.libraries),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [sample,setSample]=useState(String.raw`\begin{tikzpicture}
\draw[->] (0,0) -- (3,0) node[right] {$x$};
\draw[->] (0,0) -- (0,2) node[above] {$y$};
\draw (0,0) parabola (2,1);
\end{tikzpicture}`),[image,setImage]=useState(""),[testing,setTesting]=useState(false);
 async function save(){setError("");const config={packages:packages.split(/[\s,]+/).filter(Boolean),preamble,libraries};if(!latexConfigSchema.safeParse(config).success){setError("До 60 пакетов, 8 библиотек .sty/.asy и 16 000 символов в каждом файле или преамбуле; всего до 120 КБ UTF-8. Имена — латиница, цифры, дефис.");return false;}setBusy(true);try{const result=await saveLatexConfig(config);if(result.error){setError(result.error);return false;}toast.success("Настройки LaTeX сохранены.");return true;}finally{setBusy(false);}}
 return <section className="panel settings-panel latex-settings"><h2>LaTeX и рисунки</h2><p>Английский и русский языки подключены. Формулы, TikZ/PGFPlots, Asymptote и таблицы используют общие настройки.</p><p role="status">{connected?"Сервис компиляции настроен.":"Сервис компиляции пока не подключён."}</p>
 <label>Пакеты LaTeX<textarea disabled={!hydrated} aria-label="Пакеты LaTeX" rows={4} value={packages} onChange={e=>setPackages(e.target.value)}/></label><small>Имена через запятую. Для своего пакета загрузите .sty, затем добавьте его имя без расширения.</small>
 <label>Преамбула и команды<textarea disabled={!hydrated} aria-label="Преамбула и команды" rows={6} maxLength={16000} spellCheck={false} value={preamble} onChange={e=>setPreamble(e.target.value)}/></label><small>Например: {String.raw`\newcommand{\R}{\mathbb{R}}`}. Библиотеки TikZ подключаются через {String.raw`\usetikzlibrary{…}`}.</small>
 <label>Добавить библиотеки (.sty, .asy)<input disabled={!hydrated} aria-label="Добавить библиотеки LaTeX" type="file" accept=".sty,.asy" multiple onChange={async e=>{const files=[...(e.target.files??[])];e.target.value="";if(files.length+libraries.length>8||files.some(f=>f.size>64000)){setError("До 8 библиотек, максимум 16 000 символов на файл.");return;}const added=await Promise.all(files.map(async f=>({name:f.name,source:await f.text()})));const result=[...libraries,...added];if(!latexConfigSchema.safeParse({packages:[],preamble:"",libraries:result}).success){setError("Недопустимое имя, повторяющаяся библиотека или слишком большой файл.");return;}setError("");setLibraries(result);}}/></label>
 {libraries.map(file=><div className="latex-library" key={file.name}><span>{file.name}</span><Button variant="ghost" size="sm" onClick={()=>setLibraries(old=>old.filter(f=>f.name!==file.name))}>Удалить {file.name}</Button></div>)}
 {error&&<p className="field-error" role="alert">{error}</p>}<Button loading={busy} disabled={testing||!hydrated} onClick={()=>void save()}>Сохранить LaTeX</Button>
 <label>Проверить рисунок<textarea disabled={!hydrated} aria-label="Код для проверки LaTeX" rows={7} maxLength={16000} value={sample} spellCheck={false} onChange={e=>{setSample(e.target.value);setImage("");}}/></label><small>В чате можно использовать {String.raw`\begin{asy}…\end{asy}`}, {String.raw`\begin{tikzpicture}…\end{tikzpicture}`} или блок кода с языком latex/asy.</small>
 <Button variant="secondary" loading={testing} disabled={busy||!connected||!hydrated} onClick={async()=>{setTesting(true);setImage("");try{if(!await save())return;const result=await compileLatex(sample);if(result.error)setError(result.error);else setImage(result.image!);}finally{setTesting(false);}}}>Сохранить и проверить</Button>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {image&&<img className="compiled-latex" src={image} alt="Результат компиляции LaTeX"/>}
 </section>;
}
