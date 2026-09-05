# TutorGate

Закрытая платформа учеников, репетиторов и администратора. Источники требований: TutorGate_MVP_TZ.md и расширение TutorGate_Schedule_TZ.md.

## Стек и команды
- Node 24.x, npm, Next.js 16 App Router, React 19, strict TypeScript, src/.
- Tailwind v4, shadcn/Radix, Lucide, Recharts, Supabase SSR/Auth/PostgreSQL.
- npm ci; npm run dev; npm run lint; npm run typecheck; npm test; npm run build.
- npm run test:e2e запускает изолированные UI fixtures, не production DB.
- Последние стабильные версии закреплены lockfile; не обновлять самопроизвольно.
- TypeScript 7 CLI + официальный TS6 API alias; ESLint 10 + @eslint/compat.

## Архитектура
- Server Components по умолчанию. Клиентскими остаются формы, графики, dialogs, navigation.
- page → features → service → Supabase. Мутации через Server Actions.
- Route Handler только для Telegram webhook, runtime nodejs.
- Изменения схемы только SQL migrations. private не добавлять в exposed schemas.
- Все service RPC закрыты от anon/authenticated. RLS включён на public tables.

## Авторизация
- Пользователь вводит логин, не email. Нормализация lowercase + trim, внутренние пробелы недопустимы.
- Alias случайный, mapping в private.auth_aliases.
- Не передавать Supabase session/JWT в браузер: они содержат email.
- @supabase/ssr работает через private.sessions; браузер получает opaque HttpOnly tg_session.
- Browser Supabase client только для anonymous reads, не для auth.
- Identity проверяется getUser в proxy, серверных страницах и actions.
- Registration атомарна через trigger auth.users; роль берётся только из подтверждённой заявки.
- Одноразовые токены SHA-256, 24h registration / 30m reset.
- Reset claim до Auth update; при сбое требуется новая ссылка. См. known-issues.
- Telegram retry возвращает ту же ссылку, payload детерминирован HMAC от update_id.

## Роли / RLS
- student: свои assignments, назначенные tutors.
- tutor: свои assignments и назначенные students.
- admin: admin pages + tutor capabilities, включая назначение самому себе.
- Роль обязательна в каждой мутации; нельзя полагаться только на proxy.
- Telegram публично не отдаётся peers: visible_profiles возвращает username только owner/admin.
- tutor_subjects нельзя снимать, пока существуют assignments (FK RESTRICT).
- Subjects удаляются soft-delete. Исторические связи сохраняются.

## Дизайн
- Warm mocha: #17130f / #1e1914 / #251e18, cream #f2e8dc, caramel #d39a59.
- Geist; body 13–14px; заголовки 20–24px; радиусы 6–10px.
- Тонкие границы, без glow, gradients, glassmorphism и больших теней.
- Sidebar → mobile Sheet; доступный keyboard focus, responsive charts.
- Ошибки по-русски, рядом с полями; raw errors пользователю не показывать.

## Вне scope
- Лендинг, slots/availability tables, повторяющиеся занятия и уведомления расписания.
- Оплата, чаты, отзывы, рейтинги, профили, удаление/блокировка пользователей.
- Email UX, уведомления о занятиях, ручное одобрение заявок.
- Фиктивная production статистика, индивидуальные ставки.

## Текущий статус
- Полная реализация MVP; для production нужны внешние Supabase/Telegram/Vercel настройки.
- Known limitations: распределённый reset и Telegram delivery; docs/known-issues.md.
- Подробности: docs/architecture.md, database.md, auth-and-telegram.md,
  ui-guidelines.md, decisions.md, progress.md, deployment-vercel.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
