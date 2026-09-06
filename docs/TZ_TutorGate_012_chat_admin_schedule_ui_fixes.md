# ТЗ: TutorGate — пакет 012

Дата фиксации: 06.09.2026  
Статус: согласовано, готово к разработке  
База проекта: TutorGate v2, пакет 011

## 1. Цель пакета

Пакет 012 должен исправить найденные проблемы Telegram-чата и интерфейса, расширить роль администратора как преподавателя и дать администратору контролируемый доступ к расписаниям репетиторов.

В пакет входят шесть продуктовых изменений:

1. исправить кнопку `✕ Отмена` в Telegram-боте и добавить ученику кнопку `↩️ Ответить` под сообщением репетитора;
2. дать администратору собственный раздел чатов, поскольку администратор может одновременно быть преподавателем;
3. убрать два лишних поясняющих текста из веб-чата;
4. оформить аккуратный scrollbar в списке диалогов и истории сообщений;
5. исправить раскладку страницы `/admin/settings`, показанную на скриншоте: Telegram не должен проваливаться вниз из-за высоты карточки «Предметы»;
6. из раздела `/admin/tutors` дать администратору переход в расписание выбранного репетитора и возможность полноценно его редактировать в рамках назначений этого репетитора.

Пакет 012 **явно отменяет** следующие продуктовые ограничения пакета 011:

- admin больше не исключается из преподавательских чатов, если у него есть назначения ученикам;
- ученик может выбирать admin как репетитора в Telegram, если существует активное назначение;
- в Telegram-сообщении, доставленном ученику от преподавателя, должна быть кнопка `↩️ Ответить`;
- администратор получает право редактировать расписание другого активного репетитора через специально защищённый delegated-admin flow.

Историческую миграцию `202609060011_chat_and_telegram_bot.sql` не редактировать. Все изменения БД оформить новой миграцией пакета 012.

---

## 2. Зафиксированные продуктовые решения

По итогам уточнений зафиксировать следующую логику без дополнительных трактовок.

### 2.1. Telegram

- Кнопка `↩️ Ответить` нужна **ученику под сообщением от репетитора**.
- Нажатие `↩️ Ответить` не открывает сайт: бот переводит ученика в режим отправки следующего текстового сообщения выбранному преподавателю.
- Стандартный Telegram Reply на полученное сообщение продолжает работать и имеет приоритет над сохранённым получателем.
- `✕ Отмена` должна реально завершать текущий сценарий выбора/ответа, очищать выбранного получателя и давать пользователю видимый результат.

### 2.2. Чаты администратора

- Администратор имеет собственные преподавательские чаты.
- Администратор видит **только своих учеников**, то есть учеников, для которых существует назначение `student_tutor_assignments.tutor_id = admin.id`.
- Администратор не получает права просматривать чужие переписки других репетиторов.
- Ученик должен видеть администратора в Telegram picker как обычного репетитора, если он назначен этому ученику.
- Новое сообщение ученика администратору должно отправлять администратору Telegram-уведомление с переходом в `/admin/chats`.

### 2.3. Расписание

- Выбор чужого расписания осуществляется **через раздел «Репетиторы»**, а не через отдельный глобальный selector на странице расписания.
- У администратора сохраняется `/admin/schedule` как его собственное расписание.
- Из строки репетитора в `/admin/tutors` открывается расписание конкретного пользователя.
- В чужом расписании администратор получает тот же функционал редактирования, что владелец расписания, **кроме изменения персонального сдвига МСК выбранного репетитора**.
- При создании/редактировании занятия администратору доступны только ученики и предметы, реально доступные выбранному репетитору по его назначениям.
- Администратор имеет право **просматривать и редактировать приватные заметки** занятий выбранного репетитора.

---

## 3. Текущее состояние и причины проблем

### 3.1. Кнопка `✕ Отмена`

Текущая реализация находится в:

- `src/lib/telegram/templates.ts`;
- `src/features/chats/bot-handler.ts`;
- `tests/package-011.test.ts`.

Сейчас `chat:cancel` вызывает очистку `private.telegram_chat_state`, после чего handler делает `return` без нового сообщения пользователю. Unit-тест пакета 011 дополнительно фиксирует это поведение как `silent cancel`.

Из-за отсутствия пользовательского ответа создаётся впечатление, что кнопка не работает.

### 3.2. Нет кнопки `Ответить`

`src/lib/telegram/templates.ts::tutorMessage()` сейчас создаёт сообщение преподавателя без inline keyboard.

Тест пакета 011 специально проверяет отсутствие `Ответить`, поэтому старый тест должен быть изменён в рамках пакета 012.

### 3.3. Admin исключён из чатов

Ограничение реализовано сразу в нескольких слоях:

- `/tutor/chats` защищён `requireRole("tutor")`;
- chat Server Actions требуют только роль `tutor`;
- `private.chat_pair_active()` требует у преподавателя `role='tutor'`;
- `private.chat_require_tutor()` требует `role='tutor'`;
- admin отсутствует в навигационном пункте `Чаты`;
- `chat_bot_tutors()` зависит от `chat_pair_active()` и поэтому не возвращает admin;
- Telegram notification URL сейчас всегда строится как `/tutor/chats?...`.

### 3.4. Лишние тексты веб-чата

Удалить без замены:

- `Переписка с учениками через Telegram.` — description заголовка страницы;
- `Вы пишете на сайте, ученик отвечает в Telegram. Время — МСК.` — текст в header выбранного диалога.

Часовой пояс сообщений при этом **не менять**: отображение времени продолжает использовать текущую логику `CHAT_TIME_ZONE`.

### 3.5. Scrollbar чата

`src/app/globals.css` использует `overflow:auto` / `overflow-y:auto`, но не задаёт визуальное оформление scrollbar.

### 3.6. Проблема `/admin/settings` со скриншота

Текущий `.settings-grid` — двухколоночный CSS Grid, а DOM-порядок карточек такой:

1. `Ставка за час`;
2. `Предметы`;
3. `Telegram`.

На desktop карточки `Ставка` и `Предметы` становятся в первую grid-строку. Высокая карточка `Предметы` задаёт высоту всей строки, поэтому `Telegram`, находящийся во второй строке слева, визуально уезжает далеко вниз и между карточками появляется большая пустая область.

### 3.7. Расписание другого репетитора

Текущая реализация расписания жёстко привязана к `auth.uid()`:

- `getSchedule()` читает занятия и назначения текущего пользователя;
- `getScheduleOffset()` читает preference текущего пользователя;
- `readScheduleUpdates()` синхронизирует только текущего пользователя;
- `getLessonNoteAction()` проверяет `lesson.tutor_id = user.id`;
- `public.schedule_command()` и вложенные функции используют `owner_id = auth.uid()`;
- `save_schedule_lesson`, `patch_schedule_lesson` и delete flow также используют `auth.uid()` как владельца.

Поэтому изменение только UI недостаточно. Нужен новый защищённый delegated-admin contract в БД.

---

# 4. TG-012-01 — исправить Telegram `Отмена`

## 4.1. Требуемое поведение

Кнопка:

`✕ Отмена`

используется в picker и в состоянии ожидания следующего сообщения.

После нажатия бот должен:

1. ответить на `callback_query`, чтобы Telegram убрал spinner;
2. определить текущий связанный профиль;
3. если профиль — активный `student`, удалить его запись из `private.telegram_chat_state`;
4. тем самым отменить сохранённого получателя и режим ожидания следующего текста;
5. отправить новое сообщение:

`✅ Действие отменено.`

6. под сообщением показать главное меню ученика:
   - `🌐 Открыть TutorGate`;
   - `💬 Написать репетитору`.

Не оставлять silent callback.

## 4.2. Stale callback

Если старую кнопку `Отмена` нажал пользователь, который уже не связан с активным student-профилем:

- не выполнять chat mutation;
- показать обычное безопасное стартовое меню для текущего состояния аккаунта;
- не выбрасывать ошибку webhook.

## 4.3. Идемпотентность

Повторное нажатие `Отмена`, когда `telegram_chat_state` уже отсутствует, считается успешной отменой и также должно давать видимый ответ.

## 4.4. Acceptance criteria

- после `Отмена` в `private.telegram_chat_state` нет выбранного tutor для ученика;
- пользователь видит `✅ Действие отменено.`;
- сразу доступны кнопки главного student-меню;
- следующее обычное сообщение без нового выбора не уходит старому преподавателю;
- callback spinner закрывается;
- webhook не падает при повторном/stale callback.

---

# 5. TG-012-02 — кнопка `Ответить` под сообщением преподавателя

## 5.1. Кнопка

Каждое Telegram-сообщение, отправленное ученику из веб-чата преподавателя, должно иметь inline-кнопку:

`↩️ Ответить`

Кнопка должна запускать bot flow, а **не URL**.

Рекомендуемый callback contract:

`chat:to:<tutor_uuid>`

Допустимо переиспользовать существующий `chat:to:` flow, если проверка назначения выполняется заново в момент нажатия.

UUID + префикс должны оставаться в лимите Telegram callback data 64 bytes.

## 5.2. Поведение после нажатия

После `↩️ Ответить` бот должен:

1. заново получить список доступных преподавателей ученика;
2. найти преподавателя из callback;
3. проверить, что активное назначение всё ещё существует;
4. записать выбранного преподавателя в `private.telegram_chat_state`;
5. отправить существующее сообщение вида:

`✏️ Сообщение репетитору`

`Вы пишете: <ФИО>`

`Отправьте следующим сообщением текст, который хотите передать репетитору.`

6. показать `✕ Отмена`;
7. следующее текстовое сообщение ученика сохранить в соответствующий диалог через существующий `chat_bot_receive` flow.

## 5.3. Если назначение снято

Если к моменту нажатия `↩️ Ответить` преподаватель больше не назначен ученику:

- не сохранять этого преподавателя в state;
- удалить устаревший сохранённый recipient, если он совпадает с недоступным преподавателем;
- показать `⚠️ Чат больше недоступен`;
- если есть другие преподаватели — показать `💬 Выбрать репетитора`;
- если преподавателей больше нет — не оставлять старого получателя.

## 5.4. Длинные сообщения

Текущий `tutorMessage()` разбивает очень длинное сообщение на две Telegram-отправки.

Для такого случая:

- кнопка `↩️ Ответить` должна находиться на **последней части**, содержащей фактический текст сообщения;
- `chat_finish_delivery` должен продолжать сохранять mapping именно последнего Telegram message id;
- стандартный Telegram Reply на последнюю часть должен продолжать однозначно находить нужный conversation.

## 5.5. Native Reply

Существующий Telegram Reply не удалять.

Если одновременно существует сохранённый recipient A, а ученик делает native Reply на сообщение преподавателя B, Reply должен отправить текст B. Это правило пакета 011 сохраняется.

## 5.6. Template API

`src/lib/telegram/templates.ts::tutorMessage()` должен получить достаточно данных для формирования callback выбранному преподавателю. Не получать tutor UUID из браузера или из Telegram message body.

Допустимый вариант API:

```ts
tutorMessage(tutorId: string, tutorName: string, body: string)
```

`actor.id` уже известен на server-only стороне в `chatSendAction`, поэтому отдельное раскрытие идентификатора клиенту не требуется.

## 5.7. Acceptance criteria

- у обычного сообщения преподавателя есть `↩️ Ответить`;
- у длинного сообщения кнопка находится на последней части;
- кнопка запускает режим ввода сообщения внутри бота;
- после нажатия следующий текст приходит правильному tutor/admin;
- назначение перепроверяется на сервере;
- снятое назначение не позволяет отправить сообщение;
- native Reply продолжает работать;
- лимит текста 4000 code points не меняется.

---

# 6. TG-012-03 — чаты администратора как преподавателя

## 6.1. Маршрут

Добавить:

`/admin/chats`

Страница должна использовать тот же основной Chat UI и те же chat contracts, что `/tutor/chats`.

Не делать отдельную независимую реализацию чата для admin.

## 6.2. Навигация

В `src/components/layout/navigation.tsx`:

- добавить `chats` в разрешённые пункты для `admin`;
- unread badge показывать и опрашивать для ролей `tutor` **и** `admin`;
- для admin ссылка должна вести в `/admin/chats` за счёт существующей role-based схемы URL.

## 6.3. Область видимости admin

Администратор в chat UI видит только пары:

`student_id + tutor_id = auth.uid()`

где `auth.uid()` — текущий admin.

Наличие роли admin **не даёт глобального доступа к chat_conversations**.

Запрещено:

- видеть список диалогов другого tutor;
- читать сообщения другого tutor;
- помечать сообщения другого tutor прочитанными;
- отправлять сообщение от имени другого tutor через chat actions.

## 6.4. DB role semantics

В chat domain преподавателем считается активный профиль:

```text
role in ('tutor', 'admin')
```

При этом `chat_messages.sender_role` менять не требуется: сообщение admin-преподавателя сохраняется как `sender_role='tutor'`, потому что это роль стороны диалога, а не системная роль аккаунта.

Новая миграция должна заменить/расширить:

- `private.chat_pair_active`;
- `private.chat_require_tutor` — рекомендуется переименовать/заменить на семантически корректный helper вроде `private.chat_require_teacher`;
- `chat_unread`;
- `chat_snapshot`;
- `chat_mark_read`;
- `chat_send`;
- service-only bot functions, которые зависят от `chat_pair_active`.

## 6.5. RLS

RLS для chat tables должен остаться participant-based.

Правило чтения:

- пользователь участвует в паре;
- пара активна;
- admin не получает `is_admin()` bypass для чужих чатов.

Это обязательное отличие chat permissions от административного directory/schedule доступа.

## 6.6. Telegram picker ученика

`public.chat_bot_tutors(p_student)` должен возвращать как преподавателей:

- `role='tutor'`;
- `role='admin'`;

при выполнении всех условий:

- профиль активен;
- ученик активен;
- есть хотя бы одно актуальное `student_tutor_assignments` между парой.

Предметы в picker агрегируются по назначениям как сейчас.

Если admin — единственный преподаватель ученика, shortcut с одним преподавателем должен работать без промежуточного picker.

## 6.7. Telegram-уведомление admin

После сообщения ученика сервис должен знать системную роль получателя.

Текущий `chat_notification_target()` возвращает только Telegram chat ID. В пакете 012 изменить service-only contract так, чтобы он возвращал минимум:

```ts
{
  chatId: string;
  role: "tutor" | "admin";
}
```

Bot handler строит URL:

- tutor → `/tutor/chats?student=<student_uuid>`;
- admin → `/admin/chats?student=<student_uuid>`.

Кнопка уведомления остаётся:

`💬 Открыть чат`

Admin по-прежнему отвечает ученику на сайте, а не обычным текстом в Telegram-боте.

## 6.8. Web route abstraction

Рекомендуется вынести общий server loader страницы чатов, чтобы `/tutor/chats` и `/admin/chats` не разъезжались по поведению.

`requireRole` должен разрешать только:

- `tutor` для tutor route;
- `admin` для admin route;

а общие chat actions — обе teacher-роли с повторной серверной проверкой.

## 6.9. Acceptance criteria

- в admin sidebar есть `Чаты`;
- admin видит unread badge;
- `/admin/chats` открывается для admin и недоступен student/tutor через подмену URL;
- admin видит только учеников, назначенных лично ему;
- admin может писать им с сайта;
- ученик получает сообщение в Telegram с `↩️ Ответить`;
- ученик может выбрать admin в `Написать репетитору`;
- ответ ученика появляется в `/admin/chats`;
- admin получает Telegram notification со ссылкой именно на `/admin/chats`;
- другой admin/tutor не может прочитать чужой conversation через прямой RPC/table access.

---

# 7. TG-012-04 — убрать тексты и оформить scrollbar чата

## 7.1. Удаляемые тексты

Полностью удалить из UI:

1. `Переписка с учениками через Telegram.`
2. `Вы пишете на сайте, ученик отвечает в Telegram. Время — МСК.`

Удаление применить и к tutor chat, и к admin chat.

Не заменять эти строки другими пояснениями.

## 7.2. `PageHeading`

Сейчас `PageHeading` требует обязательный `description` и всегда рендерит `<p>`.

Изменить API компонента:

```ts
description?: string
```

`<p>` должен рендериться только при непустом description.

Для страниц чата использовать только title `Чаты`.

Это не должно менять существующие description на других страницах.

## 7.3. Header выбранного диалога

В `.chat-heading` оставить только имя выбранного ученика.

Не оставлять пустой `<p>` и лишний вертикальный отступ от удалённого текста.

## 7.4. Области со scrollbar

Оформить scrollbar минимум для:

- `.chat-history`;
- `.chat-directory` или фактически скроллируемого контейнера списка диалогов.

Не добавлять горизонтальный scrollbar.

## 7.5. Визуальные требования

Scrollbar должен соответствовать текущей warm mocha теме:

- использовать существующие CSS tokens (`--surface-raised`, `--border`, `--border-strong`, `--accent`), без отдельной яркой палитры;
- ширина desktop: около `8px`;
- скругление thumb: `999px`;
- track — прозрачный или цвет поверхности;
- thumb в обычном состоянии — приглушённый;
- на hover — более контрастный, допускается `var(--accent)`;
- `scrollbar-gutter: stable` там, где это не ломает ширину layout;
- Firefox: `scrollbar-width: thin` + `scrollbar-color`;
- Chromium/WebKit: `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, `::-webkit-scrollbar-thumb`;
- touch scrolling на мобильных не ухудшать;
- сохранить `overscroll-behavior: contain` у истории.

## 7.6. Accessibility

- `.chat-history` остаётся keyboard-focusable;
- focus-visible не удалять;
- scrollbar не должен быть единственным способом понять наличие истории;
- контраст thumb должен быть заметен на dark background.

## 7.7. Acceptance criteria

- оба указанных текста отсутствуют в DOM;
- под заголовком чата нет пустой строки/лишнего отступа;
- scrollbar визуально соответствует теме;
- список диалогов и история скроллятся независимо;
- desktop и mobile не получают horizontal overflow;
- текущая автоматическая прокрутка к последнему сообщению продолжает работать.

---

# 8. TG-012-05 — исправить страницу настроек со скриншота

## 8.1. Желаемый desktop layout

При ширине, где используется двухколоночный layout:

**Левая колонка:**

1. `Ставка за час`;
2. сразу под ней `Telegram`.

**Правая колонка:**

1. `Предметы`.

Высота `Предметы` не должна влиять на вертикальное положение `Telegram`.

## 8.2. Рекомендуемая структура

Не оставлять три независимых элемента в одном grid с row auto-placement.

Рекомендуемая DOM-структура:

```text
settings-grid
├── settings-column
│   ├── rate-panel
│   └── telegram-panel
└── settings-column
    └── subjects-panel
```

У `.settings-column`:

```text
display: flex;
flex-direction: column;
gap: 24px;
min-width: 0;
```

Существующее соотношение ширин desktop `1fr 1.15fr` можно сохранить.

## 8.3. Mobile/tablet

При переходе в одну колонку зафиксировать порядок:

1. `Ставка за час`;
2. `Telegram`;
3. `Предметы`.

Стандартный вертикальный gap — тот же, что между карточками, без искусственных пустых зон.

## 8.4. Не менять функциональность

Исправление layout не должно менять:

- сохранение ставки;
- добавление/удаление предметов;
- Telegram sync;
- тексты и кнопки внутри карточек, кроме необходимых layout-правок;
- текущую цветовую тему карточек.

## 8.5. Acceptance criteria

На desktop:

- Telegram визуально расположен сразу под карточкой ставки;
- расстояние между ними примерно равно обычному grid gap (`24px`);
- высокий список предметов не создаёт пустой блок слева;
- карточка предметов остаётся справа.

На ширине `<=1100px`:

- одна колонка;
- порядок `Ставка → Telegram → Предметы`;
- horizontal overflow отсутствует.

---

# 9. TG-012-06 — расписание репетитора из `/admin/tutors`

## 9.1. Точка входа

В каждой строке активного пользователя с преподавательской ролью (`tutor` или `admin`) на `/admin/tutors` добавить действие:

`Расписание`

Рекомендуемая иконка: `CalendarDays`.

Для текущего admin:

- действие может вести на `/admin/schedule`.

Для другого преподавателя:

- вести на `/admin/schedule?tutor=<uuid>`.

Не создавать selector всех репетиторов внутри schedule toolbar.

Для `account_status != 'active'` не давать возможность открыть delegated editing в рамках этого пакета; кнопку скрыть или disabled с понятным состоянием.

## 9.2. URL contract

Основной contract:

```text
/admin/schedule
/admin/schedule?tutor=<teacher_uuid>
```

Query `tutor`:

- валидируется как UUID;
- обрабатывается только на admin route;
- target должен существовать;
- target должен быть `role in ('tutor','admin')`;
- target должен быть `account_status='active'`;
- невалидный/недоступный target не должен приводить к чтению чужих данных.

Рекомендуемое поведение для невалидного target: `notFound()` или эквивалентный безопасный 404.

Tutor/student routes не должны получать возможность передать `tutor=<other uuid>` и использовать delegated flow.

## 9.3. Заголовок чужого расписания

При просмотре другого преподавателя показать понятный контекст:

- основной title: `Расписание`;
- secondary label/description: `Расписание: <ФИО преподавателя>`;
- действие `← К репетиторам` ведёт на `/admin/tutors`.

Для собственного `/admin/schedule` сохранить обычный текущий вид без обязательной подписи выбранного преподавателя.

## 9.4. Данные выбранного преподавателя

При `ownerId = selectedTutorId` расписание должно загрузить:

- занятия только `lessons.tutor_id = ownerId`;
- offset именно выбранного преподавателя;
- `tutor_student_availability` именно выбранного преподавателя;
- назначения `student_tutor_assignments` именно выбранного преподавателя;
- список учеников только из его назначений;
- предметы только из `tutor_subjects` выбранного преподавателя и только активные предметы для нового выбора;
- assignment matrix `studentId + subjectId` только выбранного преподавателя;
- historical lesson snapshots по текущим правилам пакета 011.

Ключевое требование: формы создания/редактирования не должны использовать учеников самого администратора, если открыт календарь другого репетитора.

## 9.5. Доступные ученики и предметы

Для выбранного tutor T:

ученик S доступен в форме только если существует актуальное назначение:

```text
student_tutor_assignments.tutor_id = T
student_tutor_assignments.student_id = S
```

Предмет P доступен для пары T + S только если одновременно:

- P активен;
- P назначен tutor через `tutor_subjects`;
- существует `student_tutor_assignments(T, S, P)`.

Server-side validation обязательно повторяет эти проверки. Клиентский список не является контролем доступа.

## 9.6. Полный набор admin-операций

При открытом расписании другого активного преподавателя admin может:

- создать занятие;
- редактировать занятие;
- менять ученика в рамках доступных этому tutor назначений;
- менять доступный предмет;
- менять дату/время/длительность в рамках существующих schedule rules;
- drag & drop;
- multi-select;
- copy/paste;
- перенос занятия;
- удаление;
- изменение цвета;
- отметить проведённым / снять отметку;
- менять `student availability` выбранного преподавателя;
- использовать Undo/Redo;
- работать с текущей/следующей неделей по тем же правилам, что владелец;
- видеть и редактировать private note занятия.

Все ограничения magnet, overlaps, inactive/coral rules, transfer rules, current-week rules и rollover сохраняются.

## 9.7. Что admin не может менять

В чужом расписании admin **не меняет персональный `msk_offset_hours` преподавателя**.

UI:

- selector `Сдвиг МСК` показывается с текущим offset выбранного tutor, чтобы календарь отображался правильно;
- selector disabled при delegated view;
- желательно добавить tooltip/title: `Сдвиг задаёт репетитор в своём расписании.`

Server:

- delegated `kind='offset'` должен возвращать `42501`/безопасную ошибку даже при ручной подмене запроса;
- Undo/Redo не должен позволять применить чужой snapshot с `offsetChanged=true`.

Собственный admin `/admin/schedule` продолжает позволять администратору менять **свой** offset.

## 9.8. Приватные заметки

Новое продуктовое правило пакета 012:

- owner tutor/admin видит и редактирует свои lesson notes;
- admin, открывший delegated schedule выбранного tutor, также видит и редактирует notes этого tutor;
- student не видит notes;
- другой обычный tutor не видит notes;
- отсутствие UI-доступа не заменяет DB/server permission check.

Текущий `getLessonNoteAction()` с `.eq("tutor_id", user.id)` нужно заменить на target-aware flow.

Предпочтительный вариант — защищённый SECURITY DEFINER RPC для чтения заметки с явной проверкой actor + owner, а не использование service key в обычном action.

## 9.9. Требования к server API

Нельзя решать delegated editing подменой JWT/`request.jwt.claim.sub` на ID выбранного tutor.

Нельзя доверять `ownerId`, пришедшему из браузера.

Каждая операция должна проверять:

```text
actor = auth.uid()
owner = requested target
```

Разрешение:

```text
actor == owner AND actor is active teacher
OR
actor is active admin AND owner is active teacher
```

Для delegated режима дополнительно:

```text
command.kind != 'offset'
```

## 9.10. Рекомендуемый DB contract пакета 012

Создать единый helper определения владельца, например:

```text
private.schedule_require_owner(p_owner uuid)
```

который:

- проверяет active actor;
- проверяет target;
- разрешает self-owner teacher;
- разрешает admin → other teacher;
- запрещает tutor → other tutor;
- возвращает проверенный `owner_id`.

Schedule mutation engine должен быть рефакторен так, чтобы **внутренне принимать owner_id явно**, а не вычислять `auth.uid()`.

Например концептуально:

```text
public.schedule_command(p_owner uuid, p_command jsonb)
    -> private.schedule_command_for_owner(actor_id, owner_id, p_command)
```

Имена могут отличаться, но security contract обязателен.

Старый public signature можно сохранить wrapper-ом для совместимости self-flow, если это упрощает миграцию:

```text
public.schedule_command(p_command jsonb)
    -> owner = auth.uid()
```

а admin page использует новый target-aware RPC.

## 9.11. Внутренние schedule helpers

Все места, где сейчас `auth.uid()` используется как owner календаря, должны работать с проверенным `owner_id`:

- rollover выбранного tutor;
- `schedule_week`;
- `schedule_local_date`;
- `snap_lesson_start`;
- `resolve_nearest_lesson_start`;
- lesson owner checks;
- subject/assignment checks;
- availability;
- signed snapshots;
- restore scope;
- transfer/paste/move;
- final canonical lesson list;
- notes;
- offset чтение.

Не менять математические правила расписания — меняется только identity владельца операции.

## 9.12. Signed Undo/Redo

Signed snapshot должен содержать owner выбранного tutor, как и сейчас содержит поле `owner`.

При restore обязательно проверить:

- actor всё ещё имеет admin permission;
- owner из URL/action совпадает с owner snapshot;
- expected и target snapshot относятся к одному owner;
- snapshot другого tutor нельзя replay в текущий календарь;
- delegated restore с `offsetChanged=true` запрещён.

История остаётся page-memory scoped.

При переключении target tutor / уходе со страницы история Undo/Redo не переносится между преподавателями.

## 9.13. Incremental sync

`syncScheduleAction` / `readScheduleUpdates` должны принимать/использовать owner выбранного расписания.

При delegated view polling должен:

- выполнять rollover для выбранного owner при необходимости;
- получать только `lessons.tutor_id = owner`;
- получать availability выбранного owner;
- получать offset выбранного owner;
- не смешивать изменения admin-собственного расписания с выбранным tutor.

Client должен передавать owner context при sync, но сервер обязан заново его авторизовать.

## 9.14. RLS и прямые записи

Сохранить запрет прямых authenticated writes в `lessons` и `lesson_private_notes`.

Admin delegated editing выполняется через проверенные RPC, а не через расширение client-side table mutation.

Чтение чужого расписания admin допускается только в соответствии с существующей административной моделью и новым target-aware query flow.

Для `user_schedule_preferences` и `tutor_student_availability`, которые сейчас owner-only по RLS, не открывать широкую запись admin на таблицы. Если нужны данные чужого owner, использовать защищённые RPC/SECURITY DEFINER query contracts с явной admin-проверкой.

## 9.15. Immutable tutor

Нельзя менять `lessons.tutor_id` существующего занятия на другого tutor.

Admin редактирует занятие **внутри календаря выбранного owner**, но не переносит саму запись между преподавателями.

Если нужно занятие другого tutor — создать его отдельно в его календаре.

## 9.16. Acceptance criteria

- в `/admin/tutors` у активного tutor есть действие `Расписание`;
- клик открывает `/admin/schedule?tutor=<id>`;
- отображается ФИО выбранного tutor;
- расписание содержит только занятия выбранного tutor;
- в форме видны только ученики выбранного tutor;
- предметы зависят от назначения выбранного tutor + student;
- admin может выполнить весь CRUD и календарные операции из п. 9.6;
- admin может прочитать и изменить private note;
- admin не может изменить offset чужого tutor;
- обычный tutor не может подменить owner id и изменить чужой календарь;
- admin не может через один target action изменить lesson другого owner;
- Undo/Redo не работает между разными owner;
- incremental sync не смешивает расписания;
- собственный admin schedule продолжает работать без regression.

---

# 10. Изменения типов и client state

## 10.1. `ScheduleData`

Расширить DTO так, чтобы client явно понимал контекст календаря. Рекомендуемые поля:

```ts
interface ScheduleData {
  // existing fields...
  ownerId?: string;
  ownerName?: string;
  canEdit?: boolean;
  canEditOffset?: boolean;
  delegated?: boolean;
}
```

Для student `canEdit=false`.

Для tutor self:

```text
canEdit=true
canEditOffset=true
delegated=false
```

Для admin self:

```text
canEdit=true
canEditOffset=true
delegated=false
```

Для admin → selected tutor:

```text
canEdit=true
canEditOffset=false
delegated=true
```

Не вычислять право редактирования только как `data.role !== 'student'`.

## 10.2. Calendar

`ScheduleCalendar` должен:

- использовать `ownerId` во всех mutation/sync calls;
- очищать локальную undo/redo/selection/clipboard state при смене owner;
- использовать `canEdit` для CRUD;
- использовать `canEditOffset` для selector МСК;
- продолжать строить optimistic lesson с `tutorId = ownerId`;
- не брать случайный `lessons[0]?.tutorId` как основной fallback при наличии ownerId.

## 10.3. URL navigation

Текущая логика week/day использует `URLSearchParams(params.toString())`.

Сохранить `tutor=<uuid>` при:

- переходе по неделям;
- переходе по дням;
- History API push/replace.

Не удалять target query при calendar navigation.

---

# 11. Новая миграция БД

Создать новую миграцию, ориентировочное имя:

`supabase/migrations/202609060012_admin_chat_schedule_fixes.sql`

Исторические миграции 001–011 не редактировать.

Миграция должна быть атомарной (`begin/commit`) и сохранять текущую advisory-lock стратегию schedule domain.

Минимальный состав миграции:

### Chat

- teacher role = `tutor | admin` в `chat_pair_active`;
- teacher actor helper для chat RPC;
- обновлённые chat RPC с admin-self поддержкой;
- bot tutor picker включает назначенного admin;
- notification target возвращает chat ID + system role;
- grants/revokes после `create or replace` проверить заново.

### Schedule

- новый actor/owner authorization helper;
- target-aware schedule command contract;
- refactor owner-dependent private mutation engine;
- target-aware read contracts для offset/availability/notes, если RLS не позволяет безопасно прочитать их обычным client;
- admin note access по выбранному owner;
- server-side запрет delegated offset;
- защита signed snapshots от cross-owner replay;
- сохранение immutable tutor и всех exclusion constraints.

После миграции `anon` не должен получить новых прав.

---

# 12. Изменения Telegram webhook/server layer

Проверить и обновить:

- `src/app/api/telegram/webhook/route.ts`;
- `src/features/chats/bot-handler.ts`;
- `src/lib/telegram/templates.ts`;
- `src/features/chats/actions.ts`.

Требования:

- `BotPorts.notificationTarget` больше не строка, а объект с role;
- `tutorMessage` получает tutor identity для reply callback;
- `chat:cancel` отправляет visible response;
- `chat:to:<id>` работает и для admin-teacher;
- callback всегда answer-ится;
- service key остаётся только server-only;
- Telegram user/chat IDs не попадают в browser DTO;
- dedupe `telegram_update_id` сохраняется.

---

# 13. UI-файлы, которые ожидаемо будут затронуты

Перечень не является запретом на рефакторинг, но эти места необходимо проверить:

### Chats

- `src/app/tutor/chats/page.tsx`;
- новый `src/app/admin/chats/page.tsx`;
- `src/components/chats/chat-view.tsx`;
- `src/components/layout/navigation.tsx`;
- `src/components/shared/page-heading.tsx`;
- `src/app/globals.css`.

### Telegram

- `src/features/chats/actions.ts`;
- `src/features/chats/bot-handler.ts`;
- `src/lib/telegram/templates.ts`;
- `src/app/api/telegram/webhook/route.ts`.

### Settings

- `src/features/settings/page.tsx`;
- `src/app/globals.css`.

### Admin tutors / schedule

- `src/features/people/page.tsx`;
- при необходимости `src/components/people/*`;
- `src/features/schedule/page.tsx`;
- `src/features/schedule/queries.ts`;
- `src/features/schedule/actions.ts`;
- `src/features/schedule/service.ts`;
- `src/features/schedule/types.ts`;
- `src/components/schedule/calendar.tsx`;
- `src/components/schedule/toolbar.tsx`;
- `src/components/schedule/lesson-dialog.tsx`;
- новая миграция 012.

---

# 14. Обязательные тесты

Старые тесты, которые намеренно закрепляют отменяемое поведение пакета 011, должны быть обновлены. Нельзя оставлять тесты `admin excluded from picker`, `silent cancel` и `notification has no reply action` как ожидаемое состояние.

## 14.1. Unit — Telegram templates/handler

Добавить проверки:

1. `tutorMessage` содержит `↩️ Ответить`;
2. callback содержит правильный tutor UUID;
3. для long message кнопка находится на последней части;
4. `chat:cancel` очищает recipient;
5. `chat:cancel` отправляет `✅ Действие отменено.`;
6. после cancel есть student main keyboard;
7. `chat:to:<adminId>` успешно выбирает admin, если он есть в `ports.tutors`;
8. недоступный `chat:to` не оставляет stale recipient;
9. native Reply продолжает передавать `replyId` в atomic resolver;
10. duplicate Telegram update не создаёт notification повторно.

## 14.2. DB — chats

Расширить `tests/chat-database.test.ts`:

- назначенный admin присутствует в `chat_bot_tutors`;
- admin может быть `tutor_id` conversation;
- admin может `chat_send` своему ученику;
- admin unread считается корректно;
- admin может mark-read только свой conversation;
- admin не может читать conversation другого tutor только из-за роли admin;
- tutor не может читать conversation admin;
- student видит сообщения admin в своей паре;
- снятие последнего assignment блокирует admin pair так же, как tutor pair;
- `chat_notification_target` корректно сообщает role `admin`/`tutor`;
- private Telegram tables остаются закрыты для authenticated.

## 14.3. Unit/source contract — web chats

Проверить:

- admin nav содержит `Чаты`;
- unread polling разрешён admin;
- существуют `/tutor/chats` и `/admin/chats`;
- оба удаляемых текста отсутствуют;
- PageHeading не рендерит пустой description;
- CSS содержит themed scrollbar rules для двух chat scroll areas.

## 14.4. DB — delegated schedule

Добавить отдельный набор регрессий:

1. tutor A не может передать owner B;
2. student не может передать teacher owner;
3. admin может target active tutor B;
4. admin может target другого active admin, если тот выступает teacher;
5. invalid UUID/несуществующий/не-teacher target закрывается;
6. create создаёт `lessons.tutor_id = target`, а не admin;
7. edit не меняет `tutor_id`;
8. student должен принадлежать assignments target tutor;
9. subject должен принадлежать target tutor и assignment пары;
10. move работает внутри target;
11. paste работает внутри target;
12. transfer работает внутри target;
13. color/completed работают внутри target;
14. delete работает внутри target;
15. availability меняется у target tutor;
16. admin может read/write private note target lesson;
17. обычный tutor не может читать чужую note;
18. student не может читать note;
19. delegated offset command запрещён;
20. self-admin offset по-прежнему разрешён;
21. signed snapshot owner mismatch отклоняется;
22. restore с delegated `offsetChanged=true` отклоняется;
23. Undo/Redo применяет только target owner data;
24. sync selected tutor не возвращает занятия admin/self или другого tutor;
25. rollover вызывается для target owner, а не actor;
26. overlap constraints tutor/student продолжают работать;
27. account_status checks продолжают fail closed.

## 14.5. E2E

Добавить локальные fixture E2E без внешнего Telegram API:

### Admin → tutor schedule

1. войти admin;
2. открыть `Репетиторы`;
3. нажать `Расписание` у tutor;
4. проверить URL с `tutor=<uuid>`;
5. проверить ФИО target;
6. открыть создание занятия;
7. убедиться, что в учениках нет ученика, не назначенного target tutor;
8. создать занятие;
9. отредактировать время/предмет/note;
10. выполнить хотя бы одну календарную mutation (например drag или completed);
11. проверить, что offset selector disabled;
12. вернуться к `Репетиторам`.

### Admin chat

1. у admin есть назначенный student;
2. открыть `/admin/chats`;
3. увидеть этого student;
4. не увидеть student другого tutor;
5. отправить сообщение через mocked delivery;
6. проверить отображение сообщения и delivery status.

### Settings layout

На desktop viewport проверить bounding boxes:

- `Telegram.top > Rate.bottom`;
- разница соответствует обычному gap и не зависит от высоты Subjects;
- `Subjects.left > Rate.left`;
- пустого вертикального блока как на исходном скриншоте нет.

На tablet/mobile проверить порядок `Rate → Telegram → Subjects`.

---

# 15. Документация

После реализации обновить текущую документацию проекта так, чтобы она не противоречила пакету 012.

Обязательно проверить:

- `AGENTS.md`;
- `README.md`;
- `docs/architecture.md`;
- `docs/database.md`;
- `docs/auth-and-telegram.md`;
- `docs/verification.md`;
- `docs/decisions.md`;
- `docs/known-issues.md`.

В `AGENTS.md` удалить/заменить старое правило:

`Admin не пишет чужой календарь.`

Новое правило должно отражать:

> Admin может редактировать расписание другого активного teacher только через target-aware delegated RPC с повторной DB-проверкой actor/owner. Прямые записи в schedule tables и подмена identity запрещены.

Также обновить ссылку `Текущее ТЗ` на пакет 012.

Сам файл пакета 011 считать историческим описанием уже реализованного состояния; его требования, конфликтующие с 012, считаются superseded новым ТЗ.

---

# 16. Требования безопасности

Обязательные инварианты после пакета 012:

1. `service_role` не используется из browser/client code.
2. Telegram user/chat IDs не возвращаются в chat UI.
3. Admin-chat permissions не превращаются в глобальный доступ ко всем перепискам.
4. Chat pair всегда требует существующего assignment.
5. Admin schedule target повторно проверяется на сервере и в БД.
6. Обычный tutor не может редактировать чужой календарь подменой query/action payload.
7. Нельзя подменять `auth.uid()`/JWT claim на target tutor для выполнения delegated операции.
8. Прямые authenticated writes в `lessons` / `lesson_private_notes` не открывать.
9. `lessons.tutor_id` остаётся immutable для существующей записи.
10. Admin private-note access действует только как явно разрешённое административное право; student и другие tutor остаются исключены.
11. Signed history нельзя replay между разными owner.
12. Все существующие exclusion constraints, assignment checks и account-status checks сохраняются.
13. Telegram update dedupe и reply mapping сохраняются.

---

# 17. Что не входит в пакет

Не добавлять без отдельного ТЗ:

- вложения/файлы/голосовые сообщения в chat;
- групповые чаты;
- chat admin-audit чужих преподавательских диалогов;
- удаление/редактирование уже отправленных chat messages;
- изменение чужого tutor `msk_offset_hours` администратором;
- перенос существующего lesson с одного tutor на другого через изменение `tutor_id`;
- отдельный selector репетитора в toolbar расписания;
- изменение общей visual theme проекта;
- изменение лимита 4000 символов.

---

# 18. Definition of Done

Пакет считается завершённым, если одновременно выполнено следующее:

- все acceptance criteria TG-012-01…06 выполнены;
- добавлена новая миграция 012, исторические миграции не переписаны;
- admin chat работает end-to-end от Telegram student до `/admin/chats` и обратно;
- `Отмена` имеет видимое подтверждение;
- `Ответить` запускает ввод сообщения внутри Telegram bot;
- на settings исправлен layout со скриншота;
- admin открывает чужое расписание из `Репетиторы` и редактирует его в рамках target assignments;
- admin может редактировать target lesson notes;
- delegated offset запрещён;
- security regressions покрыты тестами;
- старые тесты пакета 011, закрепляющие отменённое поведение, обновлены;
- документация приведена в соответствие с новым contract;
- проходят команды проекта:

```bash
npm run lint
npm run typecheck
npm test
npm run test:docs
npm run build
npm run test:e2e
```

Нельзя считать пакет завершённым, если хотя бы одна из этих команд не запускалась или завершилась ошибкой.

---

# 19. Краткая матрица прав после пакета 012

| Действие | Student | Tutor | Admin |
|---|---:|---:|---:|
| Смотреть своё расписание | Да | Да | Да |
| Редактировать своё расписание | Нет | Да | Да |
| Смотреть чужое расписание tutor | Нет | Нет | Да, через `/admin/tutors` |
| Редактировать чужое расписание tutor | Нет | Нет | Да, delegated flow |
| Менять offset чужого tutor | Нет | Нет | **Нет** |
| Читать private note своего lesson | Нет | Да | Да |
| Читать/edit private note чужого tutor | Нет | Нет | Да, в delegated schedule |
| Иметь преподавательский веб-чат | Нет | Да | Да |
| Смотреть чужие chat conversations | Нет | Нет | **Нет** |
| Писать преподавателю через Telegram | Да | — | — |
| Быть выбранным учеником как преподаватель | — | Да | Да, если назначен |

---

# 20. Основной пользовательский сценарий после реализации

1. Администратор назначен ученику по предмету так же, как обычный репетитор.
2. У ученика в Telegram `💬 Написать репетитору` показывает этого администратора.
3. Ученик пишет сообщение.
4. Администратор получает уведомление `Новое сообщение от ученика` с кнопкой `💬 Открыть чат` → `/admin/chats?student=...`.
5. Администратор отвечает на сайте.
6. Ученик получает Telegram-сообщение с кнопкой `↩️ Ответить`.
7. Ученик нажимает её, бот показывает `Вы пишете: <ФИО>` и `✕ Отмена`.
8. Если ученик нажимает `✕ Отмена`, выбранный получатель очищается, появляется `✅ Действие отменено.` и главное меню.
9. Если ученик отправляет текст, он появляется в собственном чате администратора.
10. Отдельно администратор открывает `/admin/tutors`, нажимает `Расписание` у нужного преподавателя и редактирует его календарь, используя только назначения этого преподавателя; offset преподавателя остаётся только для чтения.
