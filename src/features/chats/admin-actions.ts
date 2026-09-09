"use server";
import {z} from "zod";
import {requireRole} from "@/lib/auth/access";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {CHAT_BUCKET} from "./attachments";
import type {ChatResult,ChatSnapshot,ChatMessage} from "./types";
export async function adminChatSnapshot(owner:string,student:string|null):Promise<ChatResult<ChatSnapshot&{ownerName:string}>>{
 await requireRole("admin");try{z.uuid().parse(owner);z.uuid().nullable().parse(student);const {data,error}=await(await createClient()).rpc("admin_chat_snapshot",{p_owner:owner,p_student:student});if(error)throw error;return {data};}catch{return {error:"Чаты репетитора недоступны."};}
}
export async function adminChatPrevious(owner:string,student:string,before:string,id:string):Promise<ChatResult<ChatMessage[]>>{
 await requireRole("admin");try{z.uuid().parse(owner);z.uuid().parse(student);z.uuid().parse(id);z.iso.datetime({offset:true}).parse(before);const {data,error}=await(await createClient()).rpc("admin_chat_previous",{p_owner:owner,p_student:student,p_before:before,p_id:id});if(error)throw error;return {data};}catch{return {error:"Не удалось загрузить историю."};}
}
export async function adminChatAttachmentUrl(owner:string,id:string):Promise<ChatResult<string>>{
 await requireRole("admin");try{z.uuid().parse(owner);z.uuid().parse(id);const {data,error}=await(await createClient()).rpc("admin_chat_attachment",{p_owner:owner,p_id:id});if(error||!data)throw new Error("Forbidden");const result=await createAdminClient().storage.from(CHAT_BUCKET).createSignedUrl(data.storage_path,60,{download:data.original_name});if(result.error)throw result.error;return {data:result.data.signedUrl};}catch{return {error:"Вложение недоступно."};}
}
