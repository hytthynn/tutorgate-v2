# Проверки пакета 012

Дата: 06.09.2026. [Текущее ТЗ](TZ_TutorGate_012_chat_admin_schedule_ui_fixes.md).

Проверки выполняются с установленными закреплёнными зависимостями проекта. Версии и lockfile не менялись. Полная цепочка миграций 001–012 проверяется в PGlite; браузерные тесты запускают настоящий Next с локальными Supabase/Telegram fixtures. Production Supabase и Telegram не использовались, миграция на рабочую БД не применялась.

## Результаты

Все обязательные команды выполнены успешно:

| Команда | Результат |
|---|---|
| `npm run lint` | Без ошибок и предупреждений |
| `npm run typecheck` | Пройдено |
| `npm test` | 121/121, без пропусков |
| `npm run test:docs` | Markdown-ссылки корректны |
| `npm run build` | Production-сборка успешна |
| `npm run test:e2e` | 73/73, полный повторный прогон за 5,8 минуты |

В первом полном E2E-прогоне новый сценарий упёрся в пятисекундное ожидание входа во время параллельной пересборки. Ожидание входа увеличено до 15 секунд; повторный полный прогон без параллельной нагрузки прошёл целиком.

Логи: `artifacts/package-012-lint.log`, `artifacts/package-012-typecheck.log`, `artifacts/package-012-tests.log`, `artifacts/package-012-docs.log`, `artifacts/package-012-build.log`, `artifacts/package-012-e2e.log`.

## Регрессии

- Telegram: видимая повторная отмена и меню, stale callback без мутации, очистка только недоступного recipient, сохранение другого активного recipient, Reply на последней части, callback ≤64 bytes, native Reply priority, dedupe, admin notification URL и shortcut.
- Chat DB: teacher=tutor/admin, личные назначения admin, запрет чужих диалогов, service-only notification/cleanup, account status, delivery mapping и текстовый лимит.
- Delegated DB: actor/owner, active teacher target, admin→admin, UUID, target assignments, create/edit/note, move/paste/transfer, color/completed/delete, availability, rollover, owner canonical data, cross-owner signed restore, self-admin offset и запрет delegated offset/offsetChanged restore, прямые writes закрыты. Общие suites продолжают проверять exclusion constraints и атомарный magnet.
- E2E: переход из /admin/tutors, target query и имя, создание/редактирование target lesson и note, completion, disabled offset, сохранение target при навигации, отсутствие посторонних учеников в форме; admin-chat roundtrip через mocked delivery; settings bounding boxes на 1440/1100/768/390 px, включая искусственное увеличение высоты Subjects.

## Визуальная проверка

Снимки настоящих страниц в `artifacts/package-012-settings-*.png`, `artifacts/package-012-admin-chat.png`, `artifacts/package-012-delegated.png`. Desktop settings, admin chat и delegated editor просмотрены: Telegram сразу под ставкой, предметы справа, удалённые пояснения отсутствуют. Screenshot fixtures не подтверждают внешнюю доставку Telegram.

## Выпуск

Для базы, на которой уже применены 001–011, выполнить целиком `supabase/migrations/202609060012_admin_chat_schedule_fixes.sql` от владельца БД перед запуском нового приложения. Миграция содержит begin/commit и общий schedule advisory lock. Исторические миграции не изменены. После обновления окружения проверить реальный Telegram roundtrip student↔admin, cancel/reply, собственное и delegated расписание.
