# TutorGate — operational guide

## Стек и команды

Node 24.x, Next 16 App Router, React 19, strict TypeScript, `src/`, Supabase. Версии и lockfile не обновлять без согласования. Команды: `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:docs`, `npm run build`, `npm run test:e2e`. E2E использует только локальные fixtures.

## Архитектура

Server Components по умолчанию; клиентские — формы, фильтры, календарь, графики и navigation. Слои: app → features → service → Supabase. Мутации через Server Actions; Route Handler только Telegram webhook (nodejs). Схема меняется только миграциями. Канонические правила: [architecture](docs/architecture.md), [database](docs/database.md).

## Безопасность

- Проверять identity через getUser и роль в каждой серверной операции; proxy не заменяет RLS.
- Логин — не email. Нормализация trim/lowercase; private.auth_aliases скрыта.
- Session/JWT не передавать в браузер: private.sessions + opaque HttpOnly tg_session.
- service key только server-only; private schema не экспонировать, private RPC закрыты.
- Регистрация атомарна; роль только из подтверждённой заявки. Одноразовые токены хешируются.
- Заметки доступны владельцу и admin в delegated schedule; Telegram peers не раскрывается. Admin может редактировать расписание другого активного teacher только через target-aware delegated RPC с повторной DB-проверкой actor/owner. Прямые записи в schedule tables и подмена identity запрещены.

## Расписание

- Сохранять RLS, owner-checks, exclusion constraints и серверный magnet.
- Клиентский preview учитывает только загруженные видимые занятия. Ответ `result.lessons`/`rules`/`offset` канонический.
- Snap 5 минут, полная длительность, при равенстве — позже, последний старт 23:55, окончание может пересечь полночь.
- Обычное создание/paste только в текущей локальной неделе, drag не в будущую; dedicated transfer разрешён в текущую/следующую реальную неделю; offset = UTC+3+сохранённый сдвиг.
- Неделя/день локальны через History API, CRUD календаря без refresh/revalidatePath.
- SaveState включает все мутации, ошибку не сбрасывать простым закрытием диалога.
- Inactive не блокирует пересечения; active normal и coral конфликтуют только внутри своего класса, по tutor и student. Gray остаётся активным цветом.
- Массовые команды атомарны, preview/сервер сохраняют общий delta. Inactive/coral не входят в мультивыделение.
- Все мутации optimistic; undo/redo хранит подписанные сервером снимки затронутых данных в памяти текущей страницы и реально меняет БД.
- Rollover пропускает transferred source, учитывает tutor/student availability; копия target теряет transfer marker.

## UI и тесты

Warm mocha — tokens в globals.css; без gradients/glow/тяжёлых теней. Focus-visible, подписи иконок, responsive без horizontal overflow. Предметы без поиска; ученики/репетиторы searchable. Loading через общий Button; asChild только навигация. Ошибки полей inline, общие сообщения Toaster. Автофильтры используют replace, единый актуальный draft и debounce ФИО 300 мс.

Добавлять регрессии. Не объявлять команду пройденной, если она не выполнялась. Текущее [ТЗ](docs/TZ_TutorGate_012_chat_admin_schedule_ui_fixes.md), [проверки](docs/verification.md). История — только docs/archive.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
