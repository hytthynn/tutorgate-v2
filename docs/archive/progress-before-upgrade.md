> Исторический документ до пакета 007; не является отчётом о текущей ревизии. См. [актуальные проверки](../verification.md).

# Исторический отчёт ДО upgrade 006

Не является проверкой новой ревизии.

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
- Student/tutor/admin панели, персональное недельное расписание с 24-часовой сеткой и мобильным переключением дней.
- Admin subject management, assignments, поиск/URL-фильтры, Telegram links.
- Settings: global rate и soft-delete subjects.
- Statistics: KPI, periods/custom dates, metric/tutor filters, responsive Recharts и реальные проведённые занятия.
- Schedule: CRUD, приватные заметки, МСК-сдвиг, выделение, Delete, контекстное меню, отметка, цвет, Pointer Events drag с переходом недели и откатом ошибки.
- Vercel guide, webhook script, admin promotion script.

## Проверки
- npm test: **28/28 пройдены** — миграции в PostgreSQL/PGlite с btree_gist, atomic registration, RLS/column privacy, assignment/lesson constraints, атомарность lesson+note, notes/preferences isolation, fixed-offset time math, split/clip/count/statistics, token replay, rate counters, expired reservations, session revocation и soft-delete.
- npm run typecheck: strict TS7.
- npm run lint: **0 ошибок, 0 предупреждений** — Next + TypeScript rules с официальными compatibility adapters.
- npm run build: standard production Next.js build.
- Playwright: **13/13 сценариев пройдены** — публичные формы, три роли, role redirects, dialogs, CRUD расписания, rectangle/Delete, контекстное меню, цвета/отметки, drag по времени/дням/неделям, откат overlap, student privacy, MSK persistence, Back/Forward, cross-week statistics, admin overall/filter и touch drag/long press. Viewports: desktop 768/1280/1440, mobile 320×700 / 375×812 / 430×932. Использует только изолированные UI fixtures.

Первоначальная установка `npm ci` завершилась успешно; на этапе MVP npm audit сообщил 0 vulnerabilities. При расширении зависимости и lockfile не менялись. npm предупреждает о старых peer ranges ESLint plugins (ADR-008); проверки проходят с официальным адаптером. Скриншоты расписания desktop/mobile в `artifacts/schedule-*.png` проверены визуально: сетка целиком и без горизонтального overflow. Дополнительно повторены сценарии навигации и touch после исправления возврата к текущему месяцу и общего SSR/client snapshot времени. SQL engine tests не эмулируют весь сервис Supabase Auth; browser tests не отправляют реальные Telegram сообщения.

## После подключения сервисов
- Применить migrations в выделенный Supabase.
- Настроить env, production URL и bot webhook.
- Пройти регистрацию первого администратора и выполнить admin:promote.
- Выполнить production smoke checklist из deployment-vercel.md.

Первоначальная заглушка заменена по дополнительному `TutorGate_Schedule_TZ.md`; исходное MVP ТЗ сохранено. Миграция 005 должна быть применена во внешнем Supabase до публикации обновлённой версии. Внешние Supabase/Telegram/Vercel настройки эта задача не меняет.
