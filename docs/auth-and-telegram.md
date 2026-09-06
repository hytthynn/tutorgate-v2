# Авторизация, Telegram и управление аккаунтами (010)

## Жизненный цикл

`pending_telegram → pending_review → approved → registered`; альтернативное решение — `rejected`. `expired` относится только к неподтверждённому Telegram. Истечение регистрации не меняет `approved`.

1. `/apply`: Zod/rate limits; `submit_application` атомарно пишет заявку, предметы и SHA-256 deep-link token на 24 часа. UI предлагает подтвердить Telegram, но не обещает немедленной регистрации.
2. Telegram webhook принимает только private chat, не-bot и равные user/chat IDs; проверяет header secret constant-time, ограничивает размер body. Username обязан совпасть. `confirm_telegram` блокирует application/token, сериализует update/identity и переводит заявку в `pending_review`. Registration token здесь НЕ создаётся.
3. Подтверждение возвращает applicant acknowledgement и создаёт private notification rows для всех зарегистрированных admin. Решения в Telegram невозможны: обычный текст без callback/inline keyboard.
4. `/admin/applications`: только admin; вкладки Ученики/Репетиторы и На рассмотрении/Принятые/Отклонённые. Принятые включают `approved` и `registered`; неподтверждённые не попадают в ручную очередь.
5. Approve/reject используют getUser через requireRole(admin), затем service-only `review_application` с проверкой actor в БД и `FOR UPDATE`. Первый transition выигрывает; повтор возвращает «уже обработана». Сохраняются reviewed_at/by, snapshot имени проверившего, approved_at/rejected_at.
6. Approve генерирует 32 cryptographically random bytes на сервере; БД получает только SHA-256 hash, TTL ровно 24 часа. Raw token живёт только во время отправки; не возвращается admin UI. URL строится исключительно через APP_URL. После commit отправляется Telegram.
7. Ошибка доставки не отменяет решение. Admin видит warning; private token остаётся валидным, заявка остаётся approved. Статус delivery хранится в applications без token/hash. Resend доступен после expiry, известной ошибки или неразрешённого pending delivery старше двух минут (восстановление после остановки процесса). Интерфейс обновляет состояние accepted-заявок раз в минуту.
8. Resend блокирует заявку, гасит все прежние неиспользованные registration tokens и создаёт один новый на 24 часа. Аудит решения не меняется. Late callback старой доставки не может заменить статус нового токена. После registered resend запрещён и скрыт.
9. `/register`: серверная проверка token_status, затем Supabase Admin createUser. Auth INSERT trigger ещё раз проверяет token, verified_at и строго status=approved; application блокируется раньше token, одинаково с review/resend. В одной транзакции погашаются token, создаются alias/profile и проставляются registered/registered_at. Повторное использование или старый token после resend отклоняются.
10. Rejected/expired history сохраняет Telegram identity. Partial unique indexes резервируют только активные заявки; unique IDs в profiles остаются без изменений. Поэтому rejected может подать новую заявку, registered — не может зарегистрироваться второй раз тем же Telegram.

## Доставка и идемпотентность

`private.application_admin_notifications` имеет PK(application_id,admin_id). Перед каждым send фиксируется attempted_at compare-and-set. Повторный webhook не создаёт повторную отправку этому admin. Доставки ограничены пятью параллельными запросами; ошибка одного адресата не отменяет confirmation и не блокирует остальных. delivered_at/failed_at — аудит; logs содержат только фиксированные сообщения, без тел, ID, cookies, URL и токенов.

Это **at-most-once attempt**, не обещание exactly-once Telegram delivery. При аварии после claim или неоднозначном сетевом timeout уведомление admin может не дойти и автоматически не повторяется, чтобы избежать дубля. Заявка всегда остаётся в очереди админ-панели. Проверяйте её независимо от уведомлений. Applicant acknowledgement может повториться при аварии после send до telegram_delivered, но ссылки регистрации в нём больше нет. Telegram sendMessage не поддерживает idempotency keys.

## Миграция и выпуск

008 расширяет enum и должна завершиться отдельной транзакцией. 009 переносит все незарегистрированные `telegram_verified` в `pending_review`, гасит их старые registration tokens, сохраняет registered. Legacy rows появляются в очереди; ожидающие notification rows создаются, но миграция не делает сетевых вызовов. Во время обновления согласуйте остановку старого webhook/registration flow: старая confirm signature удаляется. Сначала staging + backup, затем миграции и соответствующий application deploy. Не запускайте старый код после 009.

## Сессии и восстановление

Логин — normalized username, не email. Private auth aliases и opaque HttpOnly tg_session сохраняются. getUser подтверждает личность; proxy не заменяет RLS. Password reset сохраняет прежнюю схему single-use claim → Auth API → отзыв vault sessions; общая транзакция с удалённым Auth API невозможна. Пароли, Supabase service key и auth cookies не логировать.

Прежние общие PostgreSQL rate limits сохранены. APP_URL — единственный источник ссылок; Referrer-Policy=no-referrer сохраняется. Публичный signup выключен. Для существующей установки администраторы — уже зарегистрированные profiles.role=admin; начальное доверенное provisioning первого администратора в пустой базе выполняется владельцем БД вне публичного flow.

## Управление аккаунтами 010

После signInWithPassword loginAction читает собственный visible_profiles, который возвращает профиль только при active account. bind_session выполняется после этой проверки и повторно проверяет active под блокировкой строки. При отказе вызывается signOut и удаляется tg_session. currentProfile/requireRole используют тот же fail-closed RPC; getUser остаётся обязательным. Vault refresh обновляет существующий handle без создания новой строки, защищая от запоздалого обновления после revoke.

Администратор может сменить student ↔ tutor, заблокировать/разблокировать и необратимо обезличить пользователя. Действия требуют серверной и SQL admin-проверки; аккаунты admin не управляются через этот контракт. Смена роли отзывает текущие сессии. Block удаляет vault sessions и гасит password reset tokens. Unblock разрешает новый вход и не восстанавливает прежние сессии.

Soft delete атомарно стирает private alias, reset tokens, Telegram identity, ФИО и Auth user metadata, сохраняя технический UUID для истории. После commit server-only Auth Admin API повторяет metadata cleanup и устанавливает бан. При сбое внешнего API UI сообщает, что доступ уже отозван, и позволяет повторить идемпотентный delete. Отката обезличивания нет. Auth user физически не удаляется; его email — технический alias. История заявок и занятий сохраняется.

## Массовая синхронизация Telegram

В admin/settings карточка Telegram под ставкой запускает syncTelegramAction с requireRole(admin). Профили читаются server-only порциями по 100 с UUID cursor; обрабатываются все non-deleted с chat ID, включая blocked. getChat вызывается по постоянному chat_id, максимум пять параллельных запросов, timeout 8 секунд. Новый username записывается lowercase, отсутствие — NULL; неизменённое значение не записывается. Ошибка отдельного API/DB запроса увеличивает счётчик и не отменяет остальные обновления.

Обновление проверяет исходные username/chat ID и non-deleted status, чтобы конкурентное удаление не вернуло персональные данные. В браузер попадают только агрегированные checked/updated/removed/unchanged/errors. Bot token, raw Telegram payload и chat ID не возвращаются. Нет username — нет t.me-ссылки. Восстановление пароля по Telegram username возможно только если актуальный username существует и account active.

## Изменения 011

Webhook принимает message/callback_query. Deep-link /start token имеет приоритет. Связанный active profile определяется постоянной парой user/chat ID, не username. Registration/resend/reset URL только inline. Dynamic HTML экранируется. Reply имеет приоритет над recipient state, cancel очищает recipient и отвечает «✅ Действие отменено.» с student-меню. Tutor получает только «Открыть чат» и не отвечает через бота. [Ограничения доставки](release-011.md).


## Чаты 012

Ученик выбирает active tutor/admin только по текущему назначению. Сообщение преподавателя имеет callback «↩️ Ответить» с chat:to:UUID; при двух частях кнопка и reply mapping относятся к последней части. Callback перепроверяет назначения; недоступный recipient очищается; другой действующий recipient сохраняется. Native Reply сохраняет приоритет над state. Повторная отмена успешна, stale cancel показывает безопасное start-меню. Admin получает notification на /admin/chats?student=UUID и отвечает на сайте. Чужие диалоги администратору недоступны.
