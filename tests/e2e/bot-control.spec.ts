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
test("015 bot selection, cancel, receipt cleanup and reply updates original teacher message",async({page,request})=>{
 let update=150000;
 const post=(data:object)=>request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data:{update_id:++update,...data}});
 const text=(text:string,message_id:number)=>post({message:{message_id,text,from:{id:100004},chat:{id:100004,type:"private"}}});
 const state=async()=>await(await request.get(f+"/applications-state")).json();
 const callback=(data:string,message_id:number)=>post({callback_query:{id:String(update),from:{id:100004},data,message:{message_id,chat:{id:100004,type:"private"}}}});
 expect((await text("/start",90000)).ok()).toBe(true);
 const panel=(await state()).messages[0];expect(panel.reply_markup.inline_keyboard.flat()).toHaveLength(2);
 await callback("chat:choose",panel.message_id);let s=await state();expect(s.messages[0].text).toContain("Выберите репетитора");
 await callback(`chat:to:${tutor}`,panel.message_id);await callback("chat:cancel",panel.message_id);expect((await state()).messages[0].text).toContain("Выберите репетитора");
 await callback(`chat:to:${tutor}`,panel.message_id);await text("Мой вопрос",90001);
 s=await state();expect(s.messages[0].deleted).toBe(true);expect(s.deletions.some((d:{message_id:number})=>d.message_id===90001)).toBe(true);
 const receipt=s.messages.filter((m:{chat_id:string})=>m.chat_id==="100004").at(-1);expect(receipt.text).toContain("Мой вопрос");expect(receipt.reply_markup.inline_keyboard.flat().map((b:{text:string})=>b.text).join(" ")).toContain("Отправить ещё");
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("tutor");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/tutor/schedule",{timeout:15000});
 await page.goto("/tutor/chats?student=00000000-0000-4000-8000-000000000004");await page.getByLabel("Сообщение ученику",{exact:true}).fill("Задание https://example.com/lesson");await page.getByRole("button",{name:"Отправить",exact:true}).click();
 await expect(page.locator('.chat-bubble a')).toHaveAttribute("href","https://example.com/lesson");
 s=await state();const teacher=s.messages.find((m:{text:string})=>m.text.includes("Задание https://example.com/lesson"));
 const command=teacher.reply_markup.inline_keyboard[0][0].callback_data;expect(command).toMatch(/^chat:reply:/);
 await callback(command,teacher.message_id);const prompt=(await state()).messages.at(-1);expect(prompt.text).toContain("Вы пишете");
 await text("Мой ответ на задание",90002);s=await state();const answered=s.messages.find((m:{message_id:number})=>m.message_id===teacher.message_id);
 expect(answered.text).toContain("Задание https://example.com/lesson");expect(answered.text).toContain("Мой ответ на задание");expect(s.messages.find((m:{message_id:number})=>m.message_id===prompt.message_id).deleted).toBe(true);
 expect(s.deletions.some((d:{message_id:number})=>d.message_id===90002)).toBe(true);
 await expect(page.locator(".chat-bubble.is-student").last()).toContainText("Мой ответ на задание",{timeout:12000});
});
