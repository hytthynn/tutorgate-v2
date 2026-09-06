import { test, expect, type Page } from "@playwright/test";
const f = "http://127.0.0.1:54329/fixtures",
  tutor = "00000000-0000-4000-8000-000000000002",
  student = "00000000-0000-4000-8000-000000000004";
async function login(page: Page, role = "tutor") {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(role);
  await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(`/${role}/schedule`);
}
test.beforeEach(async ({ request }) => {
  await request.post(f + "/reset-schedule");
  await request.post(f + "/applications-reset");
});
test("011 new draft empty subject and missing students", async ({
  page,
  request,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Добавить занятие", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Предмет", exact: true }),
  ).toHaveText("Сначала выберите ученика");
  await expect(page.getByText("__historical__", { exact: false })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await request.post(f + "/scenario", { data: { mode: "no-students" } });
  await page.reload();
  await page
    .getByRole("button", { name: "Добавить занятие", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Ученик", exact: true }),
  ).toHaveText("Нет доступных учеников");
  await expect(
    page.getByRole("combobox", { name: "Ученик", exact: true }),
  ).toBeDisabled();
});
test("011 send, Shift+Enter, Reply/dedupe, polling/unread, removed assignment", async ({
  page,
  request,
}) => {
  await login(page);
  await page.goto(`/tutor/chats?student=${student}`);
  const composer = page.getByLabel("Сообщение ученику", { exact: true });
  await composer.fill("Добрый день");
  await composer.press("Shift+Enter");
  await composer.pressSequentially("Продолжение");
  await expect(composer).toHaveValue("Добрый день\nПродолжение");
  await composer.press("Enter");
  await expect(page.locator(".chat-bubble.is-tutor")).toContainText(
    "Продолжение",
  );
  await expect(composer).toHaveValue("");
  const state = await (await request.get(f + "/chat-state")).json();
  const replyId = Number(Object.keys(state.links)[0].split(":")[1]);
  const update = {
    update_id: 80001,
    message: {
      text: "Ответ через Telegram Reply",
      from: { id: 100004 },
      chat: { id: 100004, type: "private" },
      reply_to_message: { message_id: replyId },
    },
  };
  await page.goto("/tutor/students");
  for (let n = 0; n < 2; n++)
    expect(
      (
        await request.post("/api/telegram/webhook", {
          headers: { "x-telegram-bot-api-secret-token": "fixture-webhook" },
          data: update,
        })
      ).ok(),
    ).toBe(true);
  await expect(page.locator(".nav-unread")).toHaveText("1", { timeout: 12000 });
  const after = await (await request.get(f + "/chat-state")).json();
  expect(
    after.messages.filter(
      (m: { body: string }) => m.body === update.message.text,
    ),
  ).toHaveLength(1);
  await page.goto(`/tutor/chats?student=${student}`);
  await expect(page.locator(".chat-bubble.is-student")).toContainText(
    update.message.text,
    { timeout: 12000 },
  );
  await expect(page.locator(".nav-unread")).toHaveCount(0, { timeout: 12000 });
  await request.post(f + "/chat-unassign", { data: { student, tutor } });
  await expect(
    page.getByRole("heading", { name: "Чат недоступен" }),
  ).toBeVisible({ timeout: 12000 });
});
test("011 failed Telegram delivery, last 200 and responsive chat", async ({
  page,
  request,
}, info) => {
  await request.post(f + "/chat-seed", {
    data: { student, tutor, count: 201 },
  });
  await login(page);
  await page.goto(`/tutor/chats?student=${student}`);
  await expect(
    page.getByText("Показаны последние 200 сообщений диалога."),
  ).toBeVisible();
  await expect(page.locator(".chat-bubble")).toHaveCount(200);
  await request.post(f + "/behavior", { data: { op: "send", fail: true } });
  await page
    .getByLabel("Сообщение ученику", { exact: true })
    .fill("Проверка ошибки Telegram");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(
    page.getByText("Не доставлено в Telegram", { exact: true }),
  ).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`chat-${width}.png`),
      fullPage: true,
    });
  }
});
for (const [role, path] of [
  ["admin", "students"],
  ["admin", "tutors"],
  ["tutor", "students"],
  ["student", "tutors"],
])
  test(`011 compact ${role}/${path}`, async ({ page }) => {
    await login(page, role);
    await page.goto(`/${role}/${path}`);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const row of await page.locator(".person-row").all())
        expect(
          await row.evaluate((el) =>
            parseFloat(getComputedStyle(el).paddingTop),
          ),
        ).toBeLessThanOrEqual(14);
    }
  });
