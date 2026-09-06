# Архитектурные решения

## ADR-001 — Username через скрытый Supabase alias
Supabase Auth использует случайный `u_<random>@<technical-domain>`. Пользователь вводит только username/password. Mapping — private.auth_aliases. Public profile не содержит логин или alias.

## ADR-002 — Telegram ID является identity
Username используется только для первоначального подтверждения и поиска восстановления; постоянная связь — unique text telegram_user_id. Chat ID тоже text/unique. Один Telegram — один профиль.

## ADR-003 — Физическое удаление предметов (обновлено)
Admin RPC атомарно удаляет текущие связи и subject; исторические lessons используют nullable FK и subject_name_snapshot. Предыдущее архивирование заменено.

## ADR-004 — Администратор имеет tutor capabilities
Хранится одна роль admin. Он входит только в admin pages, но участвует в списке преподавателей и назначениях.

## ADR-005 — Персональное расписание (заменено дополнительным ТЗ 05.09.2026)
Первоначальный MVP оставлял расписание заглушкой. Историческое расширение расписания (историческое ТЗ 006 не входило в присланный архив) расширяет scope: добавлены lessons, private notes и пользовательский МСК-сдвиг. Availability, конструктор повторений и уведомления вне scope; weekly auto-rollover входит в актуальное ТЗ. Admin /admin/schedule без tutor query показывает собственные занятия; delegated view из справочника позволяет редактировать выбранного active teacher (пакет 012); общая статистика может читать все занятия под RLS.

Фиксированный UTC offset (UTC+3+сдвиг) используется всеми чистыми функциями времени. `starts_at` — timestamptz; `ends_at` всегда вычисляется триггером. Два GiST exclusion constraints запрещают пересечения по tutor/student на полуоткрытых интервалах. Notes физически отделены от lessons и не выдаются ученику. Owner-checked authenticated SECURITY DEFINER RPC сохраняет lesson+note атомарно; service role не используется.

Статистика учитывает только completed_at IS NOT NULL. Count относится к дню начала, минуты распределяются по дням/границам периода. Текущая глобальная ставка ретроспективно применяется ко всем датам. Undo/Redo и будущие пункты меню disabled. Touch-меню открывается удержанием, drag сохраняет длительность и округляет начало до пяти минут.

## ADR-006 — Server-side session vault
Обычные Supabase SSR cookies содержат email в JWT. Для буквального выполнения требования «не передавать alias в браузер» cookie adapter хранит Supabase session в private.sessions. Browser получает только случайный HttpOnly handle, в БД хранится его SHA-256. Дополнительный DB запрос — сознательная цена приватности.

## ADR-007 — Атомарная регистрация и безопасный reset
Регистрация выполняется внутри Auth INSERT trigger, поэтому создание auth user, profile, alias и погашение token атомарны. Это избегает схемы «создать Auth user, потом создать profile» с orphan accounts. Reset через отдельный Admin API нельзя включить в PostgreSQL transaction; token погашается до вызова, что обеспечивает at-most-once. При внешнем сбое требуется новая ссылка.

## ADR-008 — Совместимость свежих инструментов
Проверка npm 05.09.2026 дала TypeScript 7.0.2 и ESLint 10.10.0. В зависимостях Next ESLint ещё есть плагины старого API. Используются официальные `@eslint/compat` и alias `typescript → @typescript/typescript6`, `@typescript/native → typescript`. Typecheck — TS7, инструменты JS API — TS6. Prerelease не используется. npm может предупреждать о peer ranges старых ESLint plugins; lint выполняется через compatibility adapter.

Источник: [Microsoft: TypeScript 7 side-by-side](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

## ADR-009 — Снятие используемого предмета блокируется
FK assignments → tutor_subjects имеет ON DELETE RESTRICT. Администратор сначала меняет/снимает ученические назначения, затем снимает предмет у репетитора. Нельзя незаметно удалить назначения каскадом.

## ADR-010 — Telegram delivery retries
Raw registration token детерминирован HMAC(update_id, webhook_secret), БД хранит только hash. Транзакция сохраняет update и результат; retry использует ту же ссылку. После успешной отправки сохраняется delivered_at. Telegram sendMessage не предоставляет общую транзакцию с PostgreSQL: редкий повтор самого сообщения возможен, но второй аккаунт/другая ссылка не создаются.

## ADR-011 — Vercel согласно ТЗ
Используется стандартный Next.js deployment. Инструкции Sites по Cloudflare starter/hosting не применены, поскольку пользователь явно задал Next.js + Supabase + Vercel. Публикация не выполняется без предоставленных внешних конфигураций; результат — исходники и deployment guide.

## ADR-012 — Нормализация логина
Trim внешних пробелов + lowercase. Внутренние пробелы не удаляются молча: `ivan petrov` остаётся недопустимым, как в примерах ТЗ. В БД только normalized lowercase.

Канонические правила расписания: [архитектура](architecture.md).


## ADR-012 — Teacher chat и delegated schedule

Пакет 012 отменяет исключение admin из преподавательских чатов и запрет редактирования чужого календаря. Чаты доступны только по собственным назначениям. Чужой календарь открывается из /admin/tutors, actor и owner всегда различаются явно и проверяются в БД. Admin может редактировать private notes, но не чужой персональный offset. Исторические миграции 001–011 неизменны; новый контракт введён миграцией 012.
