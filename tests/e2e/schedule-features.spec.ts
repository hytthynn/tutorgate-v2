import { test, expect, type Page } from "@playwright/test";
import { week, day } from "./dates";
import { choose } from "./select";
const fixture="http://127.0.0.1:54329/fixtures";
const card=(page:Page,n=100)=>page.locator(`[data-lesson-id="00000000-0000-4000-8000-${String(n).padStart(12,"0")}"]`).first();
async function login(page:Page,role="tutor"){
  await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill(role);await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL(`/${role}/schedule`);
  await page.goto(`/${role}/schedule?week=${week}&day=${week}`);
}
async function settled(page:Page){await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");}
async function context(page:Page,n=100){await card(page,n).click({button:"right",position:{x:1,y:3}});}
test.beforeEach(async({request})=>{await request.post(`${fixture}/reset-schedule`);});
test("removed layout elements, admin label and controlled rate",async({page})=>{
  await login(page,"admin");await page.goto("/admin/tutors");await expect(page.getByText("Администратор · Репетитор")).toHaveCount(0);
  await expect(page.locator(".person-row").filter({hasText:"Александр Волков"}).getByText("Администратор",{exact:true})).toBeVisible();
  await expect(page.locator("footer")).toHaveCount(0);await page.goto("/admin/settings");
  const rate=page.getByLabel("Ставка за час");await rate.fill("1234.50");await page.getByRole("button",{name:"Сохранить ставку"}).click();await expect(rate).toHaveValue("1234.5");
  await rate.fill("");await page.getByRole("button",{name:"Сохранить ставку"}).click();await expect(rate).toHaveAttribute("aria-invalid","true");await expect(page.locator("#hourly_rate-error")).toBeVisible();
});
test("public inline validation and structurally clean forgot/reset/application success",async({page})=>{
  await page.goto("/forgot-password");await expect(page.locator("footer")).toHaveCount(0);await expect(page.getByText("Стать частью TutorGate")).toHaveCount(0);
  await page.getByRole("button",{name:"Получить ссылку"}).click();await expect(page.locator("#telegram_username-error")).toBeVisible();
  await page.getByLabel("Telegram",{exact:true}).fill("anna_smirnova");await expect(page.locator("#telegram_username-error")).toHaveCount(0);await page.getByRole("button",{name:"Получить ссылку"}).click();
  await expect(page.getByRole("heading",{name:"Проверьте Telegram"})).toBeVisible();await expect(page.locator("h1,.back-link")).toHaveCount(0);
  await page.goto("/reset-password?token="+"a".repeat(43));await page.getByLabel("Новый пароль",{exact:true}).fill("password123");await page.getByLabel("Повторите пароль").fill("password123");await page.getByRole("button",{name:"Сохранить пароль"}).click();
  await expect(page.getByRole("heading",{name:"Пароль изменён"})).toBeVisible();await expect(page.locator("h1,.auth-heading")).toHaveCount(0);
  await page.goto("/apply");await page.getByLabel("ФИО",{exact:true}).fill("Иван Иванов");await page.getByLabel("Telegram",{exact:true}).fill("ivan_ivanov");await page.getByLabel("Математика",{exact:true}).check();await choose(page,"Цель занятий","Для себя");await page.getByLabel("Я согласен с обработкой персональных данных").check();await page.getByRole("button",{name:"Подать заявку"}).click();
  await expect(page.getByRole("heading",{name:"Подтвердите Telegram"})).toBeVisible();await expect(page.locator("h1,.auth-heading,.auth-bottom,.role-tabs")).toHaveCount(0);
  await page.goto("/register?token="+"a".repeat(43));await page.getByLabel("Логин",{exact:true}).fill("fixture_new");await page.getByLabel("Пароль",{exact:true}).fill("password123");await page.getByLabel("Повторите пароль").fill("password123");await page.getByRole("button",{name:"Создать аккаунт"}).click();await expect(page.getByRole("heading",{name:"Добро пожаловать"})).toBeVisible();await expect(page.locator("h1,.auth-heading")).toHaveCount(0);
});
for(const next of [false,true])test(`transfer ${next?"next":"current"} week and undo/redo`,async({page,request})=>{
  await login(page);await context(page);await page.getByRole("menuitem",{name:"Перенести…",exact:true}).click();
  if(next){await page.getByRole("combobox",{name:"Неделя переноса"}).click();await page.getByRole("option").filter({hasText:"Следующая неделя"}).click();}
  await page.getByLabel("Начало",{exact:true}).fill("15:00");
  await request.post(`${fixture}/behavior`,{data:{op:"schedule_command",delay:1200}});
  await page.getByRole("button",{name:"Перенести",exact:true}).click();await expect(card(page)).toHaveAttribute("data-inactive","true");await expect(page.locator(".schedule-save-status")).toHaveText("Сохранение…");await settled(page);
  if(next)await page.getByRole("button",{name:"Следующая неделя",exact:true}).click();
  const target=page.locator('[data-transfer="true"]');await expect(target).toBeVisible();await target.click({button:"right"});await expect(page.getByRole("menuitem",{name:"Перенести…",exact:true})).toBeDisabled();await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");await settled(page);await expect(target).toHaveCount(0);
  await page.getByRole("button",{name:"Вернуть",exact:true}).click();await settled(page);await expect(target).toBeVisible();
  await page.reload();await expect(page.getByRole("button",{name:"Отменить",exact:true})).toBeDisabled();
});
test("availability cancel, inactive read-only details, lanes, coral overlap and recolor rollback",async({page})=>{
  await login(page);await context(page);await page.getByRole("menuitem",{name:"Заниматься с…"}).click();await page.getByLabel("Сможет заниматься с").fill(day(1));await page.getByRole("button",{name:"Сохранить",exact:true}).click();await settled(page);
  await expect(card(page)).toHaveAttribute("data-inactive","true");await card(page).click();await expect(page.getByRole("heading",{name:"Подробности занятия"})).toBeVisible();await expect(page.getByText("PRIVATE_TUTOR_NOTE_секрет")).toBeVisible();await page.keyboard.press("Escape");
  await context(page);await page.getByRole("menuitem",{name:"Заниматься с…"}).click();await page.getByRole("button",{name:"Отменить заниматься с"}).click();await settled(page);await expect(card(page)).toHaveAttribute("data-inactive","false");
  await context(page);await page.getByRole("menuitemradio",{name:"Коралловый"}).click();await settled(page);
  const grid=await page.getByRole("group",{name:"Календарь занятий"}).boundingBox();const second=await card(page,101).boundingBox();
  await page.mouse.move(second!.x+second!.width/2,second!.y+3);await page.mouse.down();await page.mouse.move(grid!.x+grid!.width/14,grid!.y+grid!.height*10/24+3,{steps:8});await page.mouse.up();await settled(page);
  await expect(card(page,101)).toContainText("10:00–11:00");const a=await card(page).boundingBox(),b=await card(page,101).boundingBox();expect(Math.abs(a!.x-b!.x)).toBeLessThan(8);
  await context(page,101);await page.getByRole("menuitemradio",{name:"Коралловый"}).click();await expect(page.locator(".schedule-save-status")).toHaveText("Не сохранено");await expect(card(page,101)).toHaveAttribute("data-color","default");
});
test("group selection, drag, paste anchor, delete and keyboard history",async({page})=>{
  await login(page);const grid=page.getByRole("group",{name:"Календарь занятий"}),box=(await grid.boundingBox())!;
  await page.mouse.move(box.x+1,box.y+box.height*9/24);await page.mouse.down();await page.mouse.move(box.x+box.width/7-1,box.y+box.height*14/24,{steps:8});await page.mouse.up();await expect(page.locator(".is-selected")).toHaveCount(2);
  await context(page);await expect(page.getByText("Выбрано занятий: 2")).toBeVisible();await page.keyboard.press("Escape");
  const start=(await card(page).boundingBox())!;await page.mouse.move(start.x+start.width/2,start.y+3);await page.mouse.down();await page.mouse.move(start.x+start.width/2+box.width/7,start.y+3,{steps:8});await expect(page.locator(".is-dragging")).toHaveCount(2);await page.mouse.up();await settled(page);
  await grid.focus();await page.keyboard.press("Control+c");await page.mouse.click(box.x+box.width*2.5/7,box.y+box.height*15/24);await page.keyboard.press("Control+v");await settled(page);await expect(page.locator(".schedule-lesson")).toHaveCount(5);
  await grid.focus();await page.keyboard.press("Control+z");await settled(page);await expect(page.locator(".schedule-lesson")).toHaveCount(3);await page.keyboard.press("Control+Shift+z");await settled(page);await expect(page.locator(".schedule-lesson")).toHaveCount(5);
});
test("mobile transfer remains accessible without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:375,height:900});await login(page);await context(page);await page.getByRole("menuitem",{name:"Перенести…"}).click();await page.getByLabel("Начало",{exact:true}).fill("15:00");await page.getByRole("button",{name:"Перенести",exact:true}).click();await settled(page);await expect(page.locator('[data-transfer="true"]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("inactive overlap remains clickable, cancel conflict rolls back, rectangle excludes inactive and coral",async({page,browser})=>{
  await login(page);await context(page);await page.getByRole("menuitem",{name:"Заниматься с…"}).click();await page.getByLabel("Сможет заниматься с").fill(day(1));await page.getByRole("button",{name:"Сохранить",exact:true}).click();await settled(page);
  const grid=page.getByRole("group",{name:"Календарь занятий"}),box=(await grid.boundingBox())!,second=(await card(page,101).boundingBox())!;
  await page.mouse.move(second.x+second.width/2,second.y+3);await page.mouse.down();await page.mouse.move(box.x+box.width/14,box.y+box.height*10/24+3,{steps:8});await page.mouse.up();await settled(page);
  const a=(await card(page).boundingBox())!,b=(await card(page,101).boundingBox())!;expect(Math.abs(a.x-b.x)).toBeLessThan(8);
  await page.screenshot({path:"artifacts/schedule-008-overlap.png",fullPage:true});
  await context(page);await page.getByRole("menuitem",{name:"Заниматься с…"}).click();await page.getByRole("button",{name:"Отменить заниматься с"}).click();await expect(page.locator(".schedule-save-status")).toHaveText("Не сохранено");await expect(card(page)).toHaveAttribute("data-inactive","true");
  await page.mouse.move(box.x+1,box.y+box.height*9/24);await page.mouse.down();await page.mouse.move(box.x+box.width/7-1,box.y+box.height*14/24,{steps:8});await page.mouse.up();await expect(page.locator(".is-selected")).toHaveCount(1);
  await context(page,101);await page.getByRole("menuitemradio",{name:"Коралловый"}).click();await settled(page);
  await page.mouse.move(box.x+1,box.y+box.height*9/24);await page.mouse.down();await page.mouse.move(box.x+box.width/7-1,box.y+box.height*14/24,{steps:8});await page.mouse.up();await expect(page.locator(".is-selected")).toHaveCount(0);
  const student=await browser.newPage();try{await login(student,"student");await expect(card(student)).toHaveAttribute("data-inactive","true");await choose(student,"Сдвиг МСК","МСК+1");await expect(student.locator(".schedule-workspace")).toHaveAttribute("aria-busy","false");await expect(card(student)).toHaveAttribute("data-inactive","true");await student.keyboard.press("Control+z");await expect(student.locator(".schedule-workspace")).toHaveAttribute("aria-busy","false");await expect(student.getByRole("combobox",{name:"Сдвиг МСК"})).toHaveText("МСК");await card(student).click({position:{x:1,y:3}});await expect(student.getByRole("dialog")).toContainText("Сможет заниматься с");await expect(student.getByText("PRIVATE_TUTOR_NOTE_секрет")).toHaveCount(0);}finally{await student.close();}
});
