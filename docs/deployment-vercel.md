# Деплой TutorGate на Vercel

## 1. Подготовить Supabase

1. Создайте отдельный проект Supabase и сохраните пароль БД.
2. В настройках API найдите Project URL, **publishable key** и серверный **secret key**. Для старых проектов допустимы anon/service_role соответствующего назначения.
3. В Authentication включите Email provider: он нужен внутреннему входу Supabase. **Отключите публичную регистрацию (Allow new users to sign up)**. TutorGate создаёт пользователей через Admin API; подтверждённая заявка проверяется триггером. Email-письма не используются; SMTP не нужен.
4. В Data API → Exposed schemas оставьте стандартный `public`; **не добавляйте `private`**.

Примените миграции. Рекомендуемый способ через Supabase CLI:

```bash
npx supabase@latest login
npx supabase@latest init
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push
```

`init` нужен один раз, если ещё нет `supabase/config.toml`. Пароль базы вводится в интерактивном запросе CLI, не сохраняется в Git. При первом развёртывании также можно последовательно выполнить **содержимое файлов миграций** в Supabase SQL Editor:

1. `202609050001_initial.sql` — таблицы, RLS, RPC, Auth trigger;
2. `202609050002_initial_subjects.sql` — начальный редактируемый каталог;
3. `202609050003_session_revocation.sql` — привязка и отзыв сессий;
4. `202609050004_expired_applications.sql` — повторная заявка после истечения регистрации.

Используйте один способ учёта миграций. Если применяли SQL Editor, перед переходом на CLI синхронизируйте migration history командой `supabase migration repair`; не запускайте начальную миграцию повторно. Дальнейшие изменения production оформляйте новыми migration files.

## 2. Создать бота

В Telegram откройте **@BotFather**, выполните `/newbot`. Сохраните токен и username бота **без `@`**.

Создайте webhook secret, например:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Этот secret не является токеном бота. Храните оба значения отдельно.

## 3. Подготовить репозиторий

Установите Node.js 24.x. В корне проекта:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Создайте приватный Git-репозиторий и отправьте исходники вместе с `package-lock.json`. `.env.local` не должен попасть в Git. Для нового локального репозитория:

```bash
git init
git add .
git commit -m "Implement TutorGate MVP"
git branch -M main
git remote add origin YOUR_GIT_REPOSITORY_URL
git push -u origin main
```

## 4. Импортировать в Vercel

В Vercel: **Add New → Project → Import Git Repository**.

| Параметр | Значение |
|---|---|
| Framework Preset | Next.js |
| Root Directory | корень репозитория |
| Node.js Version | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run lint && npm run typecheck && npm run build` |
| Output Directory | стандартная настройка Next.js |

Docker, отдельный backend и постоянный процесс бота не требуются. Выберите регион Functions рядом с Supabase, если тариф позволяет менять регион.

## 5. Задать Environment Variables

Заполните в Vercel → Project Settings → Environment Variables:

| Переменная | Значение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key Supabase |
| `SUPABASE_SECRET_KEY` | secret key Supabase, только сервер |
| `TELEGRAM_BOT_TOKEN` | токен из BotFather |
| `TELEGRAM_BOT_USERNAME` | username бота без `@` |
| `TELEGRAM_WEBHOOK_SECRET` | случайный secret из шага 2 |
| `APP_URL` | стабильный production URL, например `https://tutorgate.vercel.app` |
| `AUTH_ALIAS_DOMAIN` | `auth.tutorgate.internal` или ваш технический домен |

Технический домен не отправляет и не принимает почту, DNS/MX для него не нужен. Пользователь его не видит. `APP_URL` должен использовать HTTPS и не должен быть URL случайного preview deployment.

Если production URL пока неизвестен, сделайте первый deploy, скопируйте постоянный домен проекта в `APP_URL`, затем **Redeploy**. После любого изменения env выполните redeploy. В Supabase Authentication → URL Configuration задайте Site URL равным `APP_URL`.

Для Preview используйте отдельный тестовый Supabase и отдельного бота. **У одного Telegram-бота один webhook**: preview не должен перезаписывать production endpoint. Если preview защищён Vercel Authentication, Telegram к нему не подключится. Production webhook должен быть публично доступен, защиту запроса обеспечивает secret header.

## 6. Подключить webhook

После успешного production deploy создайте локальный `.env.local` по `.env.example` и укажите те же production значения `APP_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`. Затем:

```bash
npm run telegram:webhook
```

Скрипт вызывает Telegram `setWebhook` с URL `APP_URL + /api/telegram/webhook`, `secret_token` и `allowed_updates: ["message"]`, затем показывает состояние `getWebhookInfo`. Он не печатает токен бота.

Ожидается ваш HTTPS URL, отсутствие `last_error_message`, а после обработки — ноль ожидающих updates. Браузерный GET на webhook возвращает 405; POST без secret — 403. Это ожидаемое поведение.

## 7. Создать первого администратора

1. Откройте production `/apply` и подайте **заявку репетитора** с вашим реальным Telegram username.
2. Нажмите «Продолжить в Telegram», затем Start в боте.
3. Завершите регистрацию по ссылке, запомните логин.
4. Локально, с production Supabase server env, выполните:

```bash
npm run admin:promote -- YOUR_LOGIN
```

5. Войдите заново. Откроется `/admin/schedule`.
6. В «Настройки» задайте ставку и отредактируйте предметы. В «Репетиторы» назначьте предметы себе и другим репетиторам. Затем назначьте преподавателей ученикам.

Публичной формы создания администратора и стандартного admin-пароля нет. Скрипт повышения роли требует серверный Supabase secret.

## 8. Проверить production

- Заявка показывает предметы из Supabase и выдаёт Telegram CTA.
- Чужой Telegram username не подтверждает заявку.
- Правильный Telegram получает ссылку на **production** домен.
- Регистрация работает один раз, повтор ссылки сообщает об использовании.
- Логин нечувствителен к регистру, email отсутствует в интерфейсе, HTML и cookies.
- Ученик, репетитор и администратор перенаправляются в свои панели; refresh сохраняет вход.
- Репетитор без предмета не доступен для соответствующего назначения.
- Восстановление доставляется ботом; повторное применение ссылки невозможно.
- В браузере только opaque HttpOnly `tg_session`, нет Supabase JWT cookies.
- После выхода и сброса пароля старые сессии не открывают кабинет.

Локальные тесты не заменяют эти проверки внешних интеграций. Для диагностики используйте Vercel Function Logs и Supabase Auth/Postgres Logs; не публикуйте токены, пароли или cookie содержимое.

## Частые проблемы

| Симптом | Что проверить |
|---|---|
| Заявка не отправляется | migrations, Supabase URL/keys, username бота |
| Бот не отвечает | webhook URL, Vercel Deployment Protection, secret, pending updates |
| Регистрация не создаёт аккаунт | migration trigger, срок ссылки, уникальность логина и Telegram |
| Нет доступа к таблицам | применены ли grants/RLS; `private` не нужно открывать через API |
| Ссылки ведут на старый домен | `APP_URL` и redeploy |
| Восстановление не пришло | Telegram username, не заблокирован ли бот, лимит 3 запроса/15 минут и пауза 2 минуты |
| Предмет нельзя снять | сначала переназначьте или снимите учеников по этому предмету |

Официальная документация: [Node.js 24 на Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Telegram setWebhook](https://core.telegram.org/bots/api#setwebhook).
