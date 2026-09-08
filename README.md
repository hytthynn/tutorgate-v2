# TutorGate

## Пакет 015 — чат и сценарий бота

После 014 применить `supabase/migrations/202609080015_chat_composer_cleanup_bot_flow.sql` перед новой версией приложения. Редактор показывает форматирование непосредственно в поле ввода; отдельной кнопки ссылки нет, адреса в сообщениях кликабельны. Лимит вложений — **10 МБ суммарно на сообщение**. При снятии последнего назначения пары удаляются чат и вложения. Бот использует выбор преподавателя, отмену назад к выбору, квитанцию отправки и ответ с обновлением исходного сообщения. Подробности и реальные проверки — [verification](docs/verification.md).


## Пакет 014

Добавлена миграция 014 после 013: статусные цвета и legend, coral temporal lock, центрирование Select, rich text и файлы Web ↔ Telegram до 10 МБ, меню бота и admin review заявок, физическое удаление аккаунтов, поддержка, ограниченная загрузка расписания/дельты чата/страницы каталога.

После применения миграции настройте доверенный часовой запуск `node --env-file=.env.local scripts/cleanup-chat-storage.mjs` для очистки незавершённых загрузок и удалённых вложений. Bucket создаётся приватным через SQL в Supabase. Перед production необходим staging smoke реальных Storage/Auth/Telegram. Состояние проверок и ограничения — [verification](docs/verification.md).


Закрытая платформа для учеников, репетиторов и администратора: назначения, личное расписание, статистика проведённых занятий и регистрация через Telegram.

## Стек

Node.js 24.x · Next.js 16.3.4 (App Router) · React 19.2.8 · TypeScript · Supabase/PostgreSQL · Server Actions · Lucide · Recharts. Версии закреплены в `package-lock.json`; пакет 012 не обновляет версии зависимостей; добавляет отдельную миграцию 012. Постоянная панель управления ботом добавлена миграцией 013.

## Быстрый старт

```bash
npm ci
cp .env.example .env.local
# Заполните .env.local: Supabase, Telegram и APP_URL
npm run dev
```

Примените SQL-миграции 001–013 по порядку. Миграция 008 с новыми enum-значениями должна завершиться отдельным commit до 009. Для базы на 012 примените 013; для базы на 011 — сначала 012, затем 013. Сначала проверьте миграции на staging. Настройка Supabase, Cron, webhook и production: [развёртывание](docs/deployment-vercel.md).

## Проверки

```bash
npm run lint
npm run typecheck
npm test
npm run test:docs
npm run build
npm run test:e2e
```

`npm run test:unit` — быстрые unit/статические регрессии; `npm run test:db` — PGlite с реальными миграциями; E2E использует изолированный Supabase fixture, не production. Для E2E нужен Chromium Playwright. Фактические результаты и ограничения среды: [verification](docs/verification.md).

## Маршруты

- Публичные: `/apply`, `/login`, `/register`, `/forgot-password`, `/reset-password`.
- Ученик: `/student/schedule`, `/student/tutors`.
- Репетитор: `/tutor/schedule`, `/tutor/students`, `/tutor/statistics`, `/tutor/chats`.
- Администратор: `/admin/schedule`, `/admin/chats`, `/admin/tutors`, `/admin/students`, `/admin/statistics`, `/admin/settings`, `/admin/applications`.

## Документация

- [Текущее ТЗ — пакет 014](docs/TZ_TutorGate_014_schedule_chat_bot_accounts_performance.md)
- [Результаты проверки пакета 012](docs/verification.md)
- [Архитектура и инварианты расписания](docs/architecture.md)
- [База данных](docs/database.md) · [Авторизация и Telegram](docs/auth-and-telegram.md)
- [UI](docs/ui-guidelines.md) · [Решения](docs/decisions.md) · [Известные ограничения](docs/known-issues.md)

## Production

Секреты остаются на сервере; браузер получает только opaque HttpOnly cookie. RLS и owner-checks обязательны. SQL-магнит — финальный арбитр конфликтов, клиент не запрашивает скрытые занятия. Cron включается в Supabase отдельно. Перед выкладкой выполните полный CI и staging-проверки: локальные fixture-тесты не подтверждают работу реальных Supabase/Telegram/Vercel.
