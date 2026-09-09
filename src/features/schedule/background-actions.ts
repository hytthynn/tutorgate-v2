"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createAdminClient,serviceRpc } from "@/lib/supabase/admin";
import { detectedMedia } from "@/features/chats/attachments";
import { BACKGROUND_BUCKET,validateBackground } from "./background";
import { readBackground,cleanupBackgrounds } from "./background-service";
async function self(owner:string){const actor=await requireRole(["tutor","admin"]);z.uuid().parse(owner);if(owner!==actor.id)throw new Error("Фон можно менять только в собственном расписании.");return actor;}
export async function prepareScheduleBackgroundUpload(owner:string,size:number,type:string){
 const actor=await self(owner);validateBackground(size,type);const id=crypto.randomUUID();const path=await serviceRpc<string>("schedule_background_prepare",{p_actor:actor.id,p_owner:owner,p_id:id,p_size:size});const result=await createAdminClient().storage.from(BACKGROUND_BUCKET).createSignedUploadUrl(path,{upsert:false});if(result.error)throw new Error("Не удалось подготовить загрузку.");return {id,url:result.data.signedUrl};
}
export async function finalizeScheduleBackgroundUpload(owner:string,id:string){
 const actor=await self(owner);z.uuid().parse(id);const args={p_actor:actor.id,p_owner:owner,p_id:id};const upload=await serviceRpc<{storage_path:string;claimed_size:number}|null>("schedule_background_upload",args);if(!upload)throw new Error("Загрузка недоступна.");
 const storage=createAdminClient().storage.from(BACKGROUND_BUCKET);
 try{const file=await storage.download(upload.storage_path);if(file.error)throw file.error;const type=detectedMedia(new Uint8Array(await file.data.slice(0,32).arrayBuffer()))??"";validateBackground(file.data.size,type);if(file.data.size!==Number(upload.claimed_size))throw new Error("Размер файла изменился.");
 await serviceRpc("schedule_background_set",{...args,p_mime:type});
 }catch(error){ // Check committed state before collecting an upload after an uncertain RPC response.
 const remaining=await serviceRpc<unknown>("schedule_background_upload",args);if(remaining)await storage.remove([upload.storage_path]);throw error;}
 // Durable GC retains failed removals for the next cleanup run.
 await cleanupBackgrounds().catch(()=>{});return readBackground(owner);
}
export async function removeScheduleBackground(owner:string){const actor=await self(owner);await serviceRpc("schedule_background_set",{p_actor:actor.id,p_owner:owner,p_id:null,p_mime:null});await cleanupBackgrounds().catch(()=>{});return null;}
export async function refreshScheduleBackgroundUrl(owner:string){await requireRole(["tutor","admin"]);z.uuid().parse(owner);return readBackground(owner);}
