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
  await expect(page.locator(".rich-input strong")).toContainText("Здравствуйте");
  await page.getByRole("button",{name:"Жирный",exact:true}).click();
  await expect(page.locator(".rich-input strong")).toHaveCount(0);
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
 await expect(input.locator("strong")).toHaveText("Сразу жирный");
 await expect(page.getByRole("button",{name:"Ссылка",exact:true})).toHaveCount(0);
 await page.locator('input[type="file"]').setInputFiles({name:"first.bin",mimeType:"application/octet-stream",buffer:Buffer.alloc(6*1024*1024)});
 await page.locator('input[type="file"]').setInputFiles({name:"second.bin",mimeType:"application/octet-stream",buffer:Buffer.alloc(5*1024*1024)});
 await expect(page.locator(".chat-composer").getByRole("alert")).toContainText("Общий размер файлов");
 await expect(page.locator(".chat-draft-file")).toHaveCount(1);
});
