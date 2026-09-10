"use server";
import {requireRole} from "@/lib/auth/access";
import {createClient} from "@/lib/supabase/server";
import {latexConfigSchema} from "./config";
import {libraryCommands} from "./browser-libraries";
export async function saveLatexConfig(value:unknown){
 await requireRole("admin");
 const parsed=latexConfigSchema.safeParse(value);
 if(!parsed.success)return {error:"Проверьте имена и размер библиотек."};
 try{for(const file of parsed.data.libraries){if(!file.name.endsWith(".sty"))throw new Error("В браузере поддерживаются библиотеки команд .sty.");libraryCommands(file.source);}}catch(error){return {error:error instanceof Error?error.message:"Недопустимая библиотека."};}
 const {error}=await(await createClient()).rpc("latex_settings_save",{p_config:{...parsed.data,preamble:""}});
 return error?{error:"Не удалось сохранить настройки LaTeX."}:{ok:true};
}
export async function browserLatexLibraries(){
 await requireRole(["admin","tutor"]);
 const {data,error}=await(await createClient()).rpc("latex_settings_read");
 if(error)return [];
 const parsed=latexConfigSchema.safeParse(data);
 return parsed.success?parsed.data.libraries.filter(file=>file.name.endsWith(".sty")):[];
}
