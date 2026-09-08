import {test,expect} from "@playwright/test";
const fixture="http://127.0.0.1:54329/fixtures",student="00000000-0000-4000-8000-000000000004";
test.beforeEach(async({request})=>{await request.post(fixture+"/reset-schedule");await request.post(fixture+"/applications-reset");});
for(const kind of ["photo","document"] as const)test(`017 ${kind} album keeps every file in one web message after recipient reset`,async({page,request})=>{
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("tutor");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/tutor/schedule");
 await page.goto(`/tutor/chats?student=${student}`);
 const send=(data:unknown)=>request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data});
 await send({update_id:170000,callback_query:{id:"choose",from:{id:100004},message:{message_id:1,chat:{id:100004,type:"private"}},data:"chat:to:00000000-0000-4000-8000-000000000002"}});
 const update=(i:number)=>({update_id:170001+i,message:{message_id:180001+i,media_group_id:"album-017",from:{id:100004},chat:{id:100004,type:"private"},caption:i===0?"Все файлы альбома":"",[kind]:kind==="photo"?[{file_id:`small${i}`,file_size:1},{file_id:`fixture${i}`,file_size:68}]:{file_id:`fixture${i}`,file_size:68,file_name:`work${i}.png`}}});
 for(let i=0;i<3;i++)expect((await send(update(i))).ok()).toBe(true);
 expect((await send(update(1))).ok()).toBe(true);
 await expect(page.locator(".chat-bubble.is-student")).toHaveCount(1,{timeout:12000});
 const files=page.locator(".chat-bubble.is-student .chat-file");await expect(files).toHaveCount(3,{timeout:12000});
 for(let i=0;i<3;i++){await files.nth(i).scrollIntoViewIfNeeded();await expect(files.nth(i).locator(".chat-image-preview")).toBeVisible();}
 await expect(page.locator(".chat-bubble.is-student")).toContainText("Все файлы альбома");
 const state=await(await request.get(fixture+"/applications-state")).json();
 for(let i=0;i<3;i++)expect(state.deletions.some((d:{message_id:number})=>d.message_id===180001+i)).toBe(true);
});
