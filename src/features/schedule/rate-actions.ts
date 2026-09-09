"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { resolveScheduleOwner } from "./queries";
import { billingRateSchema } from "./rates";
export async function readBillingRate(owner:string,lesson?:string){
 await requireRole("admin");z.uuid().parse(owner);const db=await createClient();
 if(lesson)await resolveScheduleOwner(owner);
 const [global,tutor]=await Promise.all([db.from("app_settings").select("hourly_rate").eq("id",true).single(),db.from("tutor_billing_rates").select("hourly_rate").eq("tutor_id",owner).maybeSingle()]);
 if(global.error||tutor.error)throw new Error("Не удалось загрузить ставку.");
 let pair:number|null=null;
 if(lesson){z.uuid().parse(lesson);const row=await db.from("lessons").select("student_id").eq("id",lesson).eq("tutor_id",owner).single();if(row.error)throw new Error("Занятие недоступно.");const result=await db.from("tutor_student_billing_rates").select("hourly_rate").eq("tutor_id",owner).eq("student_id",row.data.student_id).maybeSingle();if(result.error)throw new Error("Не удалось загрузить ставку.");pair=result.data?Number(result.data.hourly_rate):null;}
 const custom=tutor.data?Number(tutor.data.hourly_rate):null;
 return {rate:lesson?pair:custom,fallback:lesson?(custom??Number(global.data.hourly_rate)):Number(global.data.hourly_rate)};
}
export async function saveBillingRate(owner:string,rate:unknown,lesson?:string){
 await requireRole("admin");
 const validation=billingRateSchema.nullable().safeParse(rate);if(!validation.success)return {fieldError:"Введите ставку от 0 до 1 000 000 ₽, не более двух знаков после запятой."};
 try{z.uuid().parse(owner);const parsed=validation.data,db=await createClient();if(lesson){z.uuid().parse(lesson);const context=await resolveScheduleOwner(owner);const result=await db.rpc("admin_set_tutor_student_rate",{p_owner:context.ownerId,p_lesson:lesson,p_rate:parsed});if(result.error)throw result.error;}else{const result=await db.rpc("admin_set_tutor_rate",{p_tutor:owner,p_rate:parsed});if(result.error)throw result.error;}return {ok:true};}catch{return {error:"Не удалось сохранить ставку. Проверьте доступность участника и попробуйте ещё раз."};}
}
