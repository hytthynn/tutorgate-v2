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
Первоначальный MVP оставлял расписание заглушкой. `TutorGate_Schedule_TZ.md` расширяет scope: добавлены lessons, private notes и пользовательский МСК-сдвиг. Availability, конструктор повторений и уведомления вне scope; weekly auto-rollover входит в актуальное ТЗ. Admin calendar показывает только собственные занятия; общая статистика может читать все занятия под RLS.

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

## Актуальные правила schedule upgrade 006
- Предмет удаляется физически через admin RPC delete_subject_hard: assignments → tutor_subjects → application_subjects → subjects, атомарно. Lessons остаются с nullable subject_id ON DELETE SET NULL и subject_name_snapshot. Пока предмет существует, отображается текущее имя; после удаления — исторический snapshot. Статистика и заметки сохраняются.
- Вся история календаря загружается при открытии пакетами по 500; имена также батчами. Неделя/день — локальное состояние + History API. Навигация и CRUD не вызывают router.refresh или revalidatePath. Force-dynamic статистика читает актуальные данные при заходе.
- Save/patch возвращают нормализованный lesson без note, delete — фактически удалённые IDs. Заметки загружаются отдельно только владельцу. Общие сообщения — единый Toaster, ошибки полей остаются inline.
- Один private SQL magnet resolver: ближайший полный свободный интервал tutor+student, шаг 5 мин, при равенстве расстояний — позже. Start остаётся в выбранном дне (последний старт 23:55), окончание может выйти за полночь. Exclusion constraints сохранены; ограниченные retry защищают от гонок.
- Ручное создание — только текущая локальная неделя (UTC+3+сохранённый offset). Диалог редактирования ограничен семью днями недели карточки; drag может идти в прошлое, но не в будущую неделю. Все ограничения повторяются на сервере.
- Owner-checked SECURITY DEFINER RPC сохраняют lesson+note атомарно. Прямые INSERT/UPDATE/DELETE lessons/notes для authenticated отозваны. Роль admin не даёт права писать в чужой календарь. Private helpers не доступны anon/authenticated, private schema не экспонируется.
- Cron каждые 5 минут копирует валидные занятия предыдущей локальной недели. Новые IDs, completed_at=NULL, прежние цвет/длительность/заметка. История не перемещается. Idempotency: (tutor_id,target_week_start). Удалённые предметы и снятые назначения не копируются; конфликт использует magnet или записывается как безопасный skip.
- Все schedule writers, hard-delete и rollover сериализованы одним transaction advisory lock. Это консервативная стратегия для конфликтов общего student; при высокой нагрузке нужно измерять latency и длительность Cron.
- Видимый календарь раз в минуту читает только обновлённые строки по updated_at cursor с 10-минутным перекрытием. Это независимый от навигации инкремент для автокопий репетиторов с разными offset, а не повторный all-history preload. In-flight polling не перезаписывает мутации: lock + revision guard. Полная межвкладочная realtime-синхронизация удалений не входит в релиз.
- UI: Select/Combobox с portal и поиском, Tooltip, Toaster; native selects убраны. Numeric spinners скрыты, min/max/step сохранены. Заметка 88–240px с auto-grow и внутренней прокруткой. Completed — зелёный Lucide CircleCheck. Undo/Redo только disabled icons.

Фактическая проверка этой ревизии: docs/verification.md (для файлов в docs — verification.md). Старые результаты CI не подтверждают новую ревизию.
