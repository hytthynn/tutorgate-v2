import { test,expect,type Page } from "@playwright/test";
import { week } from "./dates";
const fixture="http://127.0.0.1:54329/fixtures",student="00000000-0000-4000-8000-000000000004";
async function login(page:Page) { await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("tutor");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/tutor/schedule"); }
test.beforeEach(async({request})=>{await request.post(fixture+"/reset-schedule");await request.post(fixture+"/applications-reset");});
test("014 status colors, legend and coral editor lock",async({page})=>{
  await login(page);const card=page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000100"]').first();
  await page.getByRole("button",{name:"Обозначения цветов"}).click();await expect(page.getByRole("dialog")).toContainText("Основные цвета");await page.keyboard.press("Escape");
  await card.click({button:"right"});await page.getByRole("menuitem",{name:"Перенести…",exact:true}).click();await page.getByLabel("Начало",{exact:true}).fill("15:00");await page.getByRole("button",{name:"Перенести",exact:true}).click();
  const target=page.locator('[data-transfer="true"]').first();await expect(target).toHaveAttribute("data-color","blue");await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await target.click({button:"middle"});await expect(target).toHaveAttribute("data-color","green");await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await target.click({button:"middle"});await expect(target).toHaveAttribute("data-color","blue");await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await target.click({button:"right"});await page.getByRole("menuitemradio",{name:"Коралловый"}).click();await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await target.click();await expect(page.getByLabel("Начало",{exact:true})).toBeDisabled();await expect(page.getByLabel("Длительность, мин",{exact:true})).toBeDisabled();await expect(page.getByRole("combobox",{name:"День",exact:true})).toBeDisabled();await page.keyboard.press("Escape");
  await target.click({button:"right"});await expect(page.getByRole("menuitem",{name:"Перенести…",exact:true})).toBeDisabled();
});
test("014 centered Select, support and wordmark at desktop/mobile",async({page})=>{
  await page.goto("/login");await expect(page.getByRole("link",{name:"Поддержка в Telegram"})).toHaveAttribute("href","https://t.me/tutorgate");await expect(page.locator(".brand")).toHaveText("TutorGate");
  await login(page);
  for(const width of [1440,375]) {
    await page.setViewportSize({width,height:900});
    const trigger=page.getByRole("combobox",{name:"Год",exact:true});await trigger.click();
    const t=(await trigger.boundingBox())!,p=(await page.locator(".tg-select-popup").boundingBox())!;
    const desired=Math.max(12,Math.min(t.x+t.width/2-p.width/2,width-p.width-12));expect(Math.abs(p.x-desired)).toBeLessThan(2);await page.keyboard.press("Escape");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.goto(`/tutor/schedule?week=${week}`);
});
test("014 rich paste, file input, drag/drop, removal and mocked media delivery",async({page,request})=>{
  await login(page);await page.goto(`/tutor/chats?student=${student}`);
  const composer=page.getByLabel("Сообщение ученику",{exact:true});
  await composer.evaluate(el=>{const data=new DataTransfer();data.setData("text/html",'<b>Жирный</b><script>window.BAD=1</script><a href="javascript:bad">Ссылка</a>');el.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data}));});
  await expect(page.locator(".rich-preview strong")).toHaveText("Жирный");expect(await page.evaluate(()=>"BAD" in window)).toBe(false);
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=","base64");
  await page.locator('input[type="file"]').setInputFiles({name:"photo.png",mimeType:"image/png",buffer:png});await expect(page.locator(".chat-composer img")).toBeVisible();
  await page.getByRole("button",{name:"Удалить файл photo.png"}).click();await expect(page.locator(".chat-composer img")).toHaveCount(0);
  await page.locator(".chat-composer").evaluate((el,bytes)=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],"drop.png",{type:"image/png"}));el.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));},[...png]);
  await page.locator('input[type="file"]').setInputFiles({name:"notes.txt",mimeType:"text/plain",buffer:Buffer.from("Fixture file")});
  await page.getByRole("button",{name:"Отправить",exact:true}).click();await expect(page.locator(".chat-bubble strong")).toHaveText("Жирный");await expect(page.locator(".chat-bubble")).toContainText("drop.png");await expect(page.locator(".chat-bubble")).toContainText("notes.txt");await expect(page.locator(".chat-delivery-failed")).toHaveCount(0);
  const state=await(await request.get(fixture+"/chat-state")).json();expect(Object.keys(state.links).length).toBeGreaterThanOrEqual(3);
});
test("014 Telegram image and rich entities appear in web chat",async({page,request})=>{
  await login(page);await page.goto(`/tutor/chats?student=${student}`);
  const send=(data:unknown)=>request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data});
  await send({update_id:140001,callback_query:{id:"choose",from:{id:100004},message:{message_id:1,chat:{id:100004,type:"private"}},data:"chat:to:00000000-0000-4000-8000-000000000002"}});
  const received=await send({update_id:140002,message:{from:{id:100004},chat:{id:100004,type:"private"},caption:"Фото",caption_entities:[{type:"bold",offset:0,length:4}],photo:[{file_id:"fixture",file_size:68}]}});expect(received.ok()).toBe(true);
  await expect(page.locator(".chat-bubble.is-student strong")).toHaveText("Фото",{timeout:12000});await expect(page.locator(".chat-bubble.is-student")).toContainText("Изображение");
});
