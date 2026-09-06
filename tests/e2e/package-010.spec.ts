import { test, expect, type Page } from "@playwright/test";
import { week } from "./dates";
const fixture = "http://127.0.0.1:54329/fixtures";
async function login(page: Page, role = "admin") {
  await page.goto("/login"); await page.getByLabel("Логин", { exact: true }).fill(role); await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click(); await expect(page).toHaveURL(`/${role}/schedule`);
}
async function emptyPoint(page: Page, day = 2, minute = 607) {
  return page.locator(".schedule-grid").evaluate((el, {day,minute}) => {
    const box = el.getBoundingClientRect();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.left + box.width * (day + .5) / 7, clientY: box.top + box.height * minute / 1440 });
    el.dispatchEvent(event);
    const snapped=Math.min(1435,Math.max(0,Math.round((event.clientY-box.top)/box.height*1440/5)*5));
    return `${String(Math.floor(snapped/60)).padStart(2,"0")}:${String(snapped%60).padStart(2,"0")}`;
  }, {day,minute});
}
async function shortcut(page: Page, code: string, key: string, shiftKey = false, metaKey = false) {
  await page.locator(".schedule-grid").focus();
  await page.locator(".schedule-grid").dispatchEvent("keydown", {code,key,shiftKey,ctrlKey:!metaKey,metaKey,bubbles:true});
}
async function lessonCount(page: Page) { return page.locator("[data-lesson-id]").evaluateAll(nodes => new Set(nodes.map(n => n.getAttribute("data-lesson-id"))).size); }
test.beforeEach(async ({request}) => { await request.post(`${fixture}/reset-schedule`); await request.post(`${fixture}/applications-reset`); });

test("010 applications segmented toolbar and statistics spacing at all requested viewports", async ({page,request}, info) => {
  test.setTimeout(90000);
  await request.post(`${fixture}/applications-seed`);
  await login(page);
  for (const [width,height] of [[320,900],[375,900],[768,1024],[1366,768],[1440,900],[1920,1080]]) {
    await page.setViewportSize({width,height}); await page.goto("/admin/applications");
    await expect(page.locator(".application-toolbar")).toBeVisible();
    const boxes = await page.locator(".application-tabs").evaluateAll(nodes => nodes.map(n => ({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
    if (width >= 768) expect(Math.abs(boxes[0].top-boxes[1].top)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of await page.locator(".application-card").all()) { await expect(card).toBeVisible(); expect(Number.parseFloat(await card.evaluate(el=>getComputedStyle(el).paddingTop))).toBeLessThanOrEqual(18); }
    await page.screenshot({path:info.outputPath(`applications-${width}.png`),fullPage:true});
    for (const period of ["7","14","30","custom"]) {
      await page.goto(`/admin/statistics?period=${period}`);
      const controls = page.locator(".statistics-controls"); await expect(controls).toBeVisible();
      if (width >= 768 && period !== "custom") expect((await controls.boundingBox())!.height).toBeLessThan(120);
      const gap=await page.locator(".kpi-grid").evaluate(el=>el.getBoundingClientRect().top-document.querySelector(".statistics-controls")!.getBoundingClientRect().bottom);
      expect(gap).toBeGreaterThanOrEqual(20); expect(gap).toBeLessThanOrEqual(24);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const field of await page.locator('input[type="date"]').all()) await expect(field).toHaveCSS("cursor","text");
      if (period === "7" || period === "custom") await page.screenshot({path:info.outputPath(`statistics-${width}-${period}.png`),fullPage:true});
    }
  }
});
test("010 directory identifiers, nullable links, search and Telegram sync results", async ({page}) => {
  await login(page); await page.goto("/admin/tutors");
  const search = page.getByRole("textbox", {name:"Поиск по имени, логину, @username или Telegram ID"});
  for (const query of ["Мария","TUTOR","@MARIA_SOKOLOVA","maria_sokolova","100002"]) {
    await search.fill(query); await expect(page.locator(".person-row")).toHaveCount(1); await expect(page.locator(".person-row")).toContainText("Мария Соколова");
  }
  await page.goto("/admin/settings"); await page.getByRole("button", {name:"Синхронизировать всех",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Проверено: 5 · Обновлено: 3 · Username удалён: 1 · Без изменений: 0 · Ошибки: 1");
  await page.goto("/admin/tutors?q=tutor"); const row=page.locator(".person-row");
  await expect(row).toContainText("Нет username"); await expect(row.getByRole("link",{name:"Открыть Telegram"})).toHaveCount(0); await expect(row).toContainText("100002");
});
test("010 account block/unblock, real access checks with existing opaque handle, role error and safe delete UI", async ({page,browser}) => {
  await login(page); const student=await browser.newPage();
  try {
    await login(student,"student"); await page.goto("/admin/students");
    const row=page.locator(".person-row").filter({hasText:"Анна Смирнова"});
    async function action(label:string) {
      await row.getByRole("button",{name:"Действия: Анна Смирнова"}).click(); await page.getByRole("menuitem",{name:label,exact:true}).click(); await page.getByRole("button",{name:"Подтвердить",exact:true}).click();
    }
    await action("Сделать репетитором"); await expect(page.getByText("Сначала снимите назначения, предметы репетитора и будущие занятия.",{exact:true})).toBeVisible(); await page.keyboard.press("Escape");
    await action("Заблокировать"); await expect(row).toContainText("Заблокирован");
    await student.reload(); await expect(student).toHaveURL("/login");
    await student.getByLabel("Логин",{exact:true}).fill("student"); await student.getByLabel("Пароль",{exact:true}).fill("fixture-password"); await student.getByRole("button",{name:"Войти",exact:true}).click();
    await expect(student.getByText("Доступ к аккаунту закрыт. Обратитесь к администратору.",{exact:true})).toBeVisible();
    await action("Разблокировать"); await expect(row.getByText("Заблокирован",{exact:true})).toHaveCount(0); await login(student,"student");
    await action("Удалить аккаунт"); await expect(row).toHaveCount(0); await student.reload(); await expect(student).toHaveURL("/login");
  } finally { await student.close(); }
});
test("010 empty context menu uses snapped local point, conditional paste and keyboard navigation", async ({page}) => {
  await login(page,"tutor"); await page.goto(`/tutor/schedule?week=${week}&day=${week}`);
  const snapped=await emptyPoint(page); await expect(page.getByRole("menuitem",{name:/Вставить/})).toHaveCount(0);
  await expect(page.getByRole("menuitem",{name:"Создать занятие здесь"})).toBeFocused(); await page.keyboard.press("Enter");
  const expected=new Date(`${week}T00:00:00Z`);expected.setUTCDate(expected.getUTCDate()+2);
  await expect(page.getByLabel("Начало",{exact:true})).toHaveValue(snapped);
  await expect(page.locator('input[name="date"]')).toHaveValue(expected.toISOString().slice(0,10));
  await expect(page.getByLabel("Начало",{exact:true})).toHaveCSS("cursor","text");
  await page.keyboard.press("Escape");
  await page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000100"]').click({button:"right"}); await page.getByRole("menuitem",{name:/Копировать/}).click();
  await expect(page.getByText("Скопировано занятий: 1",{exact:true})).toBeVisible();
  await emptyPoint(page,3,900); await expect(page.getByRole("menuitem",{name:/Вставить/})).toBeFocused(); await page.keyboard.press("ArrowDown"); await expect(page.getByRole("menuitem",{name:"Создать занятие здесь"})).toBeFocused();
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter"); await expect.poll(()=>lessonCount(page)).toBe(4); await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
});
for (const layout of ["ru","en","meta"]) test(`010 physical shortcuts copy/paste/undo/redo: ${layout}`, async ({page}) => {
  await login(page,"tutor"); await page.goto(`/tutor/schedule?week=${week}&day=${week}`);
  await page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000100"]').click();
  await shortcut(page,"KeyC",layout==="ru"?"с":"c",false,layout==="meta");
  await emptyPoint(page,2,900); await page.keyboard.press("Escape");
  await shortcut(page,"KeyV",layout==="ru"?"м":"v",false,layout==="meta"); await expect.poll(()=>lessonCount(page)).toBe(4); await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await shortcut(page,"KeyZ",layout==="ru"?"я":"z",false,layout==="meta"); await expect.poll(()=>lessonCount(page)).toBe(3); await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await shortcut(page,"KeyZ",layout==="ru"?"Я":"Z",true,layout==="meta"); await expect.poll(()=>lessonCount(page)).toBe(4); await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  await emptyPoint(page); await page.getByRole("menuitem",{name:"Создать занятие здесь"}).click();
  await page.getByLabel("Начало",{exact:true}).dispatchEvent("keydown",{code:"KeyV",key:"м",ctrlKey:true,bubbles:true}); await expect(page.getByRole("dialog")).toBeVisible(); expect(await lessonCount(page)).toBe(4);
});
test("010 student grid has no mutation context menu", async ({page}) => {
  await login(page,"student"); await emptyPoint(page); await expect(page.getByRole("menu")).toHaveCount(0);
  await page.locator("[data-lesson-id]").first().click({button:"right"}); await expect(page.getByRole("menu")).toHaveCount(0);
});
test("010 context copy preserves selection and common paste delta; other lesson replaces selection", async ({page,request}) => {
  await login(page,"tutor"); await page.goto(`/tutor/schedule?week=${week}&day=${week}`);
  const grid=page.locator(".schedule-grid"), box=(await grid.boundingBox())!;
  await page.mouse.move(box.x+1,box.y+box.height*9/24); await page.mouse.down(); await page.mouse.move(box.x+box.width/7-1,box.y+box.height*14/24,{steps:8}); await page.mouse.up();
  await expect(page.locator(".is-selected")).toHaveCount(2);
  await page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000100"]').click({button:"right"});
  await page.getByRole("menuitem",{name:/Копировать/}).click(); await expect(page.getByText("Скопировано занятий: 2",{exact:true})).toBeVisible();
  await emptyPoint(page,2,900); await page.getByRole("menuitem",{name:/Вставить/}).click();
  await expect.poll(()=>lessonCount(page)).toBe(5); await expect(page.locator(".schedule-save-status")).toHaveText("Сохранено");
  const state=await (await request.get(`${fixture}/state`)).json();
  const copies=state.lessons.filter((l:{id:string})=>!l.id.endsWith("100")&&!l.id.endsWith("101")&&!l.id.endsWith("102"));
  expect(copies).toHaveLength(2); expect(Math.abs(Date.parse(copies[0].starts_at)-Date.parse(copies[1].starts_at))).toBe(120*60000);
  await page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000102"]').first().click({button:"right"});
  await page.getByRole("menuitem",{name:/Копировать/}).click(); await expect(page.getByText("Скопировано занятий: 1",{exact:true})).toBeVisible();
});
test("010 empty menu uses selected mobile day and disables mutations outside current week", async ({page}) => {
  await page.setViewportSize({width:375,height:900}); await login(page,"tutor");
  const date=new Date(`${week}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);const day=date.toISOString().slice(0,10);
  await page.goto(`/tutor/schedule?week=${week}&day=${day}`);const snapped=await emptyPoint(page,6,800);
  await page.getByRole("menuitem",{name:"Создать занятие здесь"}).click();
  await expect(page.locator('input[name="date"]')).toHaveValue(day);await expect(page.getByLabel("Начало",{exact:true})).toHaveValue(snapped);await page.keyboard.press("Escape");
  date.setUTCDate(date.getUTCDate()+7);const future=date.toISOString().slice(0,10);
  await page.goto(`/tutor/schedule?week=${future}&day=${future}`);await emptyPoint(page);
  await expect(page.getByRole("menuitem",{name:"Создать занятие здесь"})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
