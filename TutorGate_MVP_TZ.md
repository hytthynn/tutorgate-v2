# Техническое задание: TutorGate MVP v1.0

## 1. Назначение продукта

**TutorGate** — закрытое веб-приложение для взаимодействия учеников, репетиторов и администратора.

На этапе MVP приложение должно включать:

| Зона | Что реализуется |
|---|---|
| Публичная часть | Авторизация, подача заявки, переход в Telegram, регистрация по Telegram-ссылке, восстановление пароля через Telegram |
| Ученик | Расписание-заглушка, назначенные репетиторы |
| Репетитор | Расписание-заглушка, ученики, статистика |
| Администратор | Расписание-заглушка, репетиторы, ученики, статистика, настройки |
| Telegram Bot | Подтверждение заявки, выдача ссылки регистрации, выдача ссылки восстановления |
| Backend | Next.js + Supabase |
| Deployment | Vercel |

**Лендинг в MVP не входит.**

**Функциональность расписания в MVP не входит.** Разделы расписания должны существовать в интерфейсе, но содержать только качественно оформленный empty/coming-soon state.

---

## 2. Стек

Использовать только **стабильные latest-релизы**, без `beta`, `rc`, `canary`, `experimental`, если необходимость отдельно не согласована.

На 5 сентября 2026 года базовые актуальные версии:

| Технология | Версия на момент составления ТЗ |
|---|---:|
| Next.js | `16.3.4` |
| React / React DOM | `19.2.8` |
| Tailwind CSS | `4.3.3` |
| shadcn CLI | `4.21.0` |
| `@supabase/supabase-js` | `2.112.4` |
| `@supabase/ssr` | `0.12.6` |
| React Hook Form | `7.87.0` |
| Zod | `4.5.4` |
| Recharts | `3.10.1` |
| Lucide React | `1.41.0` |
| date-fns | `4.4.0` |
| Node.js | `24.x` |
| Package manager | **npm** |

При фактическом начале разработки **повторно проверить npm** и установить последние стабильные версии через `@latest`. После установки версии фиксируются в `package-lock.json`; обновления не должны происходить самопроизвольно во время деплоя.

Не использовать Yarn, pnpm или Bun.

---

## 3. Начальная конфигурация проекта

Проект — один Next.js repository, без monorepo.

Основные требования:

```text
Next.js App Router
TypeScript strict mode
src/ directory
Tailwind CSS v4
shadcn/ui
npm
ESLint
Node.js 24.x
Supabase
Vercel
```

`package.json` должен содержать:

```json
{
  "engines": {
    "node": "24.x"
  }
}
```

Перед каждым merge/deploy должны успешно выполняться:

```bash
npm run lint
npm run typecheck
npm run build
```

---

## 4. Общая архитектура

Использовать **Next.js App Router**.

Принцип:

```text
Browser
   ↓
Next.js / Vercel
   ├── Server Components
   ├── Server Actions
   ├── Route Handlers
   ├── Auth proxy
   └── Telegram webhook
           ↓
        Supabase
        ├── Auth
        └── PostgreSQL
```

По умолчанию компоненты должны быть **Server Components**.

`"use client"` использовать только там, где реально нужны:

- формы с интерактивным состоянием;
- select/combobox;
- dialogs;
- tabs;
- charts;
- responsive navigation;
- клиентская интерактивность shadcn.

Не превращать весь dashboard в Client Component.

Для обычных мутаций из интерфейса использовать **Server Actions**.

Route Handlers использовать в первую очередь для внешних интеграций:

```text
/api/telegram/webhook
```

---

## 5. Supabase

Supabase отвечает за:

- PostgreSQL;
- Supabase Auth;
- сессии;
- RLS;
- системные серверные операции.

Для Next.js использовать `@supabase/ssr`.

Создать три клиента:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
```

`client.ts` — browser Supabase client.

`server.ts` — SSR client с cookie-based session.

`admin.ts` — server-only клиент с Supabase secret key.

Для защиты серверных страниц identity проверяется на сервере, а доступ к данным дополнительно контролируется RLS.

---

## 6. Авторизация без email

Пользователь TutorGate **никогда не вводит и не видит email**.

Так как Supabase Auth не предоставляет произвольную авторизацию `username + password` напрямую, внутри TutorGate используется технический auth alias.

Для каждого пользователя существуют:

```text
public username:
ivanov

internal Supabase auth alias:
u_<random>@<technical-auth-domain>
```

Технический email:

- никогда не показывается пользователю;
- никогда не вводится пользователем;
- не используется для коммуникации;
- нужен исключительно как внутренний идентификатор Supabase Auth;
- генерируется случайным образом;
- связь `username → auth alias` хранится только серверно.

Создание пользователя выполняется на сервере через Supabase Admin API.

В браузер технический email не передавать.

---

## 7. Логин

Страница:

```text
/login
```

Поля:

```text
Логин
Пароль
```

Дополнительные действия:

```text
Войти
Забыли пароль?
Подать заявку
```

При вводе логина:

1. удалить пробелы;
2. привести к lowercase;
3. проверить формат;
4. server action находит внутренний auth alias;
5. server action выполняет Supabase `signInWithPassword`;
6. после успешного входа определяется роль;
7. пользователь перенаправляется в свою панель.

### Правила логина

```regex
^[a-zA-Z0-9_]{3,32}$
```

Примеры допустимых:

```text
ivan
ivan_2007
tutor42
math_teacher
```

Недопустимых:

```text
иван
ivan petrov
@ivan
iv
ivan!
```

Логин уникален **без учёта регистра**.

То есть:

```text
Ivanov
ivanov
IVANOV
```

считаются одним логином.

Фактически сохранять normalized lowercase.

---

## 8. Подача заявки

Маршрут:

```text
/apply
```

Страница повторяет идею приложенных макетов.

В верхней части два переключателя:

```text
Я ученик
Я репетитор
```

Никакого email.

### Заявка ученика

Поля:

```text
ФИО
Telegram
Предметы
Цель занятий
Согласие на обработку персональных данных
```

#### ФИО

Обычное обязательное текстовое поле.

#### Telegram

Обязательный Telegram username.

UI допускает:

```text
@username
username
```

В БД сохраняется normalized:

```text
username
```

без `@`, lowercase.

На этапе MVP пользователь должен иметь Telegram username, поскольку именно по нему происходит первичная проверка.

#### Предметы

Можно выбрать **несколько**.

Список не hardcoded.

Он всегда загружается из активных предметов, которыми управляет администратор в:

```text
Настройки → Предметы
```

#### Цель занятий

Можно выбрать только один вариант:

```text
ЕГЭ / ОГЭ
Школьная программа
Для себя
Работа / карьера
Другое
```

Для `Другое` никакого дополнительного input не появляется.

#### Согласие

Обязательный checkbox:

```text
Я согласен с обработкой персональных данных
```

Без согласия форма не отправляется.

---

## 9. Заявка репетитора

Поля:

```text
ФИО
Telegram
Предметы
Опыт преподавания
Согласие на обработку персональных данных
```

Предметов можно выбрать несколько.

Варианты опыта:

```text
До 1 года
1–3 года
3–5 лет
5+ лет
```

Выбирается один вариант.

Указанные репетитором предметы являются **предметами заявки**, но не дают ему никаких прав автоматически.

Фактические предметы репетитору позднее назначает только администратор.

---

## 10. Отправка заявки

После успешного submit:

1. заявка сохраняется;
2. создаётся одноразовый token для Telegram deep link;
3. пользователь видит экран успешной отправки;
4. вместо автоматической регистрации выводится CTA:

```text
Продолжить в Telegram
```

Ссылка:

```text
https://t.me/<bot_username>?start=<token>
```

На экране написать примерно:

> **Заявка сохранена. Теперь подтвердите Telegram, чтобы получить ссылку для регистрации.**

Не создавать аккаунт до Telegram-подтверждения.

---

## 11. Telegram-подтверждение заявки

После перехода пользователь нажимает `Start`.

Telegram webhook получает:

```text
from.id
from.username
chat.id
start payload
```

Backend:

1. проверяет token;
2. проверяет срок действия;
3. находит заявку;
4. проверяет её статус;
5. сравнивает `from.username` с Telegram username из заявки;
6. проверяет уникальность `telegram_user_id`;
7. сохраняет реальные Telegram identifiers;
8. помечает Telegram подтверждённым;
9. создаёт registration token;
10. отправляет пользователю ссылку регистрации.

Если Telegram username отличается:

```text
Не удалось подтвердить заявку.
Откройте ссылку с Telegram-аккаунта, указанного в заявке.
```

Если у аккаунта Telegram отсутствует username:

```text
Для подтверждения заявки необходим Telegram username.
```

---

## 12. Telegram identity

После подтверждения основной идентификатор Telegram пользователя:

```text
telegram_user_id
```

Дополнительно хранить:

```text
telegram_username
telegram_chat_id
```

`telegram_user_id` уникален глобально для TutorGate.

Один Telegram account:

```text
1 Telegram account = максимум 1 TutorGate account
```

Telegram username может меняться, поэтому он не является главным identity key после привязки.

---

## 13. Регистрация

После Telegram confirmation бот присылает:

```text
https://<TutorGate-domain>/register?token=<one-time-token>
```

Registration token:

```text
TTL: 24 часа
одноразовый
```

В БД хранить **hash токена**, а не открытый token.

Страница `/register` показывает только:

```text
Логин
Пароль
Повторите пароль
```

Не показывать:

```text
ФИО
Telegram
роль
предметы
опыт
цель
email
```

Эти данные уже известны из заявки.

После регистрации:

1. проверяется registration token;
2. проверяется его expiry;
3. проверяется `used_at`;
4. проверяется логин;
5. создаётся Supabase Auth user;
6. создаётся профиль;
7. привязывается подтверждённый Telegram ID;
8. token помечается использованным;
9. заявка получает статус `registered`;
10. пользователь может войти.

При повторном открытии использованной ссылки:

```text
Эта ссылка уже использована.
```

При expiry:

```text
Срок действия ссылки истёк.
```

---

## 14. Пароли

Минимальная длина:

```text
8 символов
```

В registration/reset формах обязательно:

```text
Пароль
Повторите пароль
```

Значения должны совпадать.

Пароль никогда не хранится в собственной таблице TutorGate.

Он передаётся Supabase Auth.

---

## 15. Восстановление пароля

Маршрут:

```text
/forgot-password
```

Поле:

```text
Telegram
```

Пример:

```text
@username
```

После submit сервер:

1. нормализует username;
2. ищет связанный TutorGate profile;
3. получает сохранённый `telegram_chat_id`;
4. создаёт password reset token;
5. отправляет ссылку через Telegram Bot.

TTL:

```text
30 минут
```

Пользователь получает:

```text
https://<domain>/reset-password?token=<token>
```

Ссылка одноразовая.

Чтобы исключить enumeration, сайт всегда показывает одинаковый ответ:

```text
Если Telegram привязан к аккаунту TutorGate,
ссылка для восстановления отправлена в бот.
```

Нельзя показывать:

```text
Пользователь не найден
```

---

## 16. Reset password

Маршрут:

```text
/reset-password?token=...
```

Форма:

```text
Новый пароль
Повторите пароль
```

При валидном токене backend выполняет server-only изменение пароля через Supabase Admin API.

После успешной операции:

```text
Пароль изменён
→ Войти
```

Password reset token помечается использованным.

---

## 17. Роли

Роли:

```text
student
tutor
admin
```

Администратор **одновременно обладает возможностями репетитора**, однако role хранится как:

```text
admin
```

То есть логика:

```text
student → student permissions

tutor → tutor permissions

admin → admin permissions + tutor capabilities
```

---

## 18. Redirect после авторизации

```text
student → /student/schedule

tutor → /tutor/schedule

admin → /admin/schedule
```

Пользователь не должен иметь доступ к чужому dashboard.

Например:

```text
student → /admin/*     denied
student → /tutor/*     denied

tutor → /admin/*       denied
tutor → /student/*     denied
```

Admin имеет только свои admin pages, но внутри них обладает tutor capabilities.

---

## 19. Структура БД

### `profiles`

```text
id                  uuid PK → auth.users.id
role                app_role
full_name           text
telegram_username   text
telegram_user_id    text UNIQUE
telegram_chat_id    text UNIQUE
created_at          timestamptz
updated_at          timestamptz
```

`telegram_user_id` и `telegram_chat_id` хранить как `text`: это identifiers, арифметика над ними никогда не требуется.

Логин и auth alias не хранить в публично доступном profile.

### `applications`

```text
id                       uuid PK
role                     student | tutor
full_name                text
telegram_username        text
student_goal             nullable
teaching_experience      nullable
privacy_accepted_at      timestamptz
status                   application_status
telegram_user_id         nullable
telegram_chat_id         nullable
telegram_verified_at     nullable
registered_at            nullable
created_at               timestamptz
updated_at               timestamptz
```

Внутренние статусы:

```text
pending_telegram
telegram_verified
registered
expired
```

Никакого admin UI для заявок нет.

### `subjects`

```text
id
name
is_active
created_at
updated_at
```

`name` уникален без учёта регистра.

Удаление предмета в UI означает:

```text
is_active = false
```

а не физическое удаление строки.

Это необходимо, чтобы старые назначения и заявки не теряли ссылочную целостность.

В новых формах показываются только:

```text
is_active = true
```

### `application_subjects`

```text
application_id
subject_id
```

Composite primary key:

```text
(application_id, subject_id)
```

### `tutor_subjects`

Окончательные предметы, назначенные администратором:

```text
tutor_id
subject_id
assigned_by
created_at
```

Репетитор самостоятельно изменять их не может.

### `student_tutor_assignments`

Связь:

```text
Ученик
→ Предмет
→ Репетитор
```

Поля:

```text
id
student_id
subject_id
tutor_id
assigned_by
created_at
updated_at
```

В MVP для одного предмета у конкретного ученика хранится один назначенный tutor.

Например:

```text
Иван Иванов
├── Математика → Алексей Петров
└── Физика     → Сергей Иванов
```

Один tutor может вести одного ученика по нескольким предметам.

### `app_settings`

Singleton row:

```text
id
hourly_rate
updated_at
updated_by
```

Ставка **одна глобальная для всех репетиторов**.

Формула будущей статистики:

```text
earning = completed_hours × hourly_rate
```

Индивидуальной ставки у репетитора нет.

---

## 20. Private DB schema

Создать отдельную PostgreSQL schema:

```text
private
```

Она не должна быть доступна через обычный клиент.

В ней хранить чувствительные технические сущности.

### `private.auth_aliases`

```text
user_id
username_normalized UNIQUE
auth_email_alias UNIQUE
```

Именно здесь происходит mapping:

```text
username → internal Supabase auth email
```

### `private.one_time_tokens`

```text
id
purpose
token_hash
application_id nullable
user_id nullable
expires_at
used_at nullable
created_at
```

Purpose:

```text
telegram_application
registration
password_reset
```

Не хранить plaintext token.

### Telegram webhook idempotency

Необходимо гарантировать, что Telegram retry одного update не создаёт несколько регистрационных ссылок.

Для этого допустима минимальная техническая таблица:

```text
private.telegram_updates
```

с уникальным:

```text
telegram_update_id
```

Это не пользовательская функция, а защита webhook от повторной обработки.

---

## 21. RLS и безопасность

**RLS включить на всех exposed tables.**

Примерная матрица:

| Entity | Student | Tutor | Admin |
|---|---|---|---|
| свой profile | read | read | read |
| чужие profiles | только назначенные tutor | только назначенные students | read |
| subjects | read | read | CRUD |
| tutor_subjects | назначенные ему | свои | CRUD |
| student assignments | свои | свои | CRUD |
| app_settings | — | — | read/update |
| applications | — | — | — |
| private schema | — | — | — |

Заявки не должны отправляться прямым anon insert из browser.

Использовать server action.

`private` schema доступна только server-side административному коду.

---

## 22. Защита маршрутов

Next.js `proxy.ts`:

- проверяет session;
- обновляет Supabase Auth cookies;
- делает route redirect по role.

Но **Proxy не является единственным security boundary**.

Каждая server mutation отдельно проверяет user/role, а database access дополнительно защищается RLS.

---

## 23. Telegram Bot

Bot находится **в том же Next.js repository**.

Отдельный backend/repository не создавать.

Webhook:

```text
POST /api/telegram/webhook
```

Telegram отправляет запрос напрямую в Vercel Function.

При вызове Telegram `setWebhook` обязательно использовать:

```text
secret_token
```

Backend проверяет header:

```text
X-Telegram-Bot-Api-Secret-Token
```

Bot token никогда не находится в client bundle.

---

## 24. Функции Telegram Bot в MVP

Bot выполняет **только** необходимые задачи.

### Сценарий заявки

```text
/start <application-token>
→ подтвердить Telegram
→ отправить registration link
```

### Восстановление

Bot получает server-side команду:

```text
sendMessage(chat_id, reset link)
```

Другого функционала пока нет.

Не делать:

- меню бота;
- расписание через бот;
- уведомления о занятиях;
- чат;
- команды управления;
- профиль;
- статистику.

---

## 25. Панель ученика

Desktop navigation:

```text
TutorGate

Расписание
Репетиторы
```

### `/student/schedule`

Пока только placeholder.

Пример:

```text
Расписание

Раздел расписания пока находится в разработке.
```

Без календаря.

Без создания занятий.

Без API расписания.

Без временной фиктивной БД занятий.

---

## 26. `/student/tutors`

Показывать только назначенных ученику репетиторов.

Карточка/строка:

```text
Алексей Петров
Математика

Сергей Иванов
Физика
```

Если один tutor ведёт несколько предметов:

```text
Алексей Петров
Математика
Физика
```

Не показывать Telegram ученику.

Не добавлять кнопки сообщений.

Не добавлять профили репетиторов.

Не добавлять отзывы.

---

## 27. Панель репетитора

Navigation:

```text
Расписание
Ученики
Статистика
```

---

## 28. `/tutor/schedule`

Только placeholder.

Реального функционала расписания в текущем MVP нет.

---

## 29. `/tutor/students`

Выводить только учеников, которые назначены этому tutor.

Для каждого:

```text
ФИО ученика
Предмет / предметы
```

Например:

```text
Иван Иванов
Математика
Физика
```

Репетитор:

- не назначает учеников;
- не удаляет учеников;
- не меняет предметы;
- не видит всех учеников TutorGate.

---

## 30. `/tutor/statistics`

Показывает статистику только текущего tutor.

Контролы периода:

```text
7 дней
14 дней
30 дней
Свой период
```

Для `Свой период`:

```text
Дата от
Дата до
```

Показатель:

```text
Заработок
Часы
Занятия
```

Основной график строится через Recharts.

Интерфейс должен содержать:

```text
summary metrics
period selector
metric selector
main chart
tooltip
axis
empty state
```

Например вверху три компактные карточки:

```text
Заработок
Часы
Занятия
```

Ниже график выбранного показателя.

---

## 31. Статистика до реализации расписания

Так как реальные занятия пока не существуют, **не создавать фиктивную production-историю занятий**.

Страница статистики должна быть полностью реализована:

- period controls;
- metric selector;
- admin tutor selector;
- responsive chart;
- KPI;
- loading;
- empty state;
- service interface для будущего datasource.

Но реальные значения пока:

```text
0
```

и график имеет состояние:

```text
Нет данных за выбранный период
```

Не подставлять random/demo данные в production.

Архитектура должна позволить позднее подключить расписание без переделки UI.

Например:

```ts
type StatisticsMetric = "earnings" | "hours" | "lessons"

interface StatisticsPoint {
  date: string
  value: number
}
```

Функции:

```text
getTutorStatistics(...)
getAdminStatistics(...)
```

сейчас возвращают корректный empty dataset.

---

## 32. Панель администратора

Navigation:

```text
Расписание
Репетиторы
Ученики
Статистика
Настройки
```

---

## 33. `/admin/schedule`

Администратор одновременно является tutor.

Этот раздел в будущем будет его собственным расписанием.

Сейчас — такой же placeholder.

---

## 34. `/admin/tutors`

Экран содержит:

```text
Заголовок
Поиск
Фильтр по предмету
Список / таблицу репетиторов
```

Поиск — по ФИО.

Subject filter:

```text
Все предметы
Математика
Физика
...
```

Строка tutor:

```text
ФИО
Назначенные предметы
Telegram
Управление предметами
```

Telegram отображать как кликабельное действие:

```text
Открыть Telegram
```

---

## 35. Назначение предметов репетитору

Администратор открывает управление предметами конкретного tutor.

Использовать shadcn Dialog или Sheet.

Внутри:

```text
[x] Математика
[x] Физика
[ ] Химия
```

Администратор может:

- добавить предмет;
- снять предмет.

Репетитор сам этого сделать не может.

Предметы из заявки можно сохранить в application history, но они **не назначаются автоматически**.

---

## 36. `/admin/students`

Содержит:

```text
Поиск
Фильтр по репетитору
Таблицу / список
```

Поиск по ФИО ученика.

Tutor filter:

```text
Все репетиторы
Алексей Петров
Сергей Иванов
...
```

Для ученика показать:

```text
ФИО
Назначенные пары "репетитор + предмет"
Telegram
Управление назначениями
```

Пример:

```text
Иван Иванов

Алексей Петров · Математика
Сергей Иванов · Физика
```

Telegram:

```text
Открыть Telegram
```

---

## 37. Назначение tutor ученику

Открывается Dialog/Sheet.

Логика строится вокруг:

```text
Предмет → Tutor
```

Администратор выбирает предмет ученика и tutor, которому этот предмет назначен.

Нельзя назначить:

```text
ученику математику → tutor без предмета "Математика"
```

Допустимо:

```text
Математика → Иван Петров
Физика → Сергей Сидоров
```

Допустимо:

```text
Математика → Иван Петров
Физика → Иван Петров
```

Tutor имя везде показывается рядом с предметом.

---

## 38. `/admin/statistics`

UI почти совпадает с tutor statistics.

Дополнительно есть selector:

```text
Общая статистика
Алексей Петров
Сергей Иванов
...
```

То есть admin может выбрать:

```text
Все репетиторы
или
конкретного tutor
```

Period:

```text
7 дней
14 дней
30 дней
Свой период
```

Metric:

```text
Заработок
Часы
Занятия
```

Для общей статистики будущая логика:

```text
earnings = сумма earnings tutors
hours = сумма completed hours
lessons = количество completed lessons
```

Пока datasource пустой.

---

## 39. `/admin/settings`

Два блока:

```text
Ставка за час
Предметы
```

### Ставка

Один numeric input:

```text
Ставка за час
```

Одна глобальная ставка.

Нельзя вводить отрицательные значения.

Изменять может только admin.

---

## 40. Предметы

Список:

```text
Математика
Физика
Химия
Русский язык
...
```

Действия:

```text
Добавить предмет
Удалить предмет
```

При добавлении:

- trim;
- не разрешать пустой name;
- не разрешать duplicates без учёта регистра.

При удалении:

```text
is_active = false
```

После этого предмет:

- исчезает из новых заявок;
- исчезает из нового назначения;
- исторические отношения остаются целыми.

---

## 41. UI/UX TutorGate

Основное направление:

> **warm dark mode + строгий техно-минимализм + Linear/Vercel composition в coffee/mocha palette.**

Не делать обычный серо-синий SaaS.

### Пример design tokens

Не обязательно использовать именно эти HEX буквально, но итоговый визуал должен оставаться внутри этой системы:

```css
--background: #17130f;
--surface: #1e1914;
--surface-raised: #251e18;

--foreground: #f2e8dc;
--muted-foreground: #b8aa9b;

--border: rgba(244, 224, 203, 0.10);
--border-strong: rgba(244, 224, 203, 0.16);

--accent: #d39a59;
--accent-hover: #dda667;
--accent-foreground: #1b140e;

--danger: #d9776a;
```

Не использовать абсолютно чёрный `#000`.

Не использовать чисто белый `#fff` как основной текст.

---

## 42. Скругления

Основной radius:

```text
6px
8px
10px
```

Стандарт:

```text
inputs      8px
buttons     8px
cards       10px
dialogs     10px
badges      6px
```

Не использовать чрезмерные SaaS-pill формы.

Исключение — маленькие tags/subjects.

---

## 43. Borders и разделение

Основной способ разделения:

```text
1px semi-transparent border
subtle surface contrast
spacing
```

Не использовать:

- тяжёлые shadows;
- glow;
- neon;
- glassmorphism;
- blur backgrounds;
- декоративные gradients;
- сильные drop shadows.

Допустима практически незаметная мягкая тень только там, где нужно отделить Dialog/Popover.

---

## 44. Типографика

Рекомендуемый основной font:

```text
Geist
```

через `next/font`.

Для технических мелких элементов допустим Geist Mono.

Типографика компактная.

Пример:

```text
Page title        20–24px / 600
Section title     15–16px / 600
Body              13–14px
Label             12–13px / 500
Secondary         12–13px
Table             13px
Button            13–14px / 500–600
```

Не делать oversized dashboard headings.

---

## 45. Inputs

Высота desktop:

```text
36–40px
```

На mobile:

```text
40–44px
```

Стиль:

```text
dark mocha background
1px border
cream placeholder
caramel focus ring
8px radius
```

Фокус должен быть заметен, но не ярко-синим.

---

## 46. Buttons

Primary:

```text
caramel background
dark text
```

Secondary:

```text
dark surface
thin border
cream text
```

Ghost:

```text
transparent
subtle hover
```

Danger только для удаления предмета.

Не превращать все действия в accent buttons.

---

## 47. Предметы

Subjects показывать как компактные badges/chips.

Пример:

```text
Математика
Физика
```

Карамельный цвет использовать умеренно:

- маленькая иконка;
- border;
- active state;
- accent text.

Не окрашивать всю таблицу в оранжевый.

---

## 48. Иконки

Только:

```text
lucide-react
```

Стандартный размер:

```text
14–18px
```

Stroke:

```text
1.5–2
```

Не использовать emoji вместо системных иконок.

---

## 49. Dashboard layout

Desktop:

```text
┌──────────────┬───────────────────────────┐
│ TutorGate    │ Page title                │
│              │                           │
│ Navigation   │ Content                   │
│              │                           │
│              │                           │
│ Account      │                           │
└──────────────┴───────────────────────────┘
```

Sidebar примерно:

```text
220–240px
```

Content:

```text
max-width: 1400–1500px
```

Не растягивать содержимое без ограничений на ultrawide displays.

---

## 50. Mobile

Весь MVP адаптивный.

Поддержать:

```text
mobile
tablet
desktop
```

На mobile:

- sidebar превращается в Sheet/mobile nav;
- таблицы адаптируются;
- dialogs не выходят за экран;
- формы идут в одну колонку;
- buttons имеют достаточную touch area;
- графики не создают horizontal overflow.

Форма заявки визуально должна быть близка к предоставленным референсам.

---

## 51. Графики

Использовать Recharts.

Визуал:

- тёмный background;
- очень тонкая grid;
- muted axis;
- caramel data line/area;
- аккуратный custom tooltip;
- никаких rainbow colors;
- никаких 3D charts;
- никаких pie charts без необходимости.

Основной chart — line/area chart.

Для выбранного показателя отображается одна series.

---

## 52. Loading states

Не использовать огромные spinners по центру dashboard.

Использовать:

```text
Skeleton
button pending state
small spinner where necessary
```

---

## 53. Empty states

Пример для tutor:

```text
Ученики

У вас пока нет назначенных учеников.
```

Для statistics:

```text
Нет данных за выбранный период
```

Для schedule:

```text
Расписание пока недоступно

Этот раздел будет реализован на следующем этапе.
```

Не добавлять лишние CTA туда, где пользователь ничего не может сделать.

---

## 54. Ошибки

Ошибки формы показывать рядом с полем.

Например:

```text
Введите ФИО
Выберите хотя бы один предмет
Укажите Telegram
Выберите цель занятий
```

Server errors:

```text
Не удалось отправить заявку. Попробуйте ещё раз.
```

Не показывать пользователю:

- stack trace;
- SQL error;
- Supabase raw error;
- Telegram API response;
- internal IDs.

---

## 55. Рекомендуемая структура проекта

```text
src/
├── app/
│   ├── (public)/
│   │   ├── login/
│   │   ├── apply/
│   │   ├── register/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   │
│   ├── student/
│   │   ├── schedule/
│   │   └── tutors/
│   │
│   ├── tutor/
│   │   ├── schedule/
│   │   ├── students/
│   │   └── statistics/
│   │
│   ├── admin/
│   │   ├── schedule/
│   │   ├── tutors/
│   │   ├── students/
│   │   ├── statistics/
│   │   └── settings/
│   │
│   └── api/
│       └── telegram/
│           └── webhook/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── statistics/
│   └── shared/
│
├── features/
│   ├── applications/
│   ├── auth/
│   ├── students/
│   ├── tutors/
│   ├── subjects/
│   ├── statistics/
│   └── telegram/
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── telegram/
│   ├── auth/
│   ├── validation/
│   └── utils/
│
└── types/

supabase/
└── migrations/

docs/
AGENTS.md
README.md
```

---

## 56. Server/feature organization

Не складывать всю business logic в:

```text
page.tsx
```

Разделение:

```text
page
↓
feature/server action
↓
service
↓
Supabase
```

Например:

```text
features/tutors/actions.ts
features/tutors/queries.ts
features/tutors/schema.ts
```

---

## 57. Zod schemas

Все пользовательские формы должны иметь серверную Zod validation.

Например:

```text
applicationStudentSchema
applicationTutorSchema
loginSchema
registrationSchema
forgotPasswordSchema
resetPasswordSchema
subjectSchema
hourlyRateSchema
assignmentSchema
```

Client-side validation существует только ради UX.

**Server-side validation обязательна всегда.**

---

## 58. Search/filter

Admin tutor search:

```text
по ФИО
```

Admin student search:

```text
по ФИО
```

Debounce на клиенте допустим.

Состояние желательно хранить в URL:

```text
/admin/tutors?q=иван&subject=...
```

и:

```text
/admin/students?q=иван&tutor=...
```

Это не отдельная функция продукта, а способ сделать фильтры устойчивыми к refresh/navigation.

---

## 59. Telegram links в admin

Для пользователя с:

```text
telegram_username = ivanov
```

кнопка ведёт на:

```text
https://t.me/ivanov
```

Открытие — новая вкладка.

Никаких встроенных Telegram chats.

---

## 60. Vercel deployment

Deployment target:

```text
Vercel
```

Next.js должен использовать стандартный Vercel adapter — никаких Docker containers.

Telegram webhook работает как Vercel Function.

Для такого webhook не требуется long-running process. Route должен максимально быстро обработать update и вернуть `2xx`.

---

## 61. Environment variables

`.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_SECRET_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=

APP_URL=

AUTH_ALIAS_DOMAIN=
```

Не использовать:

```text
NEXT_PUBLIC_SUPABASE_SECRET_KEY
NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
```

Секреты server-only.

На Vercel env variables задаются через Project Settings и могут различаться для Production/Preview/Development.

---

## 62. APP_URL

Production:

```text
https://<production-domain>
```

Используется для генерации:

```text
registration URL
password reset URL
```

Не собирать эти URL из произвольного `Host` request header.

---

## 63. Webhook setup

После production deployment выполнить Telegram:

```text
setWebhook(
  url = APP_URL + "/api/telegram/webhook",
  secret_token = TELEGRAM_WEBHOOK_SECRET
)
```

Webhook должен принимать только `POST`.

---

## 64. Security requirements

Обязательные требования:

```text
RLS на exposed tables
secret key server-only
Telegram token server-only
one-time tokens hashed
registration token TTL 24h
password reset TTL 30m
tokens single-use
generic forgot-password response
unique telegram_user_id
unique username
server-side Zod validation
role checks on every mutation
Telegram webhook secret validation
```

Дополнительно публичные endpoints:

```text
application submit
login
forgot-password
```

должны иметь базовый abuse/rate protection, особенно восстановление пароля, чтобы TutorGate нельзя было использовать как Telegram spam relay.

Это техническая защита существующего функционала, не отдельная продуктовая функция.

---

## 65. Документация проекта

Документация — обязательная часть разработки.

Создать:

```text
README.md
AGENTS.md

docs/
├── architecture.md
├── database.md
├── auth-and-telegram.md
├── ui-guidelines.md
├── decisions.md
├── known-issues.md
└── progress.md
```

---

## 66. `AGENTS.md`

**Максимум 200 строк.**

Файл должен быть короткой постоянной памятью проекта.

Содержать:

```text
Что такое TutorGate
Current stack
Commands
Architecture rules
Auth model
Roles
RLS rules
Design language
Things explicitly out of scope
Important current bugs
Critical decisions
Where detailed docs are located
```

Не превращать `AGENTS.md` в полный технический роман.

При приближении к 200 строк подробности переносить в `docs/*`.

---

## 67. `docs/known-issues.md`

Каждый обнаруженный существенный bug:

```text
ID
Дата
Статус
Описание
Как воспроизвести
Причина
Решение
Какие файлы изменены
```

Статусы:

```text
open
investigating
fixed
won't fix
```

После исправления bug не удалять, а менять status на `fixed`, если знание может помочь не повторить проблему.

---

## 68. `docs/decisions.md`

Хранить архитектурные решения.

Например:

```text
ADR-001 — Username auth через скрытый Supabase alias
ADR-002 — Telegram user_id является основным Telegram identity
ADR-003 — Subjects удаляются soft-delete
ADR-004 — Admin является role=admin с tutor capabilities
ADR-005 — Schedule отсутствует в MVP
```

---

## 69. `docs/ui-guidelines.md`

Зафиксировать:

```text
colors
radii
spacing
typography
sidebar behavior
tables
forms
charts
mobile
allowed/disallowed visual effects
```

Чтобы новые страницы не уходили от warm/mocha дизайна.

---

## 70. `docs/database.md`

Содержит:

- ER model;
- tables;
- columns;
- indexes;
- constraints;
- RLS policy descriptions;
- migrations history notes.

Не использовать этот файл вместо migrations.

Источником истины для реальной БД остаются SQL migrations.

---

## 71. Migration policy

Все изменения Supabase schema делаются migrations.

Не изменять production database вручную без migration.

Структура:

```text
supabase/migrations/
202609...._initial_schema.sql
202609...._rls.sql
...
```

---

## 72. Что категорически не входит в MVP

Чтобы разработчик/AI не начал расширять scope:

**Не реализовывать:**

- landing page;
- настоящий calendar/schedule;
- создание занятия;
- изменение занятия;
- отметку проведения занятия;
- перенос занятия;
- оплату;
- биллинг;
- чат TutorGate;
- сообщения между учеником и tutor;
- email;
- email verification;
- email reset;
- админ-раздел заявок;
- ручное одобрение заявки;
- блокировку пользователей;
- удаление учеников;
- удаление репетиторов;
- профиль пользователя;
- редактирование ФИО;
- отзывы;
- рейтинг tutor;
- tutor marketplace;
- самостоятельный выбор tutor учеником;
- самостоятельное назначение предметов tutor;
- индивидуальные ставки;
- Telegram notifications о занятиях;
- Telegram schedule;
- multi-language/i18n;
- реальные статистические lesson records до реализации расписания.

Это важная граница MVP.

---

## 73. Acceptance criteria: заявка

Функция считается готовой, если:

```text
✓ /apply открывается без авторизации
✓ есть tabs "Я ученик / Я репетитор"
✓ email отсутствует
✓ subjects приходят из Supabase
✓ student может выбрать несколько subjects
✓ tutor может выбрать несколько subjects
✓ цель student выбирается одна
✓ experience tutor выбирается один
✓ consent обязателен
✓ после submit появляется Telegram CTA
✓ аккаунт ещё не создаётся
```

---

## 74. Acceptance criteria: Telegram + registration

```text
✓ deep link содержит одноразовый token
✓ webhook проверяет Telegram secret header
✓ username Telegram сверяется с заявкой
✓ telegram_user_id сохраняется
✓ один telegram_user_id нельзя связать с двумя users
✓ bot отправляет registration link
✓ registration link живёт 24 часа
✓ link single-use
✓ registration содержит только login/password/confirm
✓ email пользователь нигде не видит
✓ после регистрации создаётся Supabase account
```

---

## 75. Acceptance criteria: login/reset

```text
✓ login выполняется через username + password
✓ username case-insensitive
✓ username соответствует 3–32 / Latin / digits / underscore
✓ "Забыли пароль" принимает Telegram
✓ response не раскрывает существование аккаунта
✓ bot получает reset link
✓ reset link TTL 30 минут
✓ reset link single-use
✓ новый password сохраняется через Supabase Auth
```

---

## 76. Acceptance criteria: student

```text
✓ видит только student panel
✓ schedule имеет placeholder
✓ tutors показывает только назначенных ему tutors
✓ рядом с tutor показываются subjects
```

---

## 77. Acceptance criteria: tutor

```text
✓ schedule placeholder
✓ students показывает только назначенных ему students
✓ рядом с student указаны subjects
✓ statistics page существует
✓ 7/14/30/custom period работает на UI
✓ earnings/hours/lessons selector работает
✓ при отсутствии данных корректный zero/empty state
```

---

## 78. Acceptance criteria: admin

```text
✓ admin имеет schedule
✓ может искать tutors
✓ может фильтровать tutors по subject
✓ может открыть Telegram tutor
✓ может назначать/снимать subjects tutor
✓ может искать students
✓ может фильтровать students по tutor
✓ может открыть Telegram student
✓ может назначать tutor student по subject
✓ нельзя назначить tutor на отсутствующий у tutor subject
✓ statistics имеет overall/specific tutor
✓ statistics имеет 7/14/30/custom
✓ statistics имеет earnings/hours/lessons
✓ settings позволяет изменить global hourly rate
✓ settings позволяет добавить subject
✓ settings позволяет удалить/deactivate subject
```

---

## 79. Acceptance criteria: responsive/design

Проверить минимум:

```text
375px
768px
1280px
1440px
```

На всех размерах:

```text
✓ нет horizontal overflow
✓ dialogs помещаются на экран
✓ формы читаемы
✓ navigation доступна
✓ таблицы адаптированы
✓ charts responsive
✓ visual system остаётся warm dark
```

---

## 80. Acceptance criteria: security

```text
✓ student не читает чужих students
✓ student не читает admin data
✓ tutor не читает чужих students
✓ tutor не назначает subjects
✓ tutor не назначает students
✓ admin operations проверяют role server-side
✓ RLS включён
✓ secret key отсутствует в browser bundle
✓ Telegram bot token отсутствует в browser bundle
✓ raw one-time tokens отсутствуют в DB
✓ webhook с неправильным secret отклоняется
```

---

## 81. Acceptance criteria: Vercel

Перед завершением MVP:

```text
npm ci
npm run lint
npm run typecheck
npm run build
```

проходят без ошибок.

Production deployment на Vercel:

```text
✓ build successful
✓ Node.js 24.x
✓ Supabase connection working
✓ Auth cookies working
✓ application working
✓ Telegram webhook working
✓ registration link points to production
✓ password recovery link points to production
✓ protected routes work after refresh
```

---

## 82. Порядок разработки

Рекомендуемая последовательность именно для этого scope:

1. Инициализация Next.js + npm + TypeScript + Tailwind + shadcn.
2. Создание warm-dark design system.
3. Supabase migrations и RLS.
4. Supabase SSR/auth layer.
5. Форма заявки student/tutor.
6. Telegram webhook и confirmation flow.
7. Registration через одноразовую ссылку.
8. Login.
9. Telegram password reset.
10. Общий dashboard shell.
11. Student sections.
12. Tutor sections.
13. Admin tutors.
14. Admin students/assignments.
15. Settings.
16. Statistics UI + empty data contract.
17. Responsive polish.
18. Security/RLS testing.
19. Документация.
20. Vercel production deployment.

---

## 83. Ключевая архитектурная установка для расписания

На текущем этапе **не создавать `lessons`, `schedule_events`, `availability`, `calendar_slots` и подобные таблицы «на будущее»**.

Расписание будет отдельным сложным этапом и его модель нужно спроектировать тогда, когда будут определены:

```text
availability
duration
timezone
recurrence
cancellations
rescheduling
lesson state
conflicts
teacher/student calendars
```

Сейчас заранее выбранная модель скорее помешает.

Поэтому текущий MVP оставляет расписание изолированным placeholder, а статистика работает через абстрактный service interface с empty dataset.

Это позволит позже спроектировать расписание правильно, не ломая уже готовые auth, roles, users, subjects и assignments.

---

## Итоговая архитектура MVP

```text
Application
    ↓
Telegram verification
    ↓
One-time registration URL
    ↓
Username + password
    ↓
Supabase Auth
    ↓
Role dashboard

Student
├── Schedule [placeholder]
└── Tutors

Tutor
├── Schedule [placeholder]
├── Students
└── Statistics [ready UI / empty datasource]

Admin
├── Schedule [placeholder]
├── Tutors
├── Students
├── Statistics [ready UI / empty datasource]
└── Settings
```

При этом **email отсутствует полностью из пользовательского продукта**, Telegram является подтверждённой связью с аккаунтом, администратор контролирует subjects и назначения, а архитектура уже готова к последующему отдельному этапу с расписанием.

---

## Статус документа

Это ТЗ является базовой спецификацией **TutorGate MVP v1.0** для реализации на **Next.js + Supabase + Vercel**.

Границы MVP фиксированы настоящим документом: разработчик или AI-агент не должен добавлять функциональность, которой нет в этом ТЗ, без отдельного согласования.
