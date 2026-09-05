import { test, expect, type Page } from "@playwright/test";
import { week, day } from "./dates";
import { choose } from "./select";
async function login(page: Page, role = "tutor") {
  await page.goto("/login");
  await page.getByLabel("Логин", {exact:true}).fill(role);
  await page.getByLabel("Пароль", {exact:true}).fill("fixture-password");
  await page.getByRole("button",{name:"Войти",exact:true}).click();
  await expect(page).toHaveURL(`/${role}/schedule`);
  await page.goto(`/${role}/schedule?week=${week}&day=${week}`);
  await expect(page.getByRole("group",{name:"Календарь занятий"})).toBeVisible();
}
test.beforeEach(async ({request})=>{ await request.post("http://127.0.0.1:54329/fixtures/reset-schedule"); });
test("custom toolbar order, five years, icons and keyboard-accessible listbox",async({page})=>{
  await login(page);
  await expect(page.locator("select:visible")).toHaveCount(0);
  const names=await page.locator('.schedule-toolbar button:not([disabled])').evaluateAll(buttons=>buttons.map(b=>b.getAttribute("aria-label")||b.textContent?.trim()));
  expect(names.slice(0,7)).toEqual(["Год","Месяц","Неделя","Сдвиг МСК","Предыдущая неделя","Текущая","Следующая неделя"]);
  const year=page.getByRole("combobox",{name:"Год",exact:true});
  await year.focus(); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option")).toHaveCount(5);
  const current=new Date(Date.now()+3*3600000).getUTCFullYear();
  expect(await page.getByRole("option").allTextContents()).toEqual(Array.from({length:5},(_,i)=>String(current-2+i)));
  await page.keyboard.press("Escape"); await expect(year).toBeFocused();
  await expect(page.getByRole("button",{name:"Отменить",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Вернуть",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Бинды",exact:true}).locator("svg")).toBeVisible();
});
test("week navigation and creation preserve grid identity, no RSC GET or document refresh",async({page})=>{
  await login(page);
  const grid=page.getByRole("group",{name:"Календарь занятий"});
  await grid.evaluate(e=>{(window as unknown as { originalGrid: Element }).originalGrid=e;});
  const refetches:string[]=[];
  page.on("request",r=>{if(r.method()==="GET" && r.url().includes("/tutor/schedule") && (r.isNavigationRequest()||r.headers().rsc==="1"||r.url().includes("_rsc="))) refetches.push(r.url());});
  await page.getByRole("button",{name:"Следующая неделя",exact:true}).click();
  await expect(page.getByRole("button",{name:"Добавить занятие",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Предыдущая неделя",exact:true}).click();
  await page.getByRole("button",{name:"Добавить занятие",exact:true}).click();
  await choose(page,"Ученик","Анна Смирнова"); await choose(page,"Предмет","Математика");
  await page.getByRole("combobox",{name:"День",exact:true}).click();
  await expect(page.getByRole("option")).toHaveCount(7); await page.getByRole("option").first().click();
  await page.getByLabel("Начало",{exact:true}).fill("10:30");
  await page.getByRole("button",{name:"Добавить",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".tg-toast").filter({hasText:"10:30 занято — занятие поставлено на 11:00."})).toBeVisible();
  expect(refetches).toEqual([]);
  expect(await grid.evaluate(e=>(window as unknown as {originalGrid:Element}).originalGrid===e)).toBe(true);
  await expect(page.locator('.schedule-lesson').filter({hasText:"11:00–12:00"})).toBeVisible();
});
test("student search, empty results, note autosize and spinner-free numbers",async({page})=>{
  await login(page); await page.getByRole("button",{name:"Добавить занятие",exact:true}).click();
  await page.getByRole("combobox",{name:"Ученик",exact:true}).click();
  const search=page.getByRole("combobox",{name:"Поиск в списке",exact:true});
  await search.fill("неизвестный ученик"); await expect(page.getByText("Ничего не найдено",{exact:true})).toBeVisible();
  await search.fill("АННА"); await search.press("ArrowDown"); await search.press("Enter");
  await expect(page.getByRole("combobox",{name:"Ученик",exact:true})).toHaveText("Анна Смирнова");
  const note=page.getByLabel("Заметка",{exact:true});
  const initial=(await note.boundingBox())!.height;
  await note.fill(Array.from({length:35},(_,i)=>`Строка ${i}`).join("\n"));
  const large=(await note.boundingBox())!.height;
  expect(large).toBeGreaterThan(initial); expect(large).toBeLessThanOrEqual(240);
  expect(await note.evaluate(e=>getComputedStyle(e).resize)).toBe("none");
  expect(await page.getByLabel("Длительность, мин").evaluate(e=>getComputedStyle(e).appearance)).toBe("textfield");
  await page.screenshot({path:"artifacts/lesson-dialog-upgrade.png",fullPage:true});
});
test("searchable tutor assignment control uses keyboard and returns focus",async({page})=>{
  await login(page,"admin"); await page.goto("/admin/students");
  await page.getByRole("button",{name:"Назначения",exact:true}).first().click();
  await choose(page,"Предмет","Физика");
  const tutor=page.getByRole("combobox",{name:"Репетитор",exact:true}); await tutor.click();
  const search=page.getByRole("combobox",{name:"Поиск в списке",exact:true});
  await search.fill("соколова"); await search.press("Enter");
  await expect(tutor).toHaveText("Мария Соколова"); await expect(tutor).toBeFocused();
});
test("hard-deleted subject disappears from lists while historic lesson stays editable",async({page,browser})=>{
  await login(page);
  const admin=await browser.newPage();
  try {
    await login(admin,"admin"); await admin.goto("/admin/settings");
    await admin.getByRole("button",{name:"Удалить предмет Математика",exact:true}).click();
    await expect(admin.getByRole("dialog")).toContainText("История уже созданных занятий сохранится");
    await admin.getByRole("button",{name:"Удалить предмет",exact:true}).click();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    await expect(admin.getByRole("button",{name:"Удалить предмет Математика",exact:true})).toHaveCount(0);
    await page.reload();
    const card=page.locator('[data-lesson-id="00000000-0000-4000-8000-000000000100"]');
    await card.click(); await card.click();
    await expect(page.getByRole("combobox",{name:"Предмет",exact:true})).toContainText("Математика");
    await page.getByLabel("Заметка",{exact:true}).fill("История сохранена");
    await page.getByRole("button",{name:"Сохранить",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(card).toBeVisible();
    await page.getByRole("button",{name:"Следующая неделя",exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`week=${day(7)}`));
    await expect(page.getByRole("button",{name:"Добавить занятие",exact:true})).toBeDisabled();
  } finally { await admin.close(); }
});
