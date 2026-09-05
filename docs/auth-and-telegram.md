# Авторизация и Telegram

1. `/apply`: сервер проверяет Zod и rate limits; RPC транзакционно сохраняет заявку, предметы и hash deep-link token (24h). Аккаунта ещё нет.
2. Telegram `/start`: только private chat, реальные числовые identifiers преобразуются в text; header secret сравнивается constant-time. Username должен совпасть с заявкой; при отсутствии username подтверждение запрещено.
3. `confirm_telegram` блокирует token/application, сериализует повторы update и привязку Telegram ID. После проверки создаётся registration hash с TTL 24h. Из одного Telegram нельзя создать два профиля.
4. Регистрационный raw token — HMAC-SHA256 от update ID и webhook secret. Он регенерируется на retry, поэтому plaintext не хранится. Если доставка сорвалась, webhook вернёт 503; retry пришлёт ту же ссылку. delivered_at предотвращает обычную повторную отправку.
5. `/register`: только логин/пароль/повтор. Серверный `createUser` создаёт случайный alias. Auth INSERT trigger атомарно проверяет и погашает registration token, создаёт alias/profile и переводит заявку в registered. При конфликте вся вставка откатывается.
6. `/login`: username trim/lowercase, embedded whitespace запрещён по примеру ТЗ. Service RPC получает alias; SSR signInWithPassword проходит на сервере. Browser получает случайный 256-bit tg_session вместо JWT. Пароль не хранится в собственных таблицах.
7. `/forgot-password`: одинаковый текст для существующего и неизвестного username, ошибок доставки и rate limits. Известному Telegram через сохранённый chat ID уходит ссылка на APP_URL с TTL 30 минут.
8. `/reset-password`: атомарный claim токена → Supabase Admin API update password → отзыв серверных сессий. Claim необратим, при сбое пользователь получает инструкцию запросить новую ссылку.

## Сессии

`private.sessions` хранит внутренние Supabase cookie chunks и user_id. Hash opaque handle служит ключом. HttpOnly + SameSite=Lax + Secure в production, срок 30 дней. Сервер обновляет Auth токены через @supabase/ssr. Сессию проверяет `getUser`, не доверенный `getSession`. После login handle ротируется, после logout vault удаляется, после reset отзываются сессии пользователя.

У browser client нет прав читать private, auth alias или Telegram identifiers. Нельзя заменять vault обычным Supabase browser sign-in: технический alias снова появится в JWT браузера.

## Abuse protection

Лимиты сохраняются в PostgreSQL, общие для всех экземпляров Vercel Function. На login 8 попыток/15 минут на username; apply 4/15 минут на Telegram; forgot 3/15 минут + 2 минуты между ссылками одному профилю; register/reset 10/15 минут на token hash. IP bucket допускает втрое больше запросов. IP на Vercel берётся из edge-controlled x-vercel-forwarded-for; вне Vercel используется общий bucket, а не произвольный X-Forwarded-For.

Ссылки генерируются исключительно из APP_URL. Referrer-Policy=no-referrer не передаёт query token внешним ресурсам. Не логируйте URL с токенами, request bodies или cookies. Webhook secret нельзя менять, пока планируется доставка pending updates: HMAC использует этот secret.

Публичной email-регистрации нет. Email provider в Supabase остаётся включённым для внутреннего password sign-in, публичный signup выключен. Admin bootstrap — только серверный script для уже зарегистрированного пользователя.
