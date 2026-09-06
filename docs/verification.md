# Фактические проверки — пакет 009

Дата работы: 05–06.09.2026. Источник: присланные ZIP и ТЗ 009. Производственные Supabase/Telegram/Vercel не подключались и не изменялись.

## Итог

Реализация и регрессионные тесты добавлены. **Полный DoD не подтверждён**: недоступен npm registry (DNS/network), в sandbox отсутствуют точные зависимости проекта. Offline npm ci также завершился ENOTCACHED. Версии зависимостей не подменялись и lockfile не обновлялся.

| Проверка | Фактический результат |
|---|---|
| npm ci | Не выполнена установка: npm registry недоступен; процесс остановлен после сетевых повторов |
| npm ci --offline --ignore-scripts | Ошибка ENOTCACHED, нет требуемых пакетов в cache |
| npm run lint | Запущена, заблокирована: eslint отсутствует |
| npm run typecheck | Запущена, не пройдена: отсутствуют next, React/Node typings и другие зависимости; это не успешный typecheck |
| npm test | Запущена: unit-часть проходит, четыре DB suites не стартуют без @electric-sql/pglite |
| npm run test:docs | Пройдена после исправления ссылок входного архива; итоговый лог приложен |
| npm run build | Запущена, заблокирована: next отсутствует |
| npm run test:e2e | Запущена, не стартует без @playwright/test и Next |

## Выполнено независимо от полной установки

- 43 unit/contract tests проходят через предустановленный tsx: validation, dates, filters, signed client history, immutable preview, conflict-aware lanes, delete target/source/batch, application status gates и mocked two-admin notification dedupe/failure isolation.
- Синтаксис 111 TS/TSX файлов успешно проверен esbuild отдельно от отсутствующих типовых деклараций; это НЕ замена strict typecheck.
- `node --check` тестовых MJS/CJS файлов: успешно.
- Offline React SSR snapshots реальных компонентов с mock integration adapters + локальный Chromium: размеры страницы проверены на 1366×768, 1440×900, 1920×1080, 320×900, 375×900. Исправлен найденный 26 px overflow статистики. На desktop статистика помещается; на узких/коротких экранах реальный scroll остаётся. Date computed cursor — pointer; student save indicator отсутствует; desktop/mobile layout без horizontal overflow.
- Визуально осмотрены снимки статистики, pending/approved applications и tutor/student schedules. Применён прежний warm-mocha стиль, новый gate mark, разрешённые перекрытия остаются одной ширины, select текст с ellipsis не пересекает chevron.

Ограничение offline snapshot QA: Next runtime, Recharts rendering, Lucide module и внешние сервисы были заменены локальными adapters; это не проверка всех runtime states, hydration, popup interactions или заполненных графиков. Полная визуальная и интерактивная приёмка — после npm ci.

## Добавленные проверки для полного окружения

- `tests/package-009.test.ts`: unit/contract и mock notification orchestration.
- `tests/applications-database.test.ts`: полный набор migrations, review/token/reapply/privacy/expiry/idempotency. PGlite Promise.all проверяет единственность перехода, но не заменяет staging race из двух PostgreSQL sessions.
- `tests/schedule-features-database.test.ts`: delete source/target/both, availability, rollback on conflict, signed Undo/Redo.
- `tests/e2e/package-009.spec.ts`: statistics scroll/cursor, role controls, chevrons 320/375, assignments, transfer deletion, moderated registration/resend/rejection flow.
- Existing DB/E2E assertions обновлены для новой модели; legacy versions tests не удалены.

## Что обязательно проверить до production

1. Полный clean install и все команды README с закреплёнными версиями.
2. Реальные migrations 008 → commit → 009 на копии базы; migration legacy telegram_verified и existing registered.
3. Реальный PostgreSQL concurrency approve/reject/register/resend и snapshots.
4. Настоящие Telegram deliveries двум admin, отказ Telegram API, повторы webhook.
5. Реальные Next/React/Radix/Recharts состояния, заполненный график, mobile popups, keyboard flow и новые ссылки после expiry.

Исторический отчёт [008](archive/verification-008-incoming.md) сохранён отдельно и не считается подтверждением текущего релиза.
