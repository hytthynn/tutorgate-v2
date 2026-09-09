import { test, expect, type Page } from "@playwright/test";
const fixture = "http://127.0.0.1:54329/fixtures";
const student = "00000000-0000-4000-8000-000000000004";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", {exact:true}).fill("tutor");
  await page.getByLabel("Пароль", {exact:true}).fill("fixture-password");
  await page.getByRole("button", {name:"Войти",exact:true}).click();
  await expect(page).toHaveURL("/tutor/schedule");
}
test.beforeEach(async ({request}) => { await request.post(fixture + "/reset-schedule"); await request.post(fixture + "/applications-reset"); });
test("chat polish: support position, legend next to bindings and responsive composer", async ({page}) => {
  await login(page);
  const bindings = await page.getByRole("button", {name:"Бинды",exact:true}).boundingBox();
  await page.getByRole("button",{name:"Обозначения цветов"}).hover();
  await expect(page.getByRole("tooltip")).toHaveText("Обозначения");
  const legend = await page.getByRole("button", {name:"Обозначения цветов"}).boundingBox();
  expect(Math.abs(bindings!.y-legend!.y)).toBeLessThan(3);
  expect(legend!.x).toBeGreaterThan(bindings!.x);
  await page.goto(`/tutor/chats?student=${student}`);
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    const support = page.getByRole("link", {name:"Поддержка в Telegram"});
    await expect(support).toHaveCount(1);
    await expect(support).toHaveAttribute("href","https://t.me/tutorgate");
    const rect = await support.boundingBox();
    expect(Math.abs(rect!.width-rect!.height)).toBeLessThan(1);
    expect(width-rect!.x-rect!.width).toBeLessThanOrEqual(21);
    expect(900-rect!.y-rect!.height).toBeLessThanOrEqual(21);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const composer = await page.locator(".chat-composer").boundingBox();
    expect(composer!.height).toBeLessThan(200);
    const send = await page.getByRole("button",{name:"Отправить",exact:true}).boundingBox();
    expect(send!.y+send!.height).toBeLessThan(rect!.y);
    await page.screenshot({path:`artifacts/chat-polish-${width}.png`,fullPage:true});
  }
});
test("chat polish: toggle formatting, retain drafts, image preview, download and search", async ({page}) => {
  await login(page); await page.goto(`/tutor/chats?student=${student}`);
  const input = page.getByLabel("Сообщение ученику",{exact:true});
  await input.fill("Здравствуйте! Разберём задание на следующем занятии.");
  await input.selectText(); await page.getByRole("button",{name:"Жирный",exact:true}).click();
  await expect(page.locator(".rich-input :is(strong,b)")).toContainText("Здравствуйте");
  await page.getByRole("button",{name:"Жирный",exact:true}).click();
  await expect(page.locator(".rich-input :is(strong,b)")).toHaveCount(0);
  await page.getByRole("button",{name:/Михаил Кузнецов/}).click();
  await expect(input).toHaveText("");
  await page.getByRole("button",{name:/Анна Смирнова/}).click();
  await expect(input).toContainText("Здравствуйте");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=","base64");
  await page.locator('input[type="file"]').setInputFiles({name:"Задание.png",mimeType:"image/png",buffer:png});
  await page.getByRole("button",{name:"Отправить",exact:true}).click();
  await expect(input).toHaveText("");
  const image = page.locator(".chat-image-preview img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button",{name:"Открыть изображение Задание.png"}).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button",{name:"Скачать файл Задание.png"}).click();
  expect((await download).suggestedFilename()).toBeTruthy();
  await page.getByLabel("Поиск диалогов").fill("Анна");
  await expect(page.locator(".chat-contact")).toHaveCount(1);
  await page.screenshot({path:"artifacts/chat-polish-with-image.png",fullPage:true});
});

test("015 formatting at caret and aggregate upload limit",async({page})=>{
 await login(page);await page.goto(`/tutor/chats?student=${student}`);
 const input=page.getByLabel("Сообщение ученику",{exact:true});await input.click();
 await page.getByRole("button",{name:"Жирный",exact:true}).click();await input.pressSequentially("Сразу жирный");
 await expect(input.locator(":is(strong,b)")).toHaveText("Сразу жирный");
 await expect(page.getByRole("button",{name:"Ссылка",exact:true})).toHaveCount(0);
 await page.locator('input[type="file"]').setInputFiles({name:"first.bin",mimeType:"application/octet-stream",buffer:Buffer.alloc(6*1024*1024)});
 await page.locator('input[type="file"]').setInputFiles({name:"second.bin",mimeType:"application/octet-stream",buffer:Buffer.alloc(5*1024*1024)});
 await expect(page.locator(".chat-composer").getByRole("alert")).toContainText("Общий размер файлов");
 await expect(page.locator(".chat-draft-file")).toHaveCount(1);
});

test("016 every formatting toggle stops formatting subsequent typing",async({page})=>{
 await login(page);await page.goto(`/tutor/chats?student=${student}`);
 const input=page.getByLabel("Сообщение ученику",{exact:true});
 for (const [name,tag] of [["Жирный",":is(strong,b)"],["Курсив",":is(em,i)"],["Подчёркивание","u"],["Зачёркивание",":is(s,strike)"]]) {
   await input.fill("");await input.click();
   const button=page.getByRole("button",{name,exact:true});
   await button.click();await input.pressSequentially("styled");
   await button.click();await input.pressSequentially(" plain");
   await expect(input).toHaveText("styled plain");await expect(input.locator(tag)).toHaveText("styled");
   await expect(button).toHaveAttribute("aria-pressed","false");
 }
 await expect(page.getByText("Переписка через Telegram",{exact:true})).toHaveCount(0);
 await page.locator('input[type="file"]').setInputFiles(Array.from({length:10},(_,i)=>({name:`file${i}.txt`,mimeType:"text/plain",buffer:Buffer.from("file")})));
 const strip=page.locator(".chat-draft-files");
 await expect(strip).toHaveCSS("scrollbar-width","thin");
 await strip.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 expect(await strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 await page.screenshot({path:"artifacts/chat-016-scroll.png"});
});

test("016 application search retains filters and compact cards fit mobile",async({page,request})=>{
 await request.post(fixture+"/applications-seed");
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("admin");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/admin/schedule");
 await page.goto("/admin/applications?role=student&status=pending_review");
 const search=page.getByLabel("Поиск заявок по имени или Telegram");
 await expect(page.locator(".admin-application-card")).toHaveCount(2);
 await search.fill("Екатерина");await expect(page.locator(".admin-application-card")).toHaveCount(1);
 await expect(page.locator(".admin-application-card")).toContainText("Соколова");
 await search.fill("@applicant_long_username_1");await expect(page.locator(".admin-application-card")).toContainText("Константинопольский");
 await expect(page).toHaveURL(/role=student&status=pending_review&q=/);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/applications-016-${width}.png`,fullPage:true});}
 await search.fill("no_match");await expect(page.getByRole("heading",{name:"Ничего не найдено"})).toBeVisible();
 await search.fill("");await expect(page.locator(".admin-application-card")).toHaveCount(2);
});
