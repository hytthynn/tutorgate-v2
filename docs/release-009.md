# Установка пакета 009

## Что включено

Все девять направлений ТЗ реализованы в исходниках: высота статистики, date cursor, conflict-aware lanes, удаление согласованных текстов и student controls, единый select chevron, атомарное удаление переносов/optimistic/undo-redo, gate-mark/favicon, admin applications moderation, однострочные назначения. Добавлены unit, DB и Playwright regression suites; E2E Telegram изолирован в test-only preload, production mock mode не добавлялся.

**Это архив исходников, а не подтверждённая production-сборка.** Полный Definition of Done ещё не подтверждён: установка зависимостей и часть обязательных проверок заблокированы средой. См. [фактические проверки](verification.md).

## Порядок обновления

1. Сделайте backup и сначала примените изменения на отдельной staging-базе.
2. Если база уже на migration 007, примените `202609050008_application_statuses.sql`, дождитесь commit, затем `202609050009_applications_review_and_transfer_delete.sql`. Не объединяйте enum migration с её использованием в одной транзакции. Все предыдущие SQL файлы оставлены без изменений.
3. Выпустите соответствующий код вместе с миграциями в согласованное окно: старая версия webhook после 009 несовместима по RPC signature. Старые registration links неподтверждённых вручную заявок будут погашены; registered accounts не меняются.
4. Оставьте существующие .env значения. Нужны реальные APP_URL, Supabase URL/publishable/secret, Telegram bot token/username/webhook secret. Секреты в архив не добавлены.
5. `npm ci` на Node 24 с доступом к npm, затем все шесть команд из README. Для Playwright установите Chromium. Версии dependencies/devDependencies и lockfile не менялись.
6. Проверьте на staging два admin review-запроса одновременно из разных сессий, webhook retries, реальные Telegram permissions/chat IDs, expired/resend/register, RLS и конфликт восстановления source. Только после этого выкладывайте в production.

## Важные детали

- UI времени модерации показывает МСК явно.
- Если send прерван, заявка approved не теряется: новая ссылка становится доступна после ошибки/expiry или через две минуты unresolved pending; UI опрашивает раз в минуту.
- Admin notification имеет at-most-once попытку: при неоднозначном сбое повтор не отправляется, чтобы не нарушать дедупликацию. Очередь сайта — источник истины.
- Если source после удаления target нельзя активировать из-за нового конфликтующего занятия, вся delete-команда возвращает ошибку без частичных изменений. Освободите исходный интервал или удалите source.
- Raw one-time ссылки не отображаются администраторам; их получает только заявитель в Telegram.
- В исходном архиве отсутствовали несколько исторических документов. Нерабочие ссылки исправлены, результаты прошлых проверок не выдумывались.
