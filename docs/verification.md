# Проверка пакета 008 — 05.09.2026

Реализовано [ТЗ 008](TZ_TutorGate_008_schedule_features_and_fixes.md). Среда: Windows, Node 24.19.0, Next.js 16.3.4. Версии зависимостей и lockfile сохранены.

## Фактически выполненные проверки

| Команда | Результат |
|---|---|
| `npm ci` | Пройдена; 444 пакета установлено, аудит без уязвимостей. npm сообщил существующие peer-dependency warnings ESLint и уведомления allow-scripts |
| `npm run lint` | Пройдена |
| `npm run typecheck` | Пройдена |
| `npm test` | 65/65, без пропусков; unit и реальные PostgreSQL-миграции в PGlite |
| `npm run test:docs` | Пройдена |
| `npm run build` | Production-сборка и генерация страниц пройдены |
| `npm run test:e2e` | 42/42, Chromium, один worker, 4,1 минуты |

После полного прогона выполнен `npm run test:e2e -- tests/e2e/schedule-features.spec.ts`: 8/8 за 31,7 секунды. Проверены две строки вместо трёх в компактной inactive-карточке, keyboard undo после transfer и undo личного offset ученика без потери статусов. При этом найдена и исправлена потеря сочетаний клавиш после отключения select на время pending: listener действует в пределах смонтированной страницы расписания, исключая текстовые поля, combobox и dialogs. После исправлений повторно пройдены lint, typecheck и production build.

## Что проверено

- Удаление footer/CTA, admin label, сохранение ставки и её пустое значение, client/server validation, loading, success-state forgot/reset/application/register.
- Conflict classes и четыре ограничения tutor/student, normal↔coral, inactive overlaps, запрет coral↔coral/recolor conflict; приватные заметки и границы ролей.
- Перенос одиночного занятия и группы, текущая/следующая неделя, запрет повторного target transfer и недели после следующей, копирование заметок, completed reset, полная атомарность ошибки группы.
- Availability только для пары tutor/student, включительная дата, отмена, сохранение transferred inactivity, полный rollback при конфликте реактивации; inactive детали, lanes, rectangle eligibility.
- Group drag, общий delta, paste anchor и относительное расположение, undo/redo с реальным восстановлением UUID/notes/status, подписи, scope, stale snapshots, исключение чужих данных и сохранение независимых изменений.
- Rollover пропускает transferred source, не дублирует next-week target, очищает transfer marker recurring-копии, учитывает availability и сохраняет note/duration/color.
- Мгновенное изменение карточек до задержанного ответа, единый SaveState, полный rollback и восстановление draft после ошибки create/edit, отсутствие RSC refresh при CRUD.
- Desktop и mobile (320/375/430 px), responsive страницы при 375/768/1280/1440 px, мышь/touch/keyboard. Скриншот `artifacts/schedule-008-overlap.png` проверен визуально.

## Границы проверки и применение

E2E использует настоящее Next-приложение и только локальный fixture-сервер `tests/e2e/server.mjs`; SQL/RLS проверяется отдельно выполнением всех миграций в PGlite. Настоящие Supabase/Auth/Telegram и production не использовались. Миграция [202609050007_schedule_features.sql](../supabase/migrations/202609050007_schedule_features.sql) подготовлена, но к рабочей Supabase не применялась. При развёртывании применить её после 006 до включения нового приложения; существующий Cron продолжает использовать обновлённую функцию rollover.

[Предыдущий итоговый отчёт 007](archive/verification-007-final.md) сохранён в архиве. Старые логи в verification-logs и материалы verification-ui относятся к прошлому пакету.
