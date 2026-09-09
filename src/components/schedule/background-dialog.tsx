"use client";
import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { validateBackground,type ScheduleBackground } from "@/features/schedule/background";
import { prepareScheduleBackgroundUpload,finalizeScheduleBackgroundUpload,removeScheduleBackground } from "@/features/schedule/background-actions";
import type { SaveState } from "@/features/schedule/types";
import { MotionVideo } from "@/components/shared/motion-video";
/* eslint-disable @next/next/no-img-element */
export function BackgroundDialog({owner,background,onChange,onSaveState,disabled=false}:{disabled?:boolean;owner:string;background:ScheduleBackground|null;onChange:(b:ScheduleBackground|null)=>void;onSaveState:(s:SaveState)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function change(file:File|null){const previous=background;let preview="";setBusy(true);setError("");onSaveState("saving");try{if(file){validateBackground(file.size,file.type);preview=URL.createObjectURL(file);onChange({url:preview,kind:file.type.startsWith("video/")?"video":"image",mimeType:file.type});const upload=await prepareScheduleBackgroundUpload(owner,file.size,file.type);const response=await fetch(upload.url,{method:"PUT",headers:{"Content-Type":file.type},body:file});if(!response.ok)throw new Error("Не удалось загрузить фон.");onChange(await finalizeScheduleBackgroundUpload(owner,upload.id));}else {onChange(null);await removeScheduleBackground(owner);}onSaveState("saved");toast.success(file?"Фон сохранён.":"Фон удалён.");}catch(e){onChange(previous);onSaveState("error");setError(e instanceof Error?e.message:"Не удалось сохранить фон.");}finally{if(preview)URL.revokeObjectURL(preview);setBusy(false);}}
 return <><Button size="sm" variant="secondary" disabled={disabled} onClick={()=>setOpen(true)}>Фон</Button>
 <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="background-dialog">
 <DialogTitle>Фон расписания</DialogTitle><DialogDescription>Личный фон раздела. Изображение будет затемнено для удобного чтения.</DialogDescription>
 <div className="background-preview-frame">{background?(background.kind==="video"?<MotionVideo src={background.url} className="background-preview"/>:<img className="background-preview" src={background.url} alt="Текущий фон"/>):<div className="background-empty"><ImagePlus size={32}/><span>Выберите изображение или видео</span></div>}</div>
 <label className={`background-upload ${busy?"is-busy":""}`}><ImagePlus size={18}/><span>{busy?"Загрузка…":"Загрузить / заменить"}</span><input type="file" aria-label="Загрузить / заменить" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void change(file);e.target.value="";}}/></label>
 <p className="background-help">JPEG, PNG, WebP, GIF, MP4 или WebM · до 7 МБ</p>
 {error&&<p className="field-error" role="alert">{error}</p>}
 <div className="settings-dialog-actions"><Button loading={busy} disabled={!background} variant="secondary" onClick={()=>void change(null)}><Trash2 size={16}/>Удалить фон</Button><Button disabled={busy} onClick={()=>setOpen(false)}>Готово</Button></div>
 </DialogContent></Dialog></>;
}
