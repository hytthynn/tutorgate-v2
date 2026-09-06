import { test, expect } from "@playwright/test";
const f="http://127.0.0.1:54329/fixtures";
const tutor="00000000-0000-4000-8000-000000000002";
test.beforeEach(async({request})=>{
 await request.post(f+"/reset-schedule");
 await request.post(f+"/applications-reset");
});
test("return button is styled, keyboard accessible and fits desktop/mobile header",async({page})=>{
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("admin");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/admin/schedule",{timeout:15000});
 await page.goto(`/admin/schedule?tutor=${tutor}`);
 const back=page.getByRole("link",{name:"К репетиторам",exact:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await expect(back).toHaveClass(/button-secondary/);
  await expect(back).toBeVisible();await back.focus();await expect(back).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/return-button-${width}.png`,fullPage:true});
 }
 await back.press("Enter");await expect(page).toHaveURL("/admin/tutors");
});
test("bot controls edit one persistent message, preserve teacher Reply text and recover deleted panel",async({page,request})=>{
 let update=130000;
 const post=(data:object)=>request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data:{update_id:++update,...data}});
 const text=(text:string)=>post({message:{text,from:{id:100004},chat:{id:100004,type:"private"}}});
 const callback=(data:string,message_id=1)=>post({callback_query:{id:String(update),from:{id:100004},data,message:{message_id,chat:{id:100004,type:"private"}}}});
 const state=async()=>await(await request.get(f+"/applications-state")).json();
 expect((await text("/start")).ok()).toBe(true);
 const panel=(await state()).messages[0];
 for(const command of ["chat:choose",`chat:to:${tutor}`])expect((await callback(command)).ok()).toBe(true);
 expect((await text("Текст ученика")).ok()).toBe(true);
 for(const command of ["chat:cancel","chat:cancel","chat:choose"])expect((await callback(command)).ok()).toBe(true);
 let s=await state();expect(s.messages.filter((m:{chat_id:string})=>m.chat_id==="100004")).toHaveLength(1);expect(s.edits.length).toBeGreaterThanOrEqual(6);
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("tutor");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/tutor/schedule",{timeout:15000});
 await page.goto("/tutor/chats?student=00000000-0000-4000-8000-000000000004");await page.getByLabel("Сообщение ученику",{exact:true}).fill("Неприкосновенный текст репетитора");await page.getByRole("button",{name:"Отправить",exact:true}).click();await expect(page.locator(".chat-bubble.is-tutor")).toContainText("Неприкосновенный текст репетитора");
 s=await state();const teacher=s.messages.find((m:{text:string})=>m.text.includes("Неприкосновенный текст репетитора"));expect(teacher).toBeTruthy();
 expect((await callback(`chat:to:${tutor}`,teacher.message_id)).ok()).toBe(true);
 s=await state();expect(s.messages.find((m:{message_id:number})=>m.message_id===teacher.message_id).text).toBe(teacher.text);expect(s.messages.find((m:{message_id:number})=>m.message_id===panel.message_id).text).toContain("Вы пишете:");
 await request.post(f+"/behavior",{data:{op:"edit",fail:true}});expect((await text("/start")).status()).toBe(503);expect((await state()).messages.length).toBe(s.messages.length);
 expect((await text("/start")).ok()).toBe(true);
 await request.post(f+"/telegram/delete-control",{data:{chat_id:"100004",message_id:panel.message_id}});
 expect((await text("/start")).ok()).toBe(true);expect((await text("/start")).ok()).toBe(true);
 s=await state();expect(s.messages.filter((m:{chat_id:string;deleted?:boolean})=>m.chat_id==="100004"&&!m.deleted)).toHaveLength(2);
 expect(s.edits.every((e:{message_id:number})=>e.message_id!==teacher.message_id)).toBe(true);
});
