"use client";
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { readBillingRate,saveBillingRate } from "@/features/schedule/rate-actions";
import type { SaveState } from "@/features/schedule/types";
export function RateDialog({owner,name,lesson,onClose,onSaveState,autoOpen=false}:{autoOpen?:boolean;owner:string;name:string;lesson?:string;onClose?:()=>void;onSaveState?:(state:SaveState)=>void}){
 const [open,setOpen]=useState(autoOpen),[busy,setBusy]=useState(autoOpen),[loaded,setLoaded]=useState(false),[value,setValue]=useState(""),[fallback,setFallback]=useState(0),[error,setError]=useState("");
 async function show(){setBusy(true);try{const data=await readBillingRate(owner,lesson);setValue(data.rate===null?"":String(data.rate));setFallback(data.fallback);setLoaded(true);setOpen(true);}catch{toast.error("Не удалось загрузить ставку.");}finally{setBusy(false);}}
 useEffect(()=>{if(!autoOpen)return;let disposed=false;void readBillingRate(owner,lesson).then(data=>{if(!disposed){setValue(data.rate===null?"":String(data.rate));setFallback(data.fallback);setLoaded(true);setOpen(true);}}).catch(()=>toast.error("Не удалось загрузить ставку.")).finally(()=>{if(!disposed)setBusy(false);});return ()=>{disposed=true;};},[autoOpen,owner,lesson]);
 async function save(reset=false){setBusy(true);setError("");onSaveState?.("saving");try{const result=await saveBillingRate(owner,reset||value===""?null:Number(value),lesson);if(result.fieldError){setError(result.fieldError);onSaveState?.("error");return;}if(result.error){toast.error(result.error);onSaveState?.("error");return;}onSaveState?.("saved");toast.success(lesson?"Личная ставка сохранена.":"Ставка репетитора сохранена.");setOpen(false);onClose?.();}catch{onSaveState?.("error");toast.error("Не удалось сохранить ставку.");}finally{setBusy(false);}}
 return <>
 {!autoOpen&&<Button size="icon" variant="ghost" className="person-rate-button" aria-label="Ставка" title={`Ставка: ${name}`} loading={busy&&!open} onClick={()=>void show()}><Settings size={16} aria-hidden/></Button>}
 <Dialog open={open} onOpenChange={v=>{if(!busy){setOpen(v);if(!v)onClose?.();}}}>
 <DialogContent className="rate-dialog">
 <DialogTitle>{lesson?"Личная ставка":"Ставка репетитора"}</DialogTitle>
 <DialogDescription>{name}</DialogDescription>
 <div className="rate-summary"><span>{lesson?"Ставка для пары репетитор + ученик":"Персональная ставка преподавателя"}</span><p>{lesson?"Применяется ко всем ещё не проведённым занятиям этой пары.":"Укажите свою ставку или используйте общую."}</p>{loaded&&<strong>По умолчанию: {fallback.toLocaleString("ru-RU")} ₽/час</strong>}</div>
 {loaded?<form className="rate-form" noValidate onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="settings-field"><span>Ставка за час</span><div className="rate-input-wrap"><input aria-label="Ставка, ₽/час" aria-invalid={!!error} type="number" min="0" max="1000000" step="0.01" value={value} onChange={e=>setValue(e.target.value)} placeholder={String(fallback)} disabled={busy}/><span>₽ / час</span></div><small>От 0 до 1 000 000 ₽. Пустое поле — ставка по умолчанию.</small></label>
 {error&&<p className="field-error" role="alert">{error}</p>}
 <div className="settings-dialog-actions"><Button type="button" variant="secondary" disabled={busy} onClick={()=>void save(true)}>Сбросить</Button><Button loading={busy}>Сохранить</Button></div>
 </form>:<Button loading={busy} loadingText="Загрузка ставки…" onClick={()=>void show()}>Повторить загрузку</Button>}
 </DialogContent></Dialog></>;
}
