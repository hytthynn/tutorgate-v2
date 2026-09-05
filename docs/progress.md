# Прогресс MVP

Дата реализации: 05.09.2026.

## Реализовано
- Next.js App Router, strict TypeScript, npm lockfile, Node 24.
- Warm mocha design system, responsive navigation, dialogs, loading/error/empty states.
- Миграции public/private schemas, ограничения, RLS и column grants.
- SSR auth с серверным session vault, getUser и role guards.
- Заявки student/tutor с динамическими предметами, validation, consent и Telegram CTA.
- Telegram secret validation, username/identity checks, hashed tokens, idempotent registration links.
- Атомарная регистрация через Auth trigger; login; Telegram password recovery.
- Student/tutor/admin панели, расписание-placeholder.
- Admin subject management, assignments, поиск/URL-фильтры, Telegram links.
- Settings: global rate и soft-delete subjects.
- Statistics: KPI, periods/custom dates, metric/tutor filters, responsive Recharts, empty datasource.
- Vercel guide, webhook script, admin promotion script.

## Проверки
- npm test: **17/17 пройдены** — миграции в PostgreSQL/PGlite, atomic registration, RLS/column privacy, assignment constraints, token replay, rate counters, expired reservations, session revocation и soft-delete.
- npm run typecheck: strict TS7.
- npm run lint: **0 ошибок, 0 предупреждений** — Next + TypeScript rules с официальными compatibility adapters.
- npm run build: standard production Next.js build.
- Playwright: публичные формы, три роли, role redirects, dialogs и viewport 375/768/1280/1440. Использует только изолированные UI fixtures.

Установка `npm ci` завершилась успешно; npm audit сообщил 0 vulnerabilities. npm предупреждает о старых peer ranges ESLint plugins (ADR-008); проверки проходят с официальным адаптером. Браузерные проверки: **3/3 сценария пройдены** (49 секунд), все четыре ширины без horizontal overflow. Скриншоты application desktop/mobile и admin statistics проверены визуально. SQL engine tests не эмулируют весь сервис Supabase Auth; browser tests не отправляют реальные Telegram сообщения.

## После подключения сервисов
- Применить migrations в выделенный Supabase.
- Настроить env, production URL и bot webhook.
- Пройти регистрацию первого администратора и выполнить admin:promote.
- Выполнить production smoke checklist из deployment-vercel.md.

Настоящие расписание и lesson statistics намеренно не реализованы, как требует ТЗ.
