import { test, expect, type Page } from "@playwright/test";
import { choose } from "./select";
import { week } from "./dates";
const fixture="http://127.0.0.1:54329/fixtures";
async function login(page:Page,role="admin") {
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill(role);await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL(`/${role}/schedule`);
}
test.beforeEach(async({request})=>{await request.post(`${fixture}/reset-schedule`);await request.post(`${fixture}/applications-reset`);});
for(const role of ["admin","tutor"]) test(`009 statistics intrinsic height, dates and real overflow: ${role}`,async({page})=>{
 await login(page,role);
 for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {
  await page.setViewportSize({width,height});
  for(const period of ["7","custom"]) {
   await page.goto(`/${role}/statistics?period=${period}`);await expect(page.locator(".chart-area")).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollHeight-document.documentElement.clientHeight)).toBeLessThanOrEqual(1);
   if(period==="custom")for(const field of await page.locator('input[type="date"]').all())await expect(field).toHaveCSS("cursor","text");
  }
 }
 await page.setViewportSize({width:375,height:350});expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const role of ["student","tutor","admin"])test(`009 role controls and mobile chevrons: ${role}`,async({page})=>{
 await login(page,role);
 await expect(page.getByRole("button",{name:"Отменить",exact:true})).toHaveCount(role==="student"?0:1);
 await expect(page.getByRole("button",{name:"Вернуть",exact:true})).toHaveCount(role==="student"?0:1);
 await expect(page.locator(".schedule-save-status")).toHaveCount(role==="student"?0:1);
 await expect(page.getByText("Всё начинается с знаний")).toHaveCount(0);
 for(const width of [320,375,1440]) {
  await page.setViewportSize({width,height:900});
  for(const trigger of await page.locator(".schedule-toolbar .tg-select-trigger").all()) {
   const bounds=await trigger.evaluate(el=>{const text=el.querySelector("span")!.getBoundingClientRect(),svg=el.querySelector("svg")!.getBoundingClientRect(),box=el.getBoundingClientRect();return {gap:svg.left-text.right,right:box.right-svg.right,center:Math.abs((svg.top+svg.bottom)-(box.top+box.bottom))/2,width:svg.width};});
   expect(bounds.gap).toBeGreaterThanOrEqual(5);expect(bounds.right).toBeGreaterThanOrEqual(7);expect(bounds.center).toBeLessThan(1);expect(bounds.width).toBe(16);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 if(role!=="admin"){await page.goto("/admin/applications");await expect(page).toHaveURL(`/${role}/schedule`);}
});
test("009 assignment rows and removed footnotes",async({page})=>{
 await login(page);await page.goto("/admin/students");
 for(const row of await page.locator(".assignment-tag").all()) {await expect(row).toHaveCSS("white-space","nowrap");expect(await row.innerText()).toMatch(/.+ · .+/);expect(await row.getAttribute("title")).toBeTruthy();}
 for(const path of ["students","tutors"]){await page.goto(`/admin/${path}`);await expect(page.locator(".table-footer")).not.toContainText("TutorGate");}
 await page.goto("/admin/settings");await expect(page.getByText("Заработок рассчитывается по проведённым часам.",{exact:false})).toHaveCount(0);
});
for(const side of ["target","source"])test(`009 transfer delete ${side} and signed undo/redo`,async({page})=>{
 await login(page,"tutor");await page.goto(`/tutor/schedule?week=${week}&day=${week}`);
 const source=page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000100"]').first();
 await source.click({button:"right"});await page.getByRole("menuitem",{name:"Перенести…",exact:true}).click();await page.getByLabel("Начало",{exact:true}).fill("15:00");await page.getByRole("button",{name:"Перенести",exact:true}).click();await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
 const target=page.locator('[data-transfer="true"]').first();const targetId=await target.getAttribute("data-lesson-id");
 await (side==="source"?source:target).click({button:"right"});await page.getByRole("menuitem",{name:/Удалить/}).click();await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
 if(side==="target"){await expect(source).toHaveAttribute("data-inactive","false");await expect(target).toHaveCount(0);}
 else {await expect(source).toHaveCount(0);const ordinary=page.locator(`[data-lesson-id="${targetId}"]`);await expect(ordinary).toHaveAttribute("data-transfer","false");await ordinary.click({button:"right"});await expect(page.getByRole("menuitem",{name:"Перенести…",exact:true})).toBeEnabled();await page.keyboard.press("Escape");}
 await page.getByRole("button",{name:"Отменить",exact:true}).click();await expect(source).toHaveAttribute("data-inactive","true");await expect(page.locator('[data-transfer="true"]')).toHaveCount(1);
 await page.getByRole("button",{name:"Вернуть",exact:true}).click();await expect(page.locator('[data-transfer="true"]')).toHaveCount(0);
});
async function apply(page:Page,role="student",username="new_applicant"){
 await page.goto("/apply");if(role==="tutor")await page.getByRole("tab",{name:"Я репетитор"}).click();
 await page.getByLabel("ФИО",{exact:true}).fill("Иван Иванов");await page.getByLabel("Telegram",{exact:true}).fill(username);await page.getByLabel("Математика",{exact:true}).check();
 await choose(page,role==="student"?"Цель занятий":"Опыт преподавания",role==="student"?"Для себя":"3–5 лет");
 await page.getByLabel("Я согласен с обработкой персональных данных").check();await page.getByRole("button",{name:"Подать заявку"}).click();
 const url=await page.getByRole("link",{name:"Продолжить в Telegram"}).getAttribute("href");return new URL(url!).searchParams.get("start")!;
}
for(const role of ["student","tutor"])test(`009 moderated application flow and Telegram mock: ${role}`,async({page,request,browser})=>{
 const applicant=await browser.newPage();
 try {
  const deep=await apply(applicant,role),tg=57001,update={update_id:57001,message:{text:`/start ${deep}`,from:{id:tg,username:"new_applicant"},chat:{id:tg,type:"private"}}};
  for(let n=0;n<2;n++)expect((await request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data:update})).ok()).toBe(true);
  let state=await (await request.get(`${fixture}/applications-state`)).json();
  expect(state.apps[0].status).toBe("pending_review");expect(state.messages.filter((m:{text:string})=>m.text.includes("Новая заявка в TutorGate")).length).toBe(2);
  expect(state.messages.some((m:{text:string})=>m.text.includes("register?token"))).toBe(false);expect(state.messages.filter((m:{text:string})=>m.text.includes("Новая заявка")).every((m:{hasButtons:boolean})=>m.hasButtons)).toBe(true);
  await login(page);await page.goto(`/admin/applications?role=${role}`);await expect(page.getByRole("heading",{name:"Иван Иванов"})).toBeVisible();
  await page.getByRole("button",{name:"Принять",exact:true}).click();await page.getByRole("link",{name:"Принятые",exact:true}).click();
  await expect(page.getByText("Принята",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Принять",exact:true})).toHaveCount(0);
  state=await (await request.get(`${fixture}/applications-state`)).json();const link=state.messages.at(-1).reply_markup.inline_keyboard[0][0].url as string;
  await request.post(`${fixture}/applications-expire`,{data:{id:state.apps[0].id}});await page.reload();await page.getByRole("button",{name:"Отправить новую ссылку"}).click();
  await expect(page.getByText("Новая ссылка отправлена. Предыдущая ссылка больше не действует.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Отправить новую ссылку"})).toHaveCount(0);
  state=await (await request.get(`${fixture}/applications-state`)).json();const fresh=state.messages.at(-1).reply_markup.inline_keyboard[0][0].url as string;expect(fresh).not.toBe(link);
  await applicant.goto(link);await expect(applicant.getByRole("button",{name:"Создать аккаунт"})).toHaveCount(0);
  await applicant.goto(fresh);await applicant.getByLabel("Логин",{exact:true}).fill("fixture_new");await applicant.getByLabel("Пароль",{exact:true}).fill("password123");await applicant.getByLabel("Повторите пароль").fill("password123");await applicant.getByRole("button",{name:"Создать аккаунт"}).click();await expect(applicant.getByRole("heading",{name:"Добро пожаловать"})).toBeVisible();
  await page.reload();await expect(page.getByText("Зарегистрирован",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Отправить новую ссылку"})).toHaveCount(0);
 } finally {await applicant.close();}
});
test("009 rejected Telegram can submit another independent application",async({page,request,browser})=>{
 const applicant=await browser.newPage();try {
  const deep=await apply(applicant);const confirm=(payload:string,update:number)=>request.post("/api/telegram/webhook",{headers:{"x-telegram-bot-api-secret-token":"fixture-webhook"},data:{update_id:update,message:{text:`/start ${payload}`,from:{id:57002,username:"new_applicant"},chat:{id:57002,type:"private"}}}});
  await confirm(deep,58000);await login(page);await page.goto("/admin/applications");await page.getByRole("button",{name:"Отклонить",exact:true}).click();await page.getByRole("link",{name:"Отклонённые",exact:true}).click();await expect(page.getByText("Отклонена",{exact:true})).toBeVisible();
  await confirm(await apply(applicant),58001);const state=await (await request.get(`${fixture}/applications-state`)).json();expect(state.apps.map((a:{status:string})=>a.status)).toEqual(["rejected","pending_review"]);expect(state.messages.some((m:{text:string})=>m.text.includes("отклонена"))).toBe(true);
 } finally {await applicant.close();}
});
