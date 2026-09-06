# Известные ограничения и исправления

## TG-001
- Дата: 2026-09-05
- Статус: fixed
- Описание: обычные cookies Supabase передают технический email внутри JWT.
- Воспроизведение: стандартный createServerClient cookie adapter → signInWithPassword → декодировать browser cookie.
- Причина: стандартный Supabase session payload содержит Auth user/email claims.
- Решение: private server-side vault и opaque HttpOnly handle; browser auth не используется.
- Файлы: src/lib/supabase/session.ts, server.ts, src/features/auth/actions.ts, migrations 001/003.

## TG-002
- Дата: 2026-09-05
- Статус: fixed
- Описание: свежие TS7/ESLint10 несовместимы с API части lint plugins Next.js.
- Воспроизведение: установка всех @latest, затем npm run lint без адаптеров.
- Причина: TS7 не предоставляет прежний JS compiler API; некоторые ESLint plugins используют удалённые методы context.
- Решение: официальный TypeScript6 API alias при TS7 CLI и @eslint/compat.
- Файлы: package.json, package-lock.json, eslint.config.mjs.

## TG-003
- Дата: 2026-09-05
- Статус: won't fix (ограничение распределённой операции MVP)
- Описание: если Auth API недоступен после claim reset token, ссылка уже использована, пароль может остаться прежним.
- Воспроизведение: прервать доступ к Supabase Auth после успешного claim_reset.
- Причина: PostgreSQL RPC и удалённый Auth API не имеют общей транзакции.
- Решение: fail closed, пользователь запрашивает новую ссылку; повторный reset тем же токеном исключён. При ошибке отзыва сессий пароль уже мог измениться — также запросить новую ссылку.
- Файлы: src/features/auth/actions.ts, migration 001 claim_reset.

## TG-004
- Дата: 2026-09-05
- Статус: won't fix (ограничение Telegram API)
- Описание: сбой после sendMessage, но до записи delivered_at может привести к повтору того же сообщения.
- Воспроизведение: остановить Function между Telegram success и telegram_delivered.
- Причина: нет общей транзакции Telegram/PostgreSQL и idempotency key у sendMessage.
- Решение: в 009 повтор содержит только acknowledgment без регистрационной ссылки. Admin notifications используют отдельный at-most-once ledger; см. auth-and-telegram.md.
- Файлы: src/app/api/telegram/webhook/route.ts, src/lib/auth/tokens.ts, migration 001.

## TG-005
- Дата: 2026-09-05
- Статус: fixed
- Описание: незавершённая регистрация с истёкшей ссылкой могла навсегда резервировать Telegram ID.
- Воспроизведение: подтвердить заявку, пропустить 24 часа, подать новую.
- Причина: unique Telegram ID в прежней verified application.
- Решение: при создании новой заявки истёкшие незарегистрированные заявки получают expired, их Telegram reservation освобождается. Profiles остаются уникальными.
- Файлы: migration 004.

## TG-006
- Дата: 2026-09-05
- Статус: investigating
- Описание: на Vercel форма сообщает, что предметы не удалось загрузить.
- Воспроизведение: открыть production /apply; сообщение подтверждено скриншотом пользователя.
- Причина: пока не установлена; исходный код объединял отсутствие env и ошибки Supabase без серверной диагностики.
- Решение: добавлены безопасные логи с префиксом [TutorGate:subjects]: отсутствующие имена env либо HTTP status / код ошибки. Значения ключей и сырые ответы не логируются. Для установления причины нужны production configuration/logs.
- Файлы: src/app/(public)/apply/page.tsx, src/lib/env.ts.

## Внешняя проверка
Реальный Supabase project, Telegram bot и Vercel deployment не предоставлены. Локальные SQL/RLS и UI проверки не подтверждают фактическую доставку сообщений, настройки GoTrue/PostgREST и production cookies на вашем домене. Инструкция ручной проверки — deployment-vercel.md, шаг 8.

## Проверка пакета 007

Полный CI требует зависимостей из исходного lockfile. Доступ к npm в среде подготовки архива отсутствует; частичные проверки и их границы перечислены в [verification](verification.md). Production настройки и сторонние сервисы этим пакетом не изменялись. Новая миграция не требуется.

## Пакет 011

Полный CI и staging пока не подтверждены из-за отсутствующих зависимостей. Pending возможен при потере delivery audit, exactly-once Telegram не обещается. [Подробности выпуска](release-011.md).
