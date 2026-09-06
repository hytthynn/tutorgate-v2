import { test, expect, type Page } from "@playwright/test";
import { choose } from "./select";
const fixture="http://127.0.0.1:54329/fixtures", tutor="00000000-0000-4000-8000-000000000002";
async function login(page:Page){await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("admin");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/admin/schedule",{timeout:15000});}
test.beforeEach(async({request})=>{await request.post(fixture+"/reset-schedule");});
test("012 admin opens target calendar, creates/edits notes and completes target lesson",async({page,request})=>{
 await page.setViewportSize({width:1440,height:1000});await login(page);await page.goto("/admin/tutors");
 await page.locator(".person-row").filter({hasText:"Мария Соколова"}).getByRole("link",{name:"Расписание",exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`tutor=${tutor}`));await expect(page.getByText("Расписание: Мария Соколова",{exact:true})).toBeVisible();
 await expect(page.getByRole("combobox",{name:"Сдвиг МСК",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"Добавить занятие",exact:true}).click();await choose(page,"Ученик","Анна Смирнова");await choose(page,"Предмет","Физика");
 await page.getByLabel("Начало",{exact:true}).fill("18:00");await page.getByLabel("Заметка",{exact:true}).fill("Admin target note");await page.getByRole("button",{name:"Добавить",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
 const card=page.locator(".schedule-lesson").filter({hasText:"18:00–19:00"});await expect(card).toBeVisible();await expect(page.locator(".schedule-workspace")).toHaveAttribute("aria-busy","false");if(await card.getAttribute("aria-pressed")!=="true")await card.click();await card.click();await expect(page.getByLabel("Заметка",{exact:true})).toHaveValue("Admin target note");
 await page.getByLabel("Начало",{exact:true}).fill("19:00");await choose(page,"Предмет","Математика");await page.getByLabel("Заметка",{exact:true}).fill("Edited by admin");await page.getByRole("button",{name:"Сохранить",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
 await expect(page.locator(".schedule-workspace")).toHaveAttribute("aria-busy","false");
 const edited=page.locator(".schedule-lesson").filter({hasText:"19:00–20:00"});await edited.click({button:"middle"});await expect(edited.getByTestId("lesson-completed")).toBeVisible();
 await page.getByRole("button",{name:"Следующая неделя",exact:true}).click();await expect(page).toHaveURL(new RegExp(`tutor=${tutor}`));
 await page.getByRole("link",{name:"← К репетиторам",exact:true}).click();await expect(page).toHaveURL("/admin/tutors");
 // The other teacher has no assignments: the creation list cannot inherit admin students.
 await page.locator(".person-row").filter({hasText:"Дмитрий Лебедев"}).getByRole("link",{name:"Расписание",exact:true}).click();await page.getByRole("button",{name:"Добавить занятие",exact:true}).click();await expect(page.getByRole("combobox",{name:"Ученик",exact:true})).toHaveText("Нет доступных учеников");
 await page.screenshot({path:"artifacts/package-012-delegated.png",fullPage:true});
 const state=await(await request.get(fixture+"/state")).json();expect(JSON.stringify(state)).toContain("Edited by admin");
});
test("012 admin personal chat and reply callback delivery",async({page,request})=>{
 await login(page);await page.getByRole("link",{name:"Чаты",exact:true}).click();await expect(page).toHaveURL("/admin/chats");
 await expect(page.locator(".chat-directory")).toContainText("Анна Смирнова");await expect(page.locator(".chat-directory")).not.toContainText("Михаил Кузнецов");await page.locator(".chat-contact").filter({hasText:"Анна Смирнова"}).click();
 await expect(page.getByText("Переписка с учениками через Telegram.",{exact:true})).toHaveCount(0);
 await page.getByLabel("Сообщение ученику",{exact:true}).fill("Ответ администратора");await page.getByRole("button",{name:"Отправить",exact:true}).click();await expect(page.locator(".chat-bubble.is-tutor")).toContainText("Ответ администратора");
 const state=await(await request.get(fixture+"/chat-state")).json();expect(state.messages[0].delivery_status).toBe("sent");
 const webhook=(data:unknown)=>request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data});
 await webhook({update_id:120001,callback_query:{id:"reply-admin",from:{id:100004},message:{message_id:1,chat:{id:100004,type:"private"}},data:"chat:to:00000000-0000-4000-8000-000000000001"}});
 await webhook({update_id:120002,message:{text:"Ответ ученика администратору",from:{id:100004},chat:{id:100004,type:"private"}}});
 await expect(page.locator(".chat-bubble.is-student")).toContainText("Ответ ученика администратору",{timeout:12000});await page.screenshot({path:"artifacts/package-012-admin-chat.png",fullPage:true});
});
test("012 settings columns keep Telegram next to rate at desktop, tablet and mobile",async({page})=>{
 await login(page);await page.goto("/admin/settings");
 const panel=(name:string)=>page.locator(".settings-panel").filter({has:page.getByRole("heading",{name,exact:true})});
 for(const width of [1440,1100,768,390]){
 await page.setViewportSize({width,height:1000});
 const rate=(await panel("Ставка за час").boundingBox())!,telegram=(await panel("Telegram").boundingBox())!,subjects=(await panel("Предметы").boundingBox())!;
 expect(Math.round(telegram.y-rate.y-rate.height)).toBe(24);
 if(width>1100)expect(subjects.x).toBeGreaterThan(rate.x);else{expect(subjects.y).toBeGreaterThan(telegram.y+telegram.height);expect(subjects.x).toBe(rate.x);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===1440){await panel("Предметы").evaluate(el=>(el as HTMLElement).style.minHeight="1000px");const changed=(await panel("Telegram").boundingBox())!;expect(changed.y).toBe(telegram.y);await panel("Предметы").evaluate(el=>(el as HTMLElement).style.minHeight="");}
 await page.screenshot({path:`artifacts/package-012-settings-${width}.png`,fullPage:true});
 }
});
