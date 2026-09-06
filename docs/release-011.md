# Выпуск 011

Реализованы четыре блока [ТЗ](TZ_TutorGate_011_chat_bot_and_compact_ui.md). Полный production-ready статус требует CI и staging; см. [проверки](verification.md).

## Установка

1. Сделать backup и проверить обновление на staging.
2. Применить [миграцию 011](../supabase/migrations/202609060011_chat_and_telegram_bot.sql) после 010. Старые миграции не менялись. Для новой базы применить 001–011 по порядку; 008 завершить отдельным commit.
3. Выполнить npm ci без обновления lockfile, lint, typecheck, npm test, test:docs, build и test:e2e.
4. Развернуть соответствующий application code с прежними env-переменными.
5. Повторить `npm run telegram:webhook`: обязательны message + callback_query и команда /start.
6. Smoke test двумя staging Telegram-аккаунтами: tutor пишет на сайте; student отвечает через Reply и picker; проверить unread, read marker, delivery failure, лимит 4000 и разделённое длинное сообщение.
7. Проверить /start всех ролей/unlinked, approve/resend/reset через inline-ссылки, silent cancel, снятие назначения и block при открытом чате.
8. Двумя отдельными PostgreSQL-подключениями проверить гонки send/remove-assignment и mark-read/new-message. Fixtures не заменяют этот тест.

Без обновления webhook inline callback-кнопки не работают. Не запускать старый код с новой схемой. Автоматического destructive rollback нет: история сообщений должна сохраняться.

## Ограничения доставки

Bot API не поддерживает idempotency key. Telegram update атомарно создаёт не более одного сообщения в БД; уведомление tutor — at-most-once попытка после commit. Если оно не доставлено, сообщение остаётся на сайте. При сетевом timeout Telegram мог принять исходящее сообщение. При остановке процесса/ошибке delivery audit сообщение может остаться pending; UI показывает «Доставка в Telegram не подтверждена». Автоматического resend нет, чтобы не создавать дубли.

Срок хранения chat history и private mapping определяется владельцем сервиса. Telegram IDs и service key браузеру не передаются. Не публиковать одноразовые URL в логах.
