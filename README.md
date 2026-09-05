# TutorGate MVP

Закрытое приложение для учеников, репетиторов и администратора по [ТЗ](TutorGate_MVP_TZ.md). Интерфейс на русском, тёплая тёмная палитра, адаптивные панели.

Реализованы: заявка → подтверждение Telegram → одноразовая регистрация; вход по логину; восстановление через бота; три роли; назначение предметов и преподавателей; настройки; персональное недельное расписание и статистика проведённых занятий по [дополнительному ТЗ](TutorGate_Schedule_TZ.md).

Расписание занимает всю ширину кабинета и показывает 24 часа: семь дней на desktop, один день на mobile. Репетитор и администратор управляют собственными занятиями; ученик открывает только свои детали. Доступны выделение, переносы между днями/неделями, цвет, отметка и удаление. Сдвиг МСК сохраняется для каждого пользователя и применяется также к статистике. Перед запуском обновлённой версии примените миграцию `202609050005_schedule.sql` (включает `btree_gist`).

## Быстрый запуск

Нужны Node.js **24.x**, npm, проект Supabase и бот Telegram.

```bash
npm ci
```

Скопируйте `.env.example` в `.env.local`, заполните значения и примените SQL-миграции из `supabase/migrations/` по порядку. Затем:

```bash
npm run dev
```

Откройте [localhost:3000](http://localhost:3000). Без переменных окружения доступны публичные экраны; вход и отправка заявки требуют настроенный Supabase. Фиктивного режима авторизации нет.

**Полная пошаговая инструкция: [Деплой на Vercel](docs/deployment-vercel.md).** Она включает настройку Supabase, переменных, Telegram webhook и первого администратора.

## Проверки

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Браузерная проверка на изолированных UI-данных:

```bash
npx playwright install chromium
npm run test:e2e
```

E2E самостоятельно запускает Next.js на порту 3100 и локальную заглушку Supabase на 54329. Эти данные не используются приложением при обычном запуске. Проверка настоящих SQL-миграций и RLS выполняется отдельно через PostgreSQL/PGlite в `npm test`. Настоящие GoTrue, PostgREST и Telegram нужно проверить после подключения ваших сервисов.

## Стек

Next.js 16.3.4 / React 19.2.8, TypeScript 7.0.2, Tailwind 4.3.3, shadcn/ui primitives на Radix, Supabase JS 2.115.0 / SSR 0.12.6, Zod 4, React Hook Form, Recharts, Lucide, date-fns. Все прямые версии зафиксированы, npm lockfile включён. Стабильные latest проверены 05.09.2026.

Для ESLint используется официальный `@eslint/compat`; для инструментов, ожидающих TypeScript JS API, — официальный пакет совместимости TypeScript 6. Компиляцию `npm run typecheck` выполняет TypeScript 7. См. ADR-008.

## Маршруты

| Роль | Разделы |
|---|---|
| Публичные | `/login`, `/apply`, `/register`, `/forgot-password`, `/reset-password` |
| Ученик | `/student/schedule`, `/student/tutors` |
| Репетитор | `/tutor/schedule`, `/tutor/students`, `/tutor/statistics` |
| Администратор | `/admin/schedule`, `/admin/tutors`, `/admin/students`, `/admin/statistics`, `/admin/settings` |
| Telegram | `POST /api/telegram/webhook` |

## Документация

- [Архитектура](docs/architecture.md)
- [Модель данных и RLS](docs/database.md)
- [Авторизация и Telegram](docs/auth-and-telegram.md)
- [Визуальная система](docs/ui-guidelines.md)
- [Архитектурные решения](docs/decisions.md)
- [Известные ограничения и исправления](docs/known-issues.md)
- [Прогресс и проверки](docs/progress.md)

Секреты нельзя коммитить. `SUPABASE_SECRET_KEY` и токен бота используются только сервером. В браузер отправляется случайный HttpOnly `tg_session`; JWT Supabase и технический email остаются в `private.sessions`.
