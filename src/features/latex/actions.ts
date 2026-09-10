"use server";
import {requireRole} from "@/lib/auth/access";
import {createClient} from "@/lib/supabase/server";
import {latexConfigSchema,latexSourceSchema} from "./config";
export async function saveLatexConfig(value:unknown){
 await requireRole("admin");
 const parsed=latexConfigSchema.safeParse(value);
 if(!parsed.success)return {error:"Проверьте имена пакетов, библиотек и длину преамбулы."};
 const {error}=await(await createClient()).rpc("latex_settings_save",{p_config:parsed.data});
 return error?{error:"Не удалось сохранить настройки LaTeX."}:{ok:true};
}
export async function compileLatex(source:string,mode:"math"|"document"|"asy"="document"):Promise<{image?:string;error?:string}>{
 await requireRole(["admin","tutor"]);
 if(!latexSourceSchema.safeParse(source).success||!["math","document","asy"].includes(mode))return {error:"Код LaTeX: от 1 до 16 000 символов."};
 const endpoint=process.env.LATEX_RENDER_URL,token=process.env.LATEX_RENDER_TOKEN;
 if(!endpoint||!token)return {error:"Сервис компиляции LaTeX ещё не подключён. Обратитесь к администратору."};
 try{
  const {data,error}=await(await createClient()).rpc("latex_settings_read");
  if(error)throw error;
  const config=latexConfigSchema.parse(data);
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({source,mode,config}),signal:AbortSignal.timeout(50000),cache:"no-store"});
  if(!response.ok)return {error:response.status===429?"Компилятор занят. Повторите чуть позже.":"Сервис компиляции недоступен."};
  const result=await response.json();
  if(typeof result.image==="string"&&result.image.length<8_000_000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.image))return {image:result.image};
  return {error:typeof result.error==="string"?result.error.slice(0,1500):"Не удалось скомпилировать рисунок."};
 }catch{return {error:"Не удалось скомпилировать LaTeX. Проверьте подключение сервиса и настройки."};}
}
