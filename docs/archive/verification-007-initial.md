# Проверка пакета 007 — 05.09.2026

## Итог
Реализованы FR-01…FR-09 из [текущего ТЗ](../TZ_TutorGate_bugfixes_007.md). Новых миграций нет; SQL resolver, RLS, owner-checks, RPC и rollover не изменены. **Полный Definition of Done не подтверждён**: npm-реестр недоступен, зависимости из исходного lockfile не удалось установить. Архив не объявляется production-проверенным.

## Фактически выполненные проверки
- `npm run test:unit`: 25/25 пройдены, 0 skipped. Время, magnet, валидация, URL-фильтры и статические контракты.
- esbuild: синтаксический разбор 93 TS/TSX файлов в src/tests, без ошибок. Это не typecheck.
- `node --check tests/e2e/server.mjs`: пройден.
- `npm run test:docs`: относительные Markdown-ссылки разрешаются, дублирующие legacy-блоки убраны из активных docs.
- Изолированный Chromium UI-стенд: 15/15 сценариев, без pageerror. Полный список — verification-logs/ui-results.json.
- Побайтово сохранены package-lock.json и все файлы supabase/.

Быстрые тесты использовали доступные глобальные tsx/Zod, не полный набор зависимостей из lockfile. Это дополнительная проверка, не замена CI после npm ci.

## Браузерные сценарии
Проверены local magnet до drop, later-on-tie, непересекающийся preview, занятый день без мутации с одним toast, канонический mock-ответ при скрытом конфликте, откат move при сетевой ошибке, постоянный save status и восстановление после успешной записи, условная галочка и padding 4px, past/current/future Add tooltips, subject без поиска/student с поиском, создание со spinner и блокировкой повтора, offset/delete status, debounce/select race/очистка q/history, auto statistics controls и невалидные даты, student admin-role line, loading всех типов форм и logout, desktop 1440px/mobile 390px без horizontal overflow.

**Ограничения стенда:** использованы настоящие компоненты проекта и React 19.2.8. Отсутствующие Next navigation/Server Actions, Radix, cva/Slot, react-hook-form, utility helpers и Lucide заменялись изолированными адаптерами; иконки — react-icons с fallback, шрифт — Arial вместо Geist. Recharts и настоящий RSC refetch не проверялись: для статистики проверены контролы/URL, не реальный chart/data pipeline. Не проверены реальные Supabase/Auth, SQL/RLS, redirect/logout навигация, Radix focus trap и production cookies. Адаптеры не включены в production-код.

Просмотрены desktop/mobile календарь, форма loading, mobile subject dropdown, панель фильтров и student directory. Исправлено избыточное резервирование места под стрелку мобильных select. Снимки относятся только к [изолированному стенду](../verification-ui/README.md), не к deployed Next-приложению.

## Команды, заблокированные окружением
| Команда | Причина |
|---|---|
| npm ci с ограничением retries/timeout | ENOTFOUND registry.npmjs.org |
| npm ci --offline | ENOTCACHED |
| npm ci --offline --legacy-peer-deps | ENOTCACHED: отсутствуют tarball-зависимости |
| npm run lint | ESLint отсутствует |
| npm run typecheck | Нет проектных Next/React types и других зависимостей; полный результат не подтверждён |
| npm test | Доступные тесты проходят; два DB-набора не стартуют без @electric-sql/pglite, общий результат failed |
| npm run build | Next отсутствует |
| npm run test:e2e | Нет проектного @playwright/test и Next |

Логи — verification-logs/. Ошибки не маскируются skip-ами. Документация установленного Next в node_modules также недоступна. Старые результаты — только [в архиве](README.md).

## Существенные детали реализации
- nearestFreeStart используется в showPreview по видимым lessons без исходной карточки; null сбрасывает target. result.lesson остаётся каноническим.
- SaveState охватывает move/create/edit/delete/color/completed/offset. LessonDialog использует onSubmit: manual pending/global status не откладываются React form-action transition. Локальная валидация не меняет глобальный статус.
- DirectoryFilters сохраняет PeoplePage серверным. useAutoFilters строит полный draft синхронно, отменяет debounce и использует replace. StatisticsView не remount-ится на каждом ответе; невалидные даты остаются локальными.
- Общий Button loading, viewer-aware role line, subject без searchable, условный CircleCheck и tooltip только past/future.
- README/AGENTS сокращены, история перенесена в archive, добавлен scripts/check-doc-links.mjs.

Полноценные Next E2E добавлены в tests/e2e/bugfixes-007.spec.ts, старые ожидания Найти/Применить обновлены. Fixtures поддерживают задержку/ошибки, скрытый конфликт и занятый день. Эти E2E написаны, но их прохождение не заявляется.

## Перед production
Выполнить npm ci, установить Chromium Playwright, затем lint, typecheck, npm test, test:docs, build и test:e2e. Если Next требует generated types, сначала выполнить build/dev. На staging проверить реальные скрытые конфликты, конкурентные записи, RLS/notes, Cron/rollover, offset, все data-actions и logout. Ключи, рабочая БД и внешний deployment не менялись. Инструкция: [развёртывание](../deployment-vercel.md).

