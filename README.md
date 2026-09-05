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


## Schedule upgrade 006

Актуальное ТЗ: docs/TZ_TutorGate_schedule_bugfixes.md. Перед запуском примените миграцию 006 после 001–005 и включите Supabase Cron. Порядок: docs/upgrade-006.md. Результаты реальных проверок: docs/verification.md. Схема и приложение выкатываются вместе: UUID-only save RPC заменён нормализованным ответом.

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
