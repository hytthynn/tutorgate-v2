# Проверки пакета 010

Дата: 06.09.2026. Требования: [ТЗ 010](../TZ_TutorGate_010_final.md).

## Фактический прогон

- `npm test`: success, 94 проверки, без пропусков. [Лог](../verification-010-logs/test.log).
- Остальные команды полного прогона выполняются; результат будет записан после завершения.

## Покрытие

- Все migrations 001–010 применяются в PGlite; отдельный тест применяет 010 поверх заполненной схемы 009.
- Admin-only directory, отсутствие приватных полей у peers, NULL username и поиск по всем четырём полям без преобразования Telegram ID в number.
- Student ↔ tutor: назначения, предметы, будущие занятия запрещают смену; прошлые занятия сохраняются. Удаление предмета после смены роли сохраняет историю.
- Block/unblock, FOR UPDATE target, запрет admin-target, отзыв opaque sessions; запоздалые bind/refresh не восстанавливают отозванную сессию. Stale access закрыт через RPC и RLS.
- Soft delete: alias/reset tokens/session/metadata/Telegram PII очищены, lessons, notes и completed history сохраняются; повторное удаление идемпотентно, unblock невозможен.
- Telegram sync: максимум пять запросов одновременно; unchanged/new/NULL/API error/DB error; пропуск deleted. Browser fixtures проверяют Server Action → Bot API adapter → persistence → UI.
- Календарь: меню занятия/пустой точки, snap, условный Paste, Create here, клавиатурная навигация, RU/EN/Meta copy/paste/undo/redo, блокировка shortcut внутри формы, отсутствие mutation-menu у student.
- Скриншоты заявок и статистики в E2E: 320×900, 375×900, 768×1024, 1366×768, 1440×900, 1920×1080; проверяются compact padding, единая desktop-строка фильтров, gap controls/KPI, cursor=text и отсутствие horizontal overflow.

## Границы проверки и выпуск

PGlite исполняет PostgreSQL SQL и RLS, но не заменяет две независимые staging-сессии PostgreSQL/Supabase Auth. E2E использует только локальные fixtures и mock Telegram; реальные аккаунты при тестировании не менялись.

**Не выполнены и не считаются пройденными:** применение на staging Supabase, getChat с настоящим staging-ботом (смена/удаление username), реальная проверка двух конкурентных DB connections и отзыв уже открытой staging-сессии. Подтверждённая staging-среда для этих проверок не предоставлена; наличие локальных конфигурационных файлов не определяет назначение подключённой базы.

Перед выпуском применить [миграцию 010](../../supabase/migrations/202609060010_admin_user_management.sql) после 009, затем развернуть соответствующий код. Старый код не запускать с новой схемой: изменились контракты profile visibility и обновления vault. Выполнить перечисленные staging-проверки. Исторический отчёт: [009](verification-009.md).
