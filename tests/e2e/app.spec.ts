import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function signIn(page: import("@playwright/test").Page, role = "admin") {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(role);
  await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(`/${role}/schedule`);
}
test("public forms, role tabs and responsive layout", async ({ page }) => {
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/apply", "/forgot-password"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator('input[type="email"]')).toHaveCount(0);
    }
  }
  await page.goto("/apply");
  await page.getByRole("tab", { name: "Я репетитор" }).click();
  await expect(page.getByLabel("Опыт преподавания")).toBeVisible();
  await page.getByRole("tab", { name: "Я ученик" }).click();
  await expect(page.getByLabel("Цель занятий")).toBeVisible();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/application-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({
    path: "artifacts/application-mobile.png",
    fullPage: true,
  });
});
test("admin pages, dialog constraints, filters, private session and mobile navigation", async ({
  page,
  context,
}) => {
  await signIn(page);
  const cookies = await context.cookies();
  expect(cookies.filter((c) => c.name.startsWith("sb-"))).toHaveLength(0);
  expect(cookies.find((c) => c.name === "tg_session")?.httpOnly).toBe(true);
  expect(JSON.stringify(cookies)).not.toContain("internal.test");
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/admin/schedule",
      "/admin/tutors",
      "/admin/students",
      "/admin/settings",
      "/admin/statistics",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}`,
      ).toBe(true);
      expect(await page.content()).not.toContain("hidden_alias@internal.test");
    }
  }
  await page.screenshot({
    path: "artifacts/statistics-desktop.png",
    fullPage: true,
  });
  await page.goto("/admin/tutors");
  await page
    .getByRole("button", { name: "Предметы", exact: true })
    .nth(1)
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Поиск по ФИО" }).fill("Мария");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page).toHaveURL(/q=.*&subject=/);
  await expect(page.getByText("Дмитрий Лебедев", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/admin/students");
  await page
    .getByRole("button", { name: "Назначения", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Предмет", { exact: true })
    .selectOption({ label: "Физика" });
  await expect(page.getByLabel("Репетитор", { exact: true })).toContainText(
    "Мария Соколова",
  );
  await expect(page.getByLabel("Репетитор", { exact: true })).not.toContainText(
    "Дмитрий Лебедев",
  );
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("link", { name: "Настройки", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
});
test("role boundaries and webhook secret", async ({ page, request }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL("/login");
  await signIn(page, "student");
  await page.goto("/admin/tutors");
  await expect(page).toHaveURL("/student/schedule");
  await page.goto("/student/tutors");
  await expect(page.getByText("Мария Соколова", { exact: true })).toBeVisible();
  await expect(page.getByText("Открыть Telegram")).toHaveCount(0);
  expect(
    (
      await request.post("/api/telegram/webhook", { data: { update_id: 1 } })
    ).status(),
  ).toBe(403);
  expect((await request.get("/api/telegram/webhook")).status()).toBe(405);
});
