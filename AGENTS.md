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
- Subjects удаляются физически через delete_subject_hard; lesson snapshots сохраняют историю.

## Дизайн
- Warm mocha: #17130f / #1e1914 / #251e18, cream #f2e8dc, caramel #d39a59.
- Geist; body 13–14px; заголовки 20–24px; радиусы 6–10px.
- Тонкие границы, без glow, gradients, glassmorphism и больших теней.
- Sidebar → mobile Sheet; доступный keyboard focus, responsive charts.
- Ошибки полей inline, общие сообщения через Toaster; raw errors пользователю не показывать.

## Вне scope
- Лендинг, slots/availability tables, конструктор повторений и уведомления о занятиях. Автоматическое недельное копирование входит в scope.
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
