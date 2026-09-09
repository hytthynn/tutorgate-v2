"use client";
import {useRef,useState,useCallback} from "react";
import {adminChatSnapshot,adminChatPrevious} from "@/features/chats/admin-actions";
import type {ChatSnapshot} from "@/features/chats/types";
import {useVisiblePolling} from "@/features/chats/use-visible-polling";
import {RichMessage} from "./rich-content";
import {MessageFile} from "./attachments";
import {plainContent} from "@/features/chats/rich-text";
import {Button} from "@/components/ui/button";
export function AdminChatView({owner,initial,student}:{owner:string;initial:ChatSnapshot;student:string|null}){
 const [snapshot,setSnapshot]=useState(initial),[selected,setSelected]=useState(student),[search,setSearch]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const loading=useRef(false),request=useRef(0),selectedRef=useRef(student),history=useRef<HTMLDivElement>(null);
 const refresh=useCallback(async()=>{if(loading.current)return;const target=selectedRef.current,id=++request.current;const result=await adminChatSnapshot(owner,target);if(id!==request.current)return;if(result.error){setError(result.error);return;}setError("");setSnapshot(old=>{const same=old.conversations.find(c=>c.studentId===target)?.conversationId===result.data!.conversations.find(c=>c.studentId===target)?.conversationId;return same?{...result.data!,hasMore:old.hasMore,messages:[...new Map([...old.messages,...result.data!.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))}:result.data!;});},[owner]);
 useVisiblePolling(refresh);
 async function choose(id:string){loading.current=true;selectedRef.current=id;setSelected(id);setBusy(true);setSnapshot(old=>({...old,messages:[],hasMore:false}));const version=++request.current;const result=await adminChatSnapshot(owner,id);if(version!==request.current)return;loading.current=false;setBusy(false);if(result.error)setError(result.error);else{setError("");setSnapshot(result.data!);const url=new URL(location.href);url.searchParams.set("student",id);window.history.replaceState(null,"",url);}}
 const current=snapshot.conversations.find(c=>c.studentId===selected);
 return <section className="panel chat-layout" aria-label="Чаты репетитора">
 <aside className="chat-directory"><label className="chat-search"><input aria-label="Поиск диалогов" placeholder="Найти ученика" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="chat-contacts">{snapshot.conversations.filter(c=>c.studentName.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))).map(c=><button className={`chat-contact ${c.studentId===selected?"is-selected":""}`} key={c.studentId} aria-pressed={c.studentId===selected} onClick={()=>void choose(c.studentId)}><span className="chat-contact-content"><strong>{c.studentName}</strong><small>{c.lastMessage??"Нет сообщений"}</small></span></button>)}</div>{!snapshot.conversations.length&&<p className="chat-empty">Нет доступных диалогов.</p>}</aside>
 <div className="chat-conversation"><header className="chat-heading"><h2>{current?.studentName??"Выберите диалог"}</h2></header>{error&&<p role="alert" className="field-error">{error}</p>}
 <div ref={history} className="chat-history" role="region" aria-label="История сообщений">
 {snapshot.hasMore&&selected&&snapshot.messages[0]&&<Button loading={busy} variant="secondary" onClick={async()=>{const first=snapshot.messages[0],target=selected;setBusy(true);const result=await adminChatPrevious(owner,target,first.created_at,first.id);if(selectedRef.current===target){if(result.error)setError(result.error);else setSnapshot(old=>({...old,hasMore:result.data!.length===200,messages:[...result.data!,...old.messages]}));setBusy(false);}}}>Предыдущие сообщения</Button>}
 {!busy&&current&&!snapshot.messages.length&&<p className="chat-empty">Сообщений пока нет.</p>}
 {snapshot.messages.map(m=><article key={m.id} className={`chat-bubble ${m.sender_role==="tutor"?"is-tutor":"is-student"}`} aria-label={m.sender_role==="tutor"?"Сообщение репетитора":"Сообщение ученика"}>{m.body&&<RichMessage content={m.content??plainContent(m.body)}/>} {m.attachments?.map(file=><MessageFile key={file.id} file={file} owner={owner}/>)}<footer>{m.sender_role==="tutor"?"Репетитор":"Ученик"} · {new Date(m.created_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"})}</footer></article>)}
 </div><p className="admin-chat-readonly">Просмотр переписки. Отметки прочтения репетитора не изменяются.</p></div>
 </section>;
}
