import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const week = "2026-08-31";
const lesson = (page: Page, n: number) => page.locator(`[data-lesson-id="00000000-0000-4000-8000-${String(n).padStart(12, "0")}"]`);
async function signIn(page: Page, role = "tutor") {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(role);
  await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(`/${role}/schedule`);
  await page.goto(`/${role}/schedule?week=${week}`);
  await expect(page.getByRole("group", { name: "Календарь занятий" })).toBeVisible();
}
async function settled(page: Page) { await expect(page.locator(".schedule-workspace")).toHaveAttribute("aria-busy", "false"); }
async function drag(page: Page, card: Locator, day: number, minute: number) {
  const from = (await card.boundingBox())!, grid = (await page.locator(".schedule-grid").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + grid.width * (day + .5) / 7, grid.y + grid.height * minute / 1440, { steps: 10 });
  await page.mouse.up(); await settled(page);
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/fixtures/reset-schedule"); });

test("desktop calendar: CRUD, selection, menu, completion and bulk delete", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await expect(page.locator(".schedule-day")).toHaveCount(7);
  for (const time of ["00:00", "24:00"]) await expect(page.getByText(time, { exact: true })).toBeInViewport();
  expect(await page.locator(".schedule-grid").evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  const a = lesson(page, 100);
  await expect(a).toContainText("Анна Смирнова"); await expect(a).toContainText("10:00–11:00");
  await a.click(); await expect(a).toHaveAttribute("aria-pressed", "true");
  await a.click(); await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Заметка")).toHaveValue("PRIVATE_TUTOR_NOTE_секрет");
  await page.getByLabel("Длительность, мин").fill("90");
  await page.getByLabel("Предмет", { exact: true }).selectOption({ label: "Физика" });
  await page.getByLabel("Заметка").fill("Новая заметка");
  await page.getByLabel("Заметка").press("Delete");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(a).toContainText("10:00–11:30");
  await a.click({ button: "middle" }); await settled(page); await expect(a).toContainText("✓");
  await a.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByText("Приостановить", { exact: true })).toHaveCount(0);
  for (const name of ["Перенести…", "Заниматься с…", "Отчёт по ученику"]) await expect(page.getByRole("menuitem", { name: new RegExp(name) })).toBeDisabled();
  await page.getByRole("menuitemradio", { name: "Голубой" }).click(); await settled(page);
  await expect(a).toHaveAttribute("data-color", "blue");
  await a.click({ button: "right" }); await page.getByRole("menuitem", { name: "Снять отметку" }).click(); await settled(page); await expect(a).not.toContainText("✓");
  await page.getByRole("button", { name: "Добавить занятие" }).click();
  await page.getByLabel("Ученик", { exact: true }).selectOption({ label: "Анна Смирнова" });
  await page.getByLabel("День", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Начало", { exact: true }).fill("14:03");
  await page.getByLabel("Предмет", { exact: true }).selectOption({ label: "Физика" });
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".schedule-lesson").filter({ hasText: "14:03–15:03" })).toBeVisible();
  await expect(page.locator(".schedule-summary")).toContainText("4 занятий · 4 ч 30 мин");
  const box = (await page.locator(".schedule-grid").boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height * 9 / 24);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 7 - 1, box.y + box.height * 14 / 24, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.schedule-lesson[aria-pressed="true"]')).toHaveCount(2);
  await page.keyboard.press("Delete"); await settled(page);
  await expect(a).toHaveCount(0); await expect(lesson(page, 101)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Занятие удалено");
  await expect(page.locator(".schedule-summary")).toContainText("2 занятий · 2 ч 0 мин");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/schedule-desktop.png", fullPage: true });
});

test("drag snaps time, moves days, rolls back overlap and crosses weeks at the edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page);
  const a = lesson(page, 100);
  await drag(page, a, 0, 14 * 60 + 31);
  await expect(a).toContainText("14:00–15:00");
  await drag(page, a, 1, 14 * 60 + 30);
  await expect(a).toHaveAttribute("data-date", "2026-09-01");
  await drag(page, a, 0, 12 * 60 + 30);
  await expect(page.locator(".schedule-notice[role=alert]")).toContainText("Это время уже занято");
  await expect(a).toHaveAttribute("data-date", "2026-09-01");
  const from = (await a.boundingBox())!, grid = (await page.locator(".schedule-grid").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(grid.x + grid.width - 3, grid.y + grid.height * 15 / 24, { steps: 10 });
  await expect(page).toHaveURL(/week=2026-09-07/);
  await page.mouse.move(grid.x + grid.width * .5 / 7, grid.y + grid.height * 15 / 24, { steps: 2 });
  await page.mouse.up(); await settled(page);
  await expect(a).toHaveAttribute("data-date", "2026-09-07");
  await page.reload(); await expect(a).toHaveAttribute("data-date", "2026-09-07");
});

test("cross-week continuation and actual statistics use split hours and start-day count", async ({ page }) => {
  await signIn(page);
  const crossing = lesson(page, 102);
  await expect(crossing).toHaveAttribute("data-date", "2026-09-06");
  await crossing.click({ button: "middle" }); await settled(page);
  await page.getByRole("button", { name: "Следующая неделя", exact: true }).click();
  await expect(crossing).toContainText("продолжение до 01:00");
  await expect(page.locator(".schedule-summary")).toContainText("0 занятий · 1 ч 0 мин");
  await page.goto("/tutor/statistics?period=custom&from=2026-09-07&to=2026-09-07&metric=hours");
  await expect(page.locator(".kpi-card").nth(0).locator("strong")).toContainText("1 500");
  await expect(page.locator(".kpi-card").nth(1).locator("strong")).toContainText("1");
  await expect(page.locator(".kpi-card").nth(2).locator("strong")).toHaveText("0");
});

test("student details are read-only and never include the private note payload", async ({ page }) => {
  const responses: string[] = [];
  page.on("response", async (r) => { if (r.url().includes("/student/schedule")) { try { responses.push(await r.text()); } catch {} } });
  await signIn(page, "student");
  await expect(page.locator(".schedule-lesson")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Добавить занятие" })).toHaveCount(0);
  const a = lesson(page, 100);
  await a.click(); await page.keyboard.press("Delete"); await expect(a).toBeVisible();
  await a.click({ button: "middle" }); await expect(a).not.toContainText("✓");
  await a.click({ button: "right" }); await expect(page.getByRole("menu")).toHaveCount(0);
  await drag(page, a, 1, 14 * 60 + 30); await expect(a).toHaveAttribute("data-date", "2026-08-31");
  // A selected lesson opens with Enter; drag in student mode may already open details.
  if (!await page.getByRole("dialog").count()) { await a.focus(); await page.keyboard.press("Enter"); }
  await expect(page.getByRole("dialog")).toContainText("Мария Соколова");
  await expect(page.getByRole("dialog")).toContainText("Запланировано");
  await expect(page.getByLabel("Заметка")).toHaveCount(0);
  expect(await page.content()).not.toContain("PRIVATE_TUTOR_NOTE");
  expect(responses.join("")).not.toContain("PRIVATE_TUTOR_NOTE");
});

test("navigation, invalid URL and persisted MSK offset", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Месяц", { exact: true }).selectOption("8");
  await expect(page.getByLabel("Неделя", { exact: true }).locator("option")).toHaveCount(5);
  await page.getByLabel("Сдвиг МСК").selectOption("2"); await settled(page);
  await expect(lesson(page, 100)).toContainText("12:00–13:00");
  await page.reload(); await expect(page.getByLabel("Сдвиг МСК")).toHaveValue("2");
  await page.getByRole("button", { name: "Следующая неделя", exact: true }).click();
  await expect(page).toHaveURL(/week=2026-09-07/);
  await page.goBack(); await expect(page).toHaveURL(/week=2026-08-31/);
  await expect(lesson(page, 100)).toContainText("12:00–13:00");
  await page.goto("/tutor/schedule?week=2026-02-30");
  await expect(page).not.toHaveURL(/2026-02-30/);
  await expect(page.locator(".schedule-now-line")).toHaveCount(1);
  await page.getByLabel("Месяц", { exact: true }).selectOption("7");
  await page.getByRole("button", { name: "Текущая", exact: true }).click();
  const currentMonth = new Date(Date.now() + 5 * 3600000).getUTCMonth();
  await expect(page.getByLabel("Месяц", { exact: true })).toHaveValue(String(currentMonth));
});

for (const [width, height] of [[320, 700], [375, 812], [430, 932]]) {
  test(`mobile ${width}: whole day, navigation and tap editor`, async ({ browser, request }) => {
    await request.post("http://127.0.0.1:54329/fixtures/reset-schedule");
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await signIn(page);
      // Explicitly select Monday; current-week initial selection is today's local day.
      await page.goto("/tutor/schedule?week=2026-08-24");
      await page.getByRole("button", { name: "Следующий день", exact: true }).click();
      await expect(page.locator('.schedule-day[data-mobile-active="true"]')).toHaveAttribute("data-date", "2026-08-25");
      await page.goto("/tutor/schedule?week=2026-08-31");
      while ((await page.locator('.schedule-day[data-mobile-active="true"]').getAttribute("data-date")) !== week) await page.getByRole("button", { name: "Предыдущий день", exact: true }).click();
      await expect(page.locator(".schedule-day:visible")).toHaveCount(1);
      for (const time of ["00:00", "24:00"]) await expect(page.getByText(time, { exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const a = lesson(page, 100);
      await a.tap(); await a.tap(); await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByLabel("Заметка")).toHaveValue("PRIVATE_TUTOR_NOTE_секрет");
      await page.getByRole("button", { name: "Отмена", exact: true }).click();
      for (let day = 0; day < 7; day++) await page.getByRole("button", { name: "Следующий день", exact: true }).click();
      await expect(page).toHaveURL(/week=2026-09-07/);
      await expect(page.locator('.schedule-day[data-mobile-active="true"]')).toHaveAttribute("data-date", "2026-09-07");
      await expect(lesson(page, 102)).toContainText("продолжение");
      await page.getByRole("button", { name: "Текущая", exact: true }).click();
      await expect(page.locator('.schedule-day[data-mobile-active="true"]')).toHaveClass(/is-today/);
      await mkdir("artifacts", { recursive: true }); await page.screenshot({ path: `artifacts/schedule-mobile-${width}.png`, fullPage: true });
    } finally { await context.close(); }
  });
}

test("touch drag, long press and mobile actions", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.goto(`/tutor/schedule?week=${week}&day=${week}`);
    const a = lesson(page, 100), cdp = await context.newCDPSession(page);
    const from = (await a.boundingBox())!, grid = (await page.locator(".schedule-grid").boundingBox())!;
    const x = from.x + from.width / 2, y = from.y + from.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (grid.y + grid.height * 14.5 / 24 - y) * step / 8 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settled(page); await expect(a).toContainText("14:00–15:00");
    const moved = (await a.boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: moved.y + moved.height / 2 }] });
    await expect(page.getByRole("menu")).toBeVisible();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.getByRole("menuitem", { name: "Отметить", exact: true }).tap(); await settled(page);
    await expect(a).toContainText("✓");
  } finally { await context.close(); }
});

test("admin calendar stays personal while statistics aggregate/filter teachers", async ({ page, browser }) => {
  await signIn(page);
  await lesson(page, 100).click({ button: "middle" }); await settled(page);
  const admin = await browser.newPage();
  try {
    await signIn(admin, "admin");
    await expect(admin.locator(".schedule-lesson")).toHaveCount(0);
    await admin.goto("/admin/statistics?period=custom&from=2026-08-31&to=2026-08-31&metric=hours");
    await expect(admin.locator(".kpi-card").nth(1).locator("strong")).toContainText("1");
    await admin.getByLabel("Репетитор для статистики").selectOption("00000000-0000-4000-8000-000000000003");
    await admin.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(admin.locator(".kpi-card").nth(1).locator("strong")).toHaveText("0ч");
  } finally { await admin.close(); }
});
