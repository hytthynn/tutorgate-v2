import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { choose } from "./select";
import { week, day } from "./dates";
const fixture = "http://127.0.0.1:54329/fixtures";
const card = (page: Page, id = 100) => page.locator(`[data-lesson-id="00000000-0000-4000-8000-${String(id).padStart(12, "0")}"]`);
const status = (page: Page) => page.locator(".schedule-save-status");
async function login(page: Page, role = "tutor") {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(role);
  await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(`/${role}/schedule`);
  await page.goto(`/${role}/schedule?week=${week}&day=${week}`);
}
async function hoverDrag(page: Page, date: number, startMinute: number) {
  const from = (await card(page).boundingBox())!, grid = (await page.locator(".schedule-grid").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Cross the 7px gesture threshold even when the final move is only 5 minutes.
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2);
  await page.mouse.move(grid.x + grid.width * (date + .5) / 7, grid.y + grid.height * (startMinute + 30) / 1440, { steps: 10 });
}
async function behavior(request: APIRequestContext, op: string, fail = false) {
  await request.post(`${fixture}/behavior`, { data: { op, delay: 1200, fail } });
}
async function newLesson(page: Page) {
  await page.getByRole("button", { name: "Добавить занятие", exact: true }).click();
  await choose(page, "Ученик", "Анна Смирнова");
  await choose(page, "Предмет", "Математика");
  await page.getByLabel("Начало", { exact: true }).fill("17:00");
}
async function loading(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button.locator("svg.spin")).toBeVisible();
}
test.beforeEach(async ({ page, request }) => {
  await request.post(`${fixture}/reset-schedule`);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test("visual magnet precedes pointerup, excludes own card and chooses later tie", async ({ page }) => {
  await login(page);
  await expect(status(page)).toHaveText("Сохранено");
  await expect(card(page).locator(".lesson-check")).toHaveCount(0);
  const padding = await card(page).evaluate(el => getComputedStyle(el).paddingLeft);
  expect(padding).toBe("4px");
  await hoverDrag(page, 0, 12 * 60);
  const preview = page.locator(".schedule-lesson.is-dragging");
  await expect(preview).toContainText("13:00–14:00");
  const previewBox = (await preview.boundingBox())!, busyBox = (await card(page, 101).boundingBox())!;
  expect(previewBox.y).toBeGreaterThanOrEqual(busyBox.y + busyBox.height - .5);
  await page.mouse.up();
  await expect(status(page)).toHaveText("Сохранено");
  await expect(card(page)).toContainText("13:00–14:00");
  await page.reload(); await expect(card(page)).toContainText("13:00–14:00");
  await hoverDrag(page, 0, 13 * 60 + 5);
  await expect(page.locator(".is-dragging")).toContainText("13:05–14:05");
  await page.mouse.up();
  await expect(status(page)).toHaveText("Сохранено");
  await page.reload();
  await expect(card(page)).toContainText("13:05–14:05");
});

test("hidden student conflict is resolved only on server, normalized response wins", async ({ page, request }) => {
  await request.post(`${fixture}/scenario`, { data: { mode: "hidden" } });
  await login(page);
  await expect(card(page, 900)).toHaveCount(0);
  await hoverDrag(page, 0, 14 * 60);
  await expect(page.locator(".is-dragging")).toContainText("14:00–15:00");
  await page.mouse.up();
  await expect(card(page)).toContainText("15:00–16:00");
  await expect(page.locator(".tg-toast").filter({ hasText: "14:00 занято — занятие поставлено на 15:00." })).toBeVisible();
  await expect(card(page, 900)).toHaveCount(0);
});

test("full local day has no overlapping preview or mutation and one drop toast", async ({ page, request }) => {
  await request.post(`${fixture}/scenario`, { data: { mode: "full-day" } });
  await login(page); await hoverDrag(page, 1, 12 * 60);
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  await expect(page.locator(".tg-toast")).toHaveCount(0);
  await expect(card(page)).toContainText("10:00–11:00");
  await page.mouse.up();
  await expect(page.locator(".tg-toast").filter({ hasText: "В выбранном дне нет свободного интервала для этого занятия." })).toHaveCount(1);
  const state = await (await request.get(`${fixture}/state`)).json();
  expect(state.actionCounts.patch_schedule_lesson ?? 0).toBe(0);
  await expect(status(page)).toHaveText("Сохранено");
});

test("Add tooltip exists only on past/future weeks", async ({ page }) => {
  await login(page);
  const add = page.getByRole("button", { name: "Добавить занятие", exact: true });
  await add.hover(); await expect(page.getByRole("tooltip", { name: "Добавить занятие", exact: true })).toHaveCount(0);
  expect(await add.evaluate(el => !!el.closest(".tg-tooltip"))).toBe(false);
  await page.getByRole("button", { name: "Предыдущая неделя", exact: true }).click();
  await expect(add).toBeDisabled(); await add.locator("..").hover();
  await expect(page.getByRole("tooltip", { name: "Добавлять занятия можно только в текущей неделе.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Текущая", exact: true }).click();
  await page.getByRole("button", { name: "Следующая неделя", exact: true }).click();
  await add.locator("..").hover();
  await expect(page.getByRole("tooltip", { name: "Занятия будущей недели появятся автоматически в начале недели.", exact: true })).toBeVisible();
});

test("move pending/error rolls back and error persists until next successful write", async ({ page, request }) => {
  await login(page); await behavior(request, "patch_schedule_lesson", true);
  await hoverDrag(page, 1, 14 * 60); await page.mouse.up();
  await expect(status(page)).toHaveText("Сохранение…");
  await expect(status(page).locator(".spin")).toBeVisible();
  await expect(status(page)).toHaveText("Не сохранено");
  await expect(card(page)).toContainText("10:00–11:00");
  await expect(card(page)).toHaveAttribute("data-date", week);
  await page.getByRole("button", { name: "Бинды", exact: true }).click();
  await page.keyboard.press("Escape"); await expect(status(page)).toHaveText("Не сохранено");
  await behavior(request, "patch_schedule_lesson");
  await card(page).click({ button: "middle" });
  await expect(status(page)).toHaveText("Сохранение…");
  await expect(status(page)).toHaveText("Сохранено");
  await expect(card(page).getByTestId("lesson-completed")).toBeVisible();
});

test("create/update loading, validation, status and failure recovery share one contract", async ({ page, request }) => {
  await login(page);
  await page.getByRole("button", { name: "Добавить занятие", exact: true }).click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(status(page)).toHaveText("Сохранено"); // local schema rejection, no request
  await choose(page, "Ученик", "Анна Смирнова"); await choose(page, "Предмет", "Математика");
  await page.getByLabel("Начало", { exact: true }).fill("17:00");
  await behavior(request, "save_schedule_lesson", true);
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(status(page)).toHaveText("Сохранение…");
  await expect(status(page)).toHaveText("Не сохранено");
  await expect(page.getByRole("button", { name: "Добавить", exact: true })).toBeEnabled();
  await behavior(request, "save_schedule_lesson");
  await page.getByRole("button", { name: "Добавить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button",{name:"Добавить занятие",exact:true})).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(status(page)).toHaveText("Сохранено");
  const saved = page.locator(".schedule-lesson").filter({ hasText: "17:00–18:00" });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await saved.click(); await expect(page.getByLabel("Заметка")).toBeEnabled();
  await behavior(request, "save_schedule_lesson");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status(page)).toHaveText("Сохранение…");
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(status(page)).toHaveText("Сохранено");
  const state = await (await request.get(`${fixture}/state`)).json();
  expect(state.actionCounts.save_schedule_lesson).toBe(3);
});

test("directory debounce, immediate selection, race, clear and Back restore", async ({ page }) => {
  await login(page, "admin"); await page.goto("/admin/tutors");
  const initialHistory = await page.evaluate(() => history.length);
  await expect(page.getByRole("button", { name: "Найти", exact: true })).toHaveCount(0);
  await page.getByLabel("Поиск по ФИО").fill("Мария");
  // Synchronously after input, debounce has not committed a URL yet.
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await choose(page, "Фильтр по предмету", "Математика");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("Мария");
  await expect.poll(() => new URL(page.url()).searchParams.get("subject")).toBe("00000000-0000-4000-8000-000000000010");
  await expect(page.getByText("Дмитрий Лебедев", { exact: true })).toHaveCount(0);
  await page.getByLabel("Поиск по ФИО").fill("");
  await expect.poll(() => new URL(page.url()).searchParams.has("q")).toBe(false);
  expect(new URL(page.url()).searchParams.has("subject")).toBe(true);
  expect(await page.evaluate(() => history.length)).toBe(initialHistory);
  await page.getByRole("link", { name: "Ученики", exact: true }).click(); await expect(page).toHaveURL("/admin/students");
  await page.goBack();
  await expect(page.getByLabel("Фильтр по предмету")).toHaveText("Математика");
  await expect(page.getByLabel("Поиск по ФИО")).toHaveValue("");
});

test("statistics controls auto-apply, invalid dates stay local, preset removes dates", async ({ page }) => {
  await login(page, "admin"); await page.goto("/admin/statistics");
  await expect(page.getByRole("button", { name: "Применить", exact: true })).toHaveCount(0);
  await choose(page, "Показатель", "Часы");
  await expect.poll(() => new URL(page.url()).searchParams.get("metric")).toBe("hours");
  await page.getByText("14 дней", { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("period")).toBe("14");
  await choose(page, "Репетитор для статистики", "Мария Соколова");
  await expect.poll(() => new URL(page.url()).searchParams.get("tutor")).toBe("00000000-0000-4000-8000-000000000002");
  await page.getByText("Свой период", { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("period")).toBe("custom");
  const previous = page.url();
  await page.getByLabel("Дата от").fill("");
  await expect(page.getByLabel("Дата от")).toHaveAttribute("aria-invalid", "true"); expect(page.url()).toBe(previous);
  await page.getByLabel("Дата от").fill("9998-12-31"); expect(page.url()).toBe(previous);
  await page.getByLabel("Дата от").fill(day(0)); await page.getByLabel("Дата до").fill(day(6));
  await expect.poll(() => new URL(page.url()).searchParams.get("to")).toBe(day(6));
  await expect.poll(() => new URL(page.url()).searchParams.get("from")).toBe(day(0));
  await page.getByText("7 дней", { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has("from")).toBe(false);
  expect(new URL(page.url()).searchParams.has("to")).toBe(false);
});

test("subject dropdowns omit search; tutor/student dropdowns retain it", async ({ page }) => {
  await login(page); await newLesson(page);
  await page.getByLabel("Предмет", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Поиск в списке", exact: true })).toHaveCount(0);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await page.getByLabel("Предмет", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Предмет", { exact: true })).toBeFocused();
  await page.getByLabel("Ученик", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Поиск в списке", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Ученик", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await login(page, "admin"); await page.goto("/admin/tutors");
  await page.getByLabel("Фильтр по предмету").click();
  await expect(page.getByRole("combobox", { name: "Поиск в списке", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape"); await page.goto("/admin/students");
  await page.getByLabel("Фильтр по репетитору").click();
  await expect(page.getByRole("combobox", { name: "Поиск в списке", exact: true })).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Назначения", exact: true }).first().click();
  await page.getByLabel("Предмет", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Поиск в списке", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Математика", exact: true }).click();
  await page.getByLabel("Репетитор", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Поиск в списке", exact: true })).toBeVisible();
});

test("student sees assigned administrator's name without role subtitle", async ({ page }) => {
  await login(page, "student"); await page.goto("/student/tutors");
  const row = page.locator(".person-row").filter({ hasText: "Александр Волков" });
  await expect(row.locator("strong")).toHaveText("Александр Волков");
  await expect(row.locator(".person-name small")).toHaveCount(0);
  await expect(page.getByText("Администратор · Репетитор", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sidebar .account small")).toHaveText("Ученик");
});

test("admin assignment, removal, subjects and rate actions use shared loading", async ({ page, request }) => {
  await login(page, "admin"); await page.goto("/admin/students");
  await page.getByRole("button", { name: "Назначения", exact: true }).first().click();
  await choose(page, "Предмет", "Физика"); await choose(page, "Репетитор", "Мария Соколова");
  await behavior(request, "student_tutor_assignments");
  await page.getByRole("button", { name: "Назначить репетитора", exact: true }).click(); await loading(page, "Назначаем…");
  await expect(page.getByRole("button", { name: "Назначить репетитора", exact: true })).toBeEnabled();
  await behavior(request, "student_tutor_assignments");
  await page.getByRole("button", { name: "Снять назначение", exact: true }).first().click(); await loading(page, "Снятие назначения…");
  await expect(page.getByRole("button", { name: "Снятие назначения…", exact: true })).toHaveCount(0);
  await page.goto("/admin/settings");
  await page.getByLabel("Новый предмет", { exact: true }).fill("Тестовый предмет");
  await behavior(request, "subjects"); await page.getByRole("button", { name: "Добавить", exact: true }).click(); await loading(page, "Добавляем…");
  await expect(page.getByRole("button", { name: "Добавить", exact: true })).toBeEnabled();
  await behavior(request, "app_settings"); await page.getByRole("button", { name: "Сохранить ставку", exact: true }).click(); await loading(page, "Сохраняем…");
  await expect(page.getByRole("button", { name: "Сохранить ставку", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Удалить предмет Математика", exact: true }).click();
  await behavior(request, "delete_subject_hard"); await page.getByRole("button", { name: "Удалить предмет", exact: true }).click(); await loading(page, "Удаляем…");
  // A modal hides background buttons from role locators before deletion finishes.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Удалить предмет Математика", exact: true })).toHaveCount(0);
  await page.goto("/admin/tutors"); await page.getByRole("button", { name: "Предметы", exact: true }).first().click();
  await behavior(request, "set_tutor_subjects"); await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click(); await loading(page, "Сохраняем…");
  await expect(page.getByRole("button", { name: "Сохранить изменения", exact: true })).toBeEnabled();
});

test("login, application and logout show accessible loading", async ({ page, request }) => {
  await page.goto("/login"); await page.getByLabel("Логин", { exact: true }).fill("tutor");
  await page.getByLabel("Пароль", { exact: true }).fill("fixture-password");
  await behavior(request, "lookup_alias"); await page.getByRole("button", { name: "Войти", exact: true }).click(); await loading(page, "Входим…");
  await expect(page).toHaveURL("/tutor/schedule");
  await behavior(request, "logout"); await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click(); await loading(page, "Выход из аккаунта…");
  await expect(page).toHaveURL("/login");
  await page.goto("/apply"); await page.getByLabel("ФИО", { exact: true }).fill("Тестовый Ученик");
  await page.getByLabel("Telegram", { exact: true }).fill("test_student");
  await page.getByLabel("Математика", { exact: true }).check();
  await page.getByLabel("Цель занятий", { exact: true }).click(); await page.getByRole("option").nth(1).click();
  await page.getByLabel("Я согласен с обработкой персональных данных").check();
  await behavior(request, "rate_limit"); await page.getByRole("button", { name: "Подать заявку", exact: true }).click(); await loading(page, "Отправляем…");
  await expect(page.getByRole("heading", { name: "Подтвердите Telegram", exact: true })).toBeVisible();
});
