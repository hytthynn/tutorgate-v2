# TutorGate

Закрытая платформа для учеников, репетиторов и администратора: назначения, личное расписание, статистика проведённых занятий и регистрация через Telegram.

## Стек

Node.js 24.x · Next.js 16.3.4 (App Router) · React 19.2.8 · TypeScript · Supabase/PostgreSQL · Server Actions · Lucide · Recharts. Версии закреплены в `package-lock.json`; пакет 007 не обновляет зависимости и не добавляет миграций.

## Быстрый старт

```bash
npm ci
cp .env.example .env.local
# Заполните .env.local: Supabase, Telegram и APP_URL
npm run dev
```

Примените SQL-миграции 001–006 по порядку. Настройка Supabase, Cron, webhook и production: [развёртывание](docs/deployment-vercel.md).

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
- Репетитор: `/tutor/schedule`, `/tutor/students`, `/tutor/statistics`.
- Администратор: `/admin/schedule`, `/admin/tutors`, `/admin/students`, `/admin/statistics`, `/admin/settings`.

## Документация

- [Текущее ТЗ — пакет 008](docs/TZ_TutorGate_008_schedule_features_and_fixes.md)
- [Архитектура и инварианты расписания](docs/architecture.md)
- [База данных](docs/database.md) · [Авторизация и Telegram](docs/auth-and-telegram.md)
- [UI](docs/ui-guidelines.md) · [Решения](docs/decisions.md) · [Известные ограничения](docs/known-issues.md)
- [История поставок](docs/archive/README.md)

## Production

Секреты остаются на сервере; браузер получает только opaque HttpOnly cookie. RLS и owner-checks обязательны. SQL-магнит — финальный арбитр конфликтов, клиент не запрашивает скрытые занятия. Cron включается в Supabase отдельно. Перед выкладкой выполните полный CI и staging-проверки: локальные fixture-тесты не подтверждают работу реальных Supabase/Telegram/Vercel.
