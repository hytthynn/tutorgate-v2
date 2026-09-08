# ТЗ: TutorGate — пакет 014

**Дата фиксации:** 07.09.2026  
**Статус:** согласовано по уточнениям заказчика, готово к разработке  
**База проекта:** TutorGate v2, Next.js 16.3.4 / React 19.2.8 / Supabase/PostgreSQL, миграции 001–013  
**Новая миграция:** `supabase/migrations/202609070014_product_polish_chat_files_hard_delete_performance.sql`

---

## 1. Цель пакета

Пакет 014 должен закрыть 12 продуктовых изменений:

1. у перенесённого занятия автоматически показывать синий статусный цвет, у проведённого — зелёный;
2. добавить в расписание понятную легенду цветов;
3. выровнять общие выпадающие списки по центру под полем выбора;
4. добавить в чат передачу файлов и изображений до 10 МБ в обе стороны, включая drag&drop на сайте;
5. заменить текущее обезличивание аккаунта на полное удаление аккаунта и связанных данных;
6. убрать точку из текстового логотипа `TutorGate.`;
7. запретить перемещение красных (`coral`) занятий;
8. убрать автоматическое переключение на соседнюю неделю при drag занятия к краю календаря;
9. добавить форматирование текста в веб-чате с корректной передачей форматирования в Telegram;
10. улучшить сообщения и навигацию Telegram-бота, добавить администратору управление заявками из бота;
11. добавить на сайт кнопку поддержки, ведущую в Telegram `@tutorgate`;
12. ускорить взаимодействие приложения с БД без ослабления RLS, owner-checks и инвариантов расписания.

Пакет должен быть реализован поверх текущих контрактов 008–013. Исторические миграции **не редактировать**.

---

## 2. Зафиксированные решения заказчика

Эти решения считаются частью ТЗ и не требуют дополнительной трактовки при разработке.

### 2.1. Цвета занятий

- Синий и зелёный — **автоматические визуальные статусы**, а не уничтожение ручного цвета занятия.
- Существующий ручной выбор цветов сохранить.
- После снятия отметки «Проведено» занятие возвращается к своему предыдущему визуальному состоянию:
  - если это перенесённый target — снова синее;
  - иначе — его сохранённый ручной цвет.
- При снятии transfer marker занятие возвращается к сохранённому ручному цвету.

### 2.2. Красные занятия

Для занятия с базовым `color='coral'` запрещено **любое изменение даты или времени**:

- drag&drop;
- групповый move;
- `Перенести…`;
- изменение даты в редакторе;
- изменение времени;
- изменение длительности, так как оно меняет временной интервал.

Разрешены действия, не меняющие временной интервал: отметить проведённым/снять отметку, изменить заметку, удалить, изменить основной цвет, а также иные нетемпоральные поля при условии, что сервер не сдвигает занятие магнитом.

### 2.3. Вложения в чате

- Максимум **10 МБ на один файл**.
- Вложения работают в обе стороны:
  - сайт преподавателя/admin → Telegram ученика;
  - Telegram ученика → веб-чат преподавателя/admin.
- На сайте обязательны:
  - кнопка выбора файлов;
  - drag&drop файлов в composer;
  - предпросмотр изображений;
  - безопасное скачивание остальных файлов.

### 2.4. Полное удаление аккаунта

- Удаление доступно **только администратору**.
- Самостоятельной кнопки удаления у student/tutor не добавлять.
- Admin-аккаунты через этот flow не удаляются; сохраняется существующая защита от удаления администратора/самоудаления.
- При подтверждённом удалении удаляются не только персональные поля, но и связанные данные пользователя, включая:
  - занятия и приватные заметки;
  - статистику, производную от этих занятий;
  - назначения/предметные связи;
  - расписательные настройки/availability/rollover state;
  - переписку;
  - вложения и объекты Storage;
  - Telegram chat state/mappings/control state;
  - auth alias, sessions, reset tokens;
  - связанная регистрационная/заявочная персональная история, если она однозначно относится к удаляемому аккаунту;
  - запись `public.profiles`;
  - запись Supabase Auth `auth.users` через Admin API.

### 2.5. Форматирование чата

Поддержать:

- **жирный**;
- *курсив*;
- подчёркивание;
- зачёркивание;
- цитату;
- моноширинный текст;
- ссылки.

Форматирование должно корректно отображаться на сайте и сериализоваться в поддерживаемую Telegram-разметку.

### 2.6. Telegram-бот

В рамках пакета «удобное управление» означает:

- единое понятное главное меню;
- кнопки `Назад`, `Главное меню`, `Отмена` там, где применимо;
- быстрые переходы к основным разделам TutorGate;
- для администратора — просмотр очереди заявок и действия `Принять` / `Отклонить`; для уже принятой заявки при допустимом статусе — `Отправить новую ссылку`;
- операции удаления/блокировки аккаунтов остаются **только на сайте**, чтобы не расширять destructive surface Telegram-бота.

---

## 3. Результаты изучения текущего проекта

### 3.1. Расписание

Ключевые файлы:

- `src/components/schedule/calendar.tsx`;
- `src/components/schedule/context-menu.tsx`;
- `src/components/schedule/lesson-dialog.tsx`;
- `src/components/schedule/operation-dialog.tsx`;
- `src/components/schedule/toolbar.tsx`;
- `src/features/schedule/operations.ts`;
- `src/features/schedule/validation.ts`;
- `src/features/schedule/actions.ts`;
- `src/features/schedule/service.ts`;
- `src/features/schedule/queries.ts`;
- `src/features/schedule/types.ts`;
- миграции 005–012.

Текущее состояние:

- `LessonColor = default | green | coral | gray | blue`;
- `coral` является отдельным conflict class;
- `inactiveReason='transferred'` относится к source старого занятия;
- перенесённый target помечается `isTransferTarget=true` и сейчас сохраняет исходный `color`, а UI добавляет только синюю левую рамку;
- `completed` сейчас визуально даёт check icon и ослабленный фон, но не принудительно зелёный цвет;
- `pointerMove()` позволяет drag для активного `coral`;
- `watchEdge()` запускает таймер и вызывает `navigate()` на предыдущую/следующую неделю при приближении курсора к краю;
- серверные команды `move`, `transfer`, `edit` не имеют нового запрета времени для `coral`.

### 3.2. Выпадающие списки

Общий компонент — `src/components/ui/select.tsx`; `Combobox` является обёрткой над ним.

Сейчас popup получает `left`, основанный на левом крае trigger. Поэтому изменение должно быть сделано **один раз в общем Select**, а не отдельно на каждой форме.

### 3.3. Чат

Ключевые файлы:

- `src/components/chats/chat-view.tsx`;
- `src/features/chats/actions.ts`;
- `src/features/chats/types.ts`;
- `src/features/chats/bot-handler.ts`;
- `src/lib/telegram/templates.ts`;
- `src/lib/telegram/bot.ts`;
- `src/app/api/telegram/webhook/route.ts`;
- миграции 011–013.

Сейчас:

- `public.chat_messages.body` обязателен и содержит только plain text;
- лимит текста — 4000 символов;
- таблицы вложений нет;
- веб composer — обычный `textarea`;
- сообщение без `text` в Telegram классифицируется как unsupported attachment;
- webhook schema не принимает `document`, `photo`, `caption`, `entities`, `caption_entities`;
- доставка tutor → student использует только `sendMessage`;
- persistent bot control message уже реализован пакетом 013 и должен быть переиспользован.

### 3.4. Удаление аккаунта

Текущий flow:

- `src/features/admin/user-actions.ts` вызывает `admin_soft_delete_user`;
- миграция 010 переводит профиль в `account_status='deleted'`, очищает часть PII и банит Auth user;
- `auth.users` физически не удаляется;
- занятия, статистика, переписка и другие исторические данные сохраняются.

Это прямо противоречит новому требованию и должно быть заменено hard-delete flow.

### 3.5. Логотип

`src/components/shared/brand.tsx` содержит отдельный:

```tsx
<span className="brand-dot">.</span>
```

`src/app/icon.svg` точки не содержит. Требуется убрать только текстовую точку и больше не поддерживать `.brand-dot` в CSS.

### 3.6. Производительность БД

Найдены конкретные точки роста стоимости запросов:

1. `getSchedule()` вызывает `readLessons(null, null, ...)`, то есть при открытии одной недели читает **всю историю занятий** tutor/student.
2. Имена занятий затем догружаются отдельным `schedule_lesson_names` RPC батчами.
3. Назначения, tutor subjects и visible profiles читаются отдельными последовательными paging loops; visible profiles сначала загружаются шире необходимого и затем фильтруются в Node.
4. `PeoplePage` получает все профили, все assignments и все tutorSubjects, после чего фильтрует их в приложении.
5. Веб-чат каждые 5 секунд вызывает `chat_snapshot`, который заново формирует directory и возвращает до 200 сообщений выбранного диалога даже при отсутствии новых сообщений.
6. Навигационный unread badge отдельно делает 5-секундный polling.

Пункт 12 должен в первую очередь уменьшить объём данных и число round trips; простое добавление индексов без изменения этих запросов недостаточно.

---

# 4. TG-014-01 — автоматические статусные цвета расписания

## 4.1. Модель цвета

Не переиспользовать DB-поле `lessons.color` как временный статус. Оно остаётся **базовым/ручным цветом** и продолжает участвовать в conflict rules (`coral` vs normal).

Ввести единое вычисление effective visual color на клиенте, например:

```ts
type EffectiveLessonColor = LessonColor;

function effectiveLessonColor(lesson: ScheduleLesson): EffectiveLessonColor {
  if (lesson.inactiveReason != null) return "gray";
  if (lesson.completed) return "green";
  if (lesson.isTransferTarget) return "blue";
  return lesson.color;
}
```

Зафиксировать приоритет:

1. inactive → серый/штриховка;
2. completed → зелёный;
3. transfer target → синий;
4. иначе базовый `lesson.color`.

Таким образом, перенесённый target после отметки «Проведено» становится зелёным, а после снятия отметки снова синим.

## 4.2. Что не менять

- `color='coral'` остаётся специальным conflict class на сервере;
- transfer target не должен автоматически записывать `color='blue'` в БД;
- completed не должен автоматически записывать `color='green'` в БД;
- существующие ручные `green`, `blue`, `gray` сохраняются;
- `isTransferTarget`, стрелка `↪` и completed check icon сохраняются как дополнительные признаки, чтобы статус не определялся только цветом.

## 4.3. Ручное изменение цвета при активном статусе

Палитра продолжает менять **базовый** `lesson.color`.

Если занятие сейчас completed/transfer target, новый базовый цвет сохраняется, но effective color остаётся статусным. После снятия статуса показывается последний сохранённый базовый цвет.

## 4.4. Acceptance criteria

- [ ] Обычное перенесённое target-занятие сразу визуально синее.
- [ ] После `Отметить проведённым` любое активное занятие визуально зелёное.
- [ ] Снять completed с transfer target → снова синее.
- [ ] Снять completed с обычного занятия → его предыдущий ручной цвет.
- [ ] Source с `inactiveReason='transferred'` остаётся серым/штрихованным, а не синим.
- [ ] DB `color` не меняется автоматически из-за transfer/completed.
- [ ] Coral conflict semantics не ломаются.

---

# 5. TG-014-02 — легенда цветов в расписании

## 5.1. Кнопка

В `ScheduleToolbar` добавить кнопку с понятной подписью/иконкой:

`Обозначения`

На компактном mobile допускается иконка с доступным `aria-label="Обозначения цветов"`.

## 5.2. Содержимое

Открывать небольшой Dialog/Popover в общей дизайн-системе TutorGate.

Раздел **Статусы**:

- зелёный — `Проведено`;
- синий — `Перенесённое занятие`;
- серый со штриховкой — `Неактивное / исходное перенесённое / недоступно до даты`;
- стрелка `↪` — target переноса;
- check icon — проведено.

Раздел **Основные цвета**:

- стандартный — обычное занятие;
- coral/красный — специальное занятие, которое нельзя менять по дате/времени;
- зелёный, синий, серый — также могут быть сохранены вручную как основной цвет; при наличии автоматического статуса статус имеет визуальный приоритет.

При необходимости коротко объяснить coral overlap rule без технических терминов, например:

> Красные занятия относятся к отдельной группе пересечений и не перемещаются после создания.

## 5.3. Accessibility

- легенда должна открываться клавиатурой;
- цвет всегда сопровождается текстом/иконкой;
- нельзя использовать только цвет как единственный источник статуса.

## 5.4. Acceptance criteria

- [ ] Кнопка доступна в расписании student/tutor/admin.
- [ ] У student это только справка, без действий редактирования.
- [ ] Все фактические состояния календаря описаны в легенде.
- [ ] Легенда не меняет schedule state и URL.

---

# 6. TG-014-03 — позиционирование всех Select/Combobox

## 6.1. Scope

Изменить общий `src/components/ui/select.tsx`. Автоматически применить к:

- Schedule toolbar;
- LessonDialog;
- OperationDialog;
- admin forms;
- application form;
- directory filters;
- statistics filters;
- всем `Combobox`, так как он использует тот же Select.

Context menu и action menu не считаются Select/Combobox и остаются привязаны к курсору/кнопке по своим правилам.

## 6.2. Позиция

Нормальное положение popup:

- верхняя центральная точка popup совпадает с нижней центральной точкой trigger;
- gap 4–6 px;
- ширина не меньше ширины trigger и не меньше текущего UX-minimum;
- popup не выходит за горизонтальные границы viewport.

Расчёт horizontal position:

```ts
left = trigger.left + trigger.width / 2 - popupWidth / 2;
left = clamp(left, 12, viewportWidth - popupWidth - 12);
```

Вертикально список открывается **снизу**. Только если физически доступного пространства меньше минимально пригодной высоты (ориентир 120–160 px), допускается fallback вверх; horizontal center при fallback сохраняется.

## 6.3. Acceptance criteria

- [ ] На desktop список визуально центрирован относительно поля.
- [ ] На mobile список не выходит за экран.
- [ ] Поведение одинаково внутри Dialog и обычной страницы.
- [ ] Searchable Select сохраняет autofocus/search/navigation.
- [ ] Resize/scroll пересчитывают позицию.
- [ ] Нет возврата к native `<select>`.

---

# 7. TG-014-04 — файлы и изображения в чате до 10 МБ

## 7.1. Общий функциональный контракт

Одно сообщение чата может содержать:

- только текст;
- только один или несколько attachment;
- текст + attachment(s).

Максимум одного attachment: **10 * 1024 * 1024 bytes**.

Рекомендуемый лимит количества файлов в одном сообщении: **до 10**. Если продуктово нужен иной лимит, менять только константу, но не 10 МБ на файл.

## 7.2. Новая модель данных

Добавить `public.chat_attachments`, пример обязательных полей:

```sql
id uuid primary key,
message_id uuid not null references public.chat_messages(id) on delete cascade,
storage_path text not null unique,
original_name text not null,
mime_type text not null,
size_bytes bigint not null check (size_bytes between 1 and 10485760),
kind text not null check (kind in ('image','file')),
created_at timestamptz not null default now()
```

Не хранить Telegram file ID, numeric Telegram message ID или signed URL в публичном DTO.

Если Telegram `file_id` нужен для технической доставки/retry, хранить его только в `private.*` таблице.

`chat_messages.body` изменить так, чтобы сообщение могло существовать без текста **только при наличии attachment**. Проверку «text или attachment обязателен» выполнять внутри единого RPC вставки/финализации.

## 7.3. Storage

Создать приватный bucket, например `chat-attachments`.

Требования:

- bucket не public;
- object path генерируется сервером и не содержит ФИО, username, имени ученика или исходного имени файла;
- пример path: `<conversation_uuid>/<message_uuid>/<attachment_uuid>`;
- оригинальное имя хранится только в metadata БД;
- скачивание доступно только участнику активной chat pair согласно текущим правилам;
- URL короткоживущий signed URL либо защищённая server-side выдача;
- browser никогда не получает service key.

## 7.4. Загрузка с сайта

Из-за 10 МБ не передавать бинарник через обычный текущий text Server Action.

Предпочтительный flow без выдачи Supabase auth session браузеру:

1. browser запрашивает через Server Action разрешение на upload для выбранного student;
2. action делает `requireRole([tutor,admin])`, проверяет active assignment/chat pair, имя, claimed size, количество файлов;
3. server-only Supabase client создаёт одноразовый signed upload URL/token в private bucket;
4. browser загружает файл напрямую в Storage по signed upload token;
5. finalize Action повторно проверяет pair и **реальный** объект в Storage: размер, существование, metadata;
6. одной DB-операцией создаются `chat_message` + `chat_attachments` и ставится delivery status;
7. после commit выполняется Telegram delivery;
8. abandoned upload, не прошедший finalize, должен очищаться по TTL/maintenance job и не становиться видимым в чате.

Нельзя доверять только `File.size` клиента.

## 7.5. Drag&drop на сайте

`ChatView`/composer:

- добавить drop zone на composer;
- `dragenter/dragover` показывает визуальную рамку/подсказку `Перетащите файлы сюда`;
- `drop` не открывает файл в браузере;
- dropped файлы добавляются в тот же draft attachment queue, что и input button;
- добавить обычную кнопку `Прикрепить файл` для keyboard/mobile;
- до отправки файл можно удалить из draft;
- ошибки показываются по конкретному файлу.

## 7.6. UI вложений

Для image (`image/jpeg`, `image/png`, `image/webp`, при необходимости safe GIF):

- миниатюра;
- имя;
- размер;
- открыть/скачать.

SVG/HTML и прочий active content не показывать inline как изображение даже при соответствующем имени; отдавать как attachment/download с `nosniff`.

Для остальных файлов:

- file icon;
- оригинальное имя;
- размер;
- кнопка скачать.

Имена выводить как text, не HTML.

## 7.7. Telegram: сайт → ученик

Расширить `src/lib/telegram/bot.ts`:

- `sendPhoto` для безопасных изображений;
- `sendDocument` для остальных файлов;
- multipart upload либо server-side fetch приватного объекта с последующей отправкой Telegram;
- timeout/error handling аналогично текущему `sendMessage`.

Если сообщение содержит текст + файлы:

- форматированный текст может быть caption, если помещается в лимит Telegram caption и соответствует одному media;
- иначе текст отправляется отдельным сообщением, затем файлы;
- все Telegram message IDs, относящиеся к одному chat message, должны быть записаны в reply mapping, чтобы Telegram Reply на любую часть сообщения нашёл исходную пару student+tutor.

`chat_finish_delivery` расширить с одного `telegram_message_id` до массива/набора успешно созданных IDs.

Успех delivery сообщения считается полным только если доставлены все части. При частичном внешнем успехе не делать автоматический повтор уже отправленных частей без отдельной идемпотентной модели; UI должен показывать корректный `pending/failed/partial` статус либо пакет должен явно нормализовать partial в `failed` с audit details private-side.

## 7.8. Telegram: ученик → сайт

Webhook schema расширить для:

- `message.document`;
- `message.photo[]`;
- `message.caption`;
- `message.entities`;
- `message.caption_entities`;
- `reply_to_message` как сейчас.

Flow:

1. определить student по постоянной Telegram identity;
2. recipient: native Reply имеет приоритет, иначе saved recipient;
3. проверить active assignment;
4. выбрать максимальный Telegram photo size либо document;
5. проверить заявленный `file_size <= 10 МБ`; если больше — не скачивать;
6. получить file path через Telegram `getFile`;
7. скачать server-side с timeout и hard byte limit 10 МБ;
8. загрузить в private Storage;
9. атомарно сохранить incoming message + attachment + dedupe `telegram_update_id`;
10. отправить notification tutor/admin с типом вложения/preview текста;
11. показать student успешный control response.

Если Telegram file metadata отсутствует/некорректна или фактический поток превышает 10 МБ — abort, удалить partial object, не создавать chat message.

## 7.9. Security

- filename sanitization;
- MIME не доверять только extension;
- `X-Content-Type-Options: nosniff` сохраняется;
- active content не исполняется;
- signed URL short TTL;
- storage path не логировать вместе с identity;
- не отдавать private Telegram file IDs клиенту;
- удаление назначения закрывает доступ к новым signed URLs согласно текущему participant-based правилу.

## 7.10. Acceptance criteria

- [ ] Tutor/admin загружает изображение 9.9 МБ drag&drop → ученик получает его в Telegram.
- [ ] Tutor/admin загружает обычный файл → ученик получает document.
- [ ] Файл >10 МБ блокируется до отправки/сохранения сообщения.
- [ ] Student отправляет photo в Telegram → оно появляется в веб-чате.
- [ ] Student отправляет document до 10 МБ → оно появляется в веб-чате.
- [ ] Telegram attachment >10 МБ не скачивается полностью и не сохраняется.
- [ ] Reply на Telegram photo/document корректно выбирает преподавателя.
- [ ] Снятое назначение блокирует новую отправку/загрузку.
- [ ] Storage objects private.
- [ ] Удаление chat message/conversation/user удаляет attachment metadata и object.

---

# 8. TG-014-05 — полное удаление аккаунта

## 8.1. Изменение продукта

Текущий `admin_soft_delete_user` больше не является конечным delete flow.

Кнопка `Удалить аккаунт` должна означать физическое удаление данных пользователя в доступных системах TutorGate.

Удаление выполняет только active admin и только для non-admin target.

## 8.2. UI подтверждения

`UserActionsMenu` изменить текст.

Вместо:

> персональные данные будут обезличены, история занятий и статистика сохранятся

показывать предупреждение уровня destructive:

> Аккаунт и связанные данные будут удалены без возможности восстановления: расписание, статистика, переписка, файлы и доступ. Действие необратимо.

Для снижения случайных удалений добавить подтверждение с явным действием, например:

- кнопка `Удалить аккаунт полностью`;
- optional typed confirmation (`УДАЛИТЬ`) допустима, но не обязательна для acceptance.

## 8.3. DB hard-delete contract

Добавить новый admin RPC/service flow, условное имя:

`admin_prepare_hard_delete_user(p_user uuid)` / `admin_hard_delete_user(p_user uuid)`.

Он обязан:

- повторно проверить `private.is_admin()`;
- запретить target с `role='admin'`;
- взять target row `FOR UPDATE`;
- немедленно revoke active sessions;
- сделать flow идемпотентным для безопасного retry после внешней ошибки Storage/Auth.

## 8.4. Порядок очистки

Из-за того, что PostgreSQL, Supabase Storage и Auth Admin API не образуют одну общую транзакцию, реализовать многофазное удаление с private deletion ledger.

Рекомендуемая схема:

`private.user_deletion_jobs(user_id, status, storage_paths, last_error_code, created_at, updated_at)` без PII.

### Phase A — prepare

В одной DB-транзакции:

- валидировать admin/target;
- зафиксировать target Telegram IDs и storage paths, необходимые для cleanup, только в private job;
- отозвать sessions;
- заблокировать дальнейший вход/изменения;
- очистить одноразовые reset tokens;
- пометить job `prepared`.

### Phase B — Storage cleanup

Server-only удалить все chat attachment objects пользователя/его удаляемых conversations.

Повторное удаление отсутствующего object считается success.

### Phase C — DB purge

Одной транзакцией удалить/очистить все связанные записи target, минимум:

- `private.telegram_chat_state`;
- `private.telegram_chat_updates` через chat message cascade;
- `private.telegram_message_links` через chat message cascade;
- `private.telegram_control_messages` для сохранённого chat_id;
- `public.chat_attachments`;
- `public.chat_messages` / `public.chat_conversations`, где пользователь student или tutor;
- `public.lesson_private_notes` через lessons cascade;
- `public.lessons`, где target tutor/student;
- `public.tutor_student_availability`;
- `public.schedule_week_rollovers`;
- `public.user_schedule_preferences`;
- `public.student_tutor_assignments`;
- `public.tutor_subjects` для target tutor;
- private sessions/aliases/tokens;
- заявку/registration-private artifacts, однозначно принадлежащие target Telegram identity;
- `public.profiles` — после удаления зависимостей либо через последующий Auth cascade.

Статистика отдельной таблицей сейчас не хранится; удаление lessons автоматически удаляет данные, из которых она рассчитывается.

## 8.5. Audit foreign keys

Перед hard delete проверить все FKs на `profiles(id)`.

Для чисто audit actor-полей, которые могут ссылаться на удаляемый профиль и не должны удалять чужие бизнес-данные, привести схему к nullable + `ON DELETE SET NULL` либо гарантированно заменить ссылку безопасным образом.

Нельзя каскадом удалить чужое назначение только потому, что target когда-то был указан как audit actor.

## 8.6. Auth deletion

После успешного DB dependency purge вызвать server-only Supabase Auth Admin API физического удаления user UUID (`deleteUser`/актуальный эквивалент закреплённой версии SDK).

Успех операции показывать только после проверки, что:

- target больше не существует в `auth.users`;
- profile отсутствует;
- связанные data/storage отсутствуют;
- deletion job завершён.

## 8.7. Ошибка внешнего шага

Нельзя показывать `Аккаунт удалён`, если Auth/Storage cleanup не завершён.

Если внешний шаг упал:

- доступ пользователя уже должен быть отозван;
- admin получает `Удаление не завершено. Повторите очистку.`;
- private deletion job остаётся retryable;
- в admin UI должна быть возможность повторить незавершённый delete без восстановления PII.

Допустимо добавить компактный блок `Незавершённые удаления` в admin area либо вернуть target в directory как техническую строку `Удаление не завершено` до финализации.

## 8.8. Acceptance criteria

- [ ] Только admin может вызвать hard delete.
- [ ] Admin target удалить нельзя.
- [ ] После success нет `auth.users` и `profiles` target.
- [ ] Нет lessons/notes/derived statistics target.
- [ ] Нет assignments/tutor subjects target.
- [ ] Нет conversations/messages/attachments target.
- [ ] Нет chat Storage objects target.
- [ ] Нет login alias/session/reset token.
- [ ] Старый Telegram не считается привязанным к удалённому профилю.
- [ ] Повторный вызов после частичного сбоя безопасен.
- [ ] UI больше не обещает сохранение истории.

---

# 9. TG-014-06 — убрать точку из логотипа

## 9.1. Изменения

В `src/components/shared/brand.tsx` удалить:

```tsx
<span className="brand-dot">.</span>
```

В `src/app/globals.css` удалить неиспользуемый `.brand-dot`.

Итоговый текстовый wordmark:

`TutorGate`

Знак `brand-mark` и `src/app/icon.svg` не менять, если отдельного редизайна не требуется.

## 9.2. Acceptance criteria

- [ ] В sidebar `TutorGate` без точки.
- [ ] В mobile header `TutorGate` без точки.
- [ ] На публичных страницах `TutorGate` без точки.
- [ ] Нет визуального пустого gap/остаточного CSS.

---

# 10. TG-014-07 — красные занятия нельзя перемещать

## 10.1. Определение

«Красное занятие» = занятие с базовым DB `color='coral'`.

Автоматический зелёный/синий effective color не меняет это свойство. Если underlying `color='coral'`, временной интервал остаётся защищённым даже когда completed/transfer marker визуально перекрывает цвет.

## 10.2. Клиентский запрет

Добавить общий helper, например:

```ts
export const isTimeLocked = (lesson: ScheduleLesson) => lesson.color === "coral";
```

Применить:

- `pointerMove`: не запускать preview/move для coral;
- cursor для coral не должен быть `grab`;
- `Перенести…` disabled для любой группы с coral;
- multi-select уже исключает coral — сохранить;
- LessonDialog при coral:
  - date disabled;
  - time disabled;
  - duration disabled;
  - остальные разрешённые поля редактируются;
- context menu/tooltip объясняет `Красное занятие нельзя перемещать`.

## 10.3. Серверный запрет — обязателен

UI недостаточен. Новый DB contract должен отклонять:

- `schedule_command kind='move'`, если хотя бы одна target row `color='coral'`;
- `kind='transfer'` для coral;
- `kind='edit'`, если существующий coral и изменились `starts_at` или `duration_minutes`;
- restore/signed history не должна позволять обойти новое правило произвольной пользовательской командой. Undo допустим только для исторической операции, созданной после применения пакета и не содержащей запрещённого temporal change coral; старый snapshot, пытающийся сдвинуть coral, должен отклоняться либо invalidated при смене contract version.

Для нетемпорального edit coral:

- не запускать magnet, способный изменить `starts_at`;
- если смена student/subject создаёт недопустимый coral conflict на **том же времени**, вернуть ошибку, а не искать ближайшее время.

## 10.4. Recolor semantics

- coral → другой базовый цвет разрешено; после успешной перекраски занятие больше не time-locked;
- другой цвет → coral разрешено только если текущий неизменный interval допустим по coral constraints;
- recolor не меняет starts_at/duration.

## 10.5. Existing data

Если до пакета существуют `isTransferTarget=true` с `color='coral'`, они считаются time-locked и не двигаются обычным drag.

## 10.6. Acceptance criteria

- [ ] Coral нельзя drag.
- [ ] Coral нельзя `Перенести…`.
- [ ] В редакторе coral нельзя изменить день/время/длительность.
- [ ] Подмена запроса вручную отклоняется БД.
- [ ] Нетемпоральная заметка coral сохраняется без сдвига.
- [ ] После recolor coral → default занятие можно перемещать.

---

# 11. TG-014-08 — drag не переключает недели

## 11.1. Текущая причина

В `calendar.tsx` функции `watchEdge()` + `edgeTimer` при попадании pointer в 18 px от края вызывают `navigate(nextWeek)` каждые ~550 ms.

Это поведение удалить.

## 11.2. Новое поведение

Во время drag:

- текущая неделя календаря не меняется автоматически;
- курсор у левого края остаётся в первом видимом дне;
- у правого — в последнем видимом дне;
- preview ограничен текущими семью днями открытой недели;
- переключить неделю можно только явным UI navigation после окончания drag.

Если пользователь manually открыл историческую неделю, drag работает только внутри этой открытой недели по действующим серверным ограничениям.

## 11.3. Код

Удалить/не использовать:

- `edgeTimer`;
- `edgeDirection`;
- `watchEdge()`;
- `navigate()` из edge-drag flow.

Не удалять обычные стрелки/Select навигации недели.

## 11.4. Acceptance criteria

- [ ] Держать занятие 3+ секунды у левого края → неделя не меняется.
- [ ] Держать у правого края → неделя не меняется.
- [ ] Drag на Sunday не переходит в Monday следующей недели.
- [ ] Manual week navigation остаётся.
- [ ] Future-week server rule не ослабляется.

---

# 12. TG-014-09 — форматирование текста веб-чата → Telegram

## 12.1. Основной принцип

Не хранить произвольный HTML из browser как источник истины.

Ввести безопасный канонический rich-text формат: JSON document/AST с whitelist узлов и marks.

Минимальная модель может содержать:

- text nodes;
- paragraphs/newlines;
- marks: `bold`, `italic`, `underline`, `strike`, `code`, `link`;
- block: `blockquote`.

`body`/`body_plain` оставить как производное plain-text представление для preview, поиска, notifications и backward compatibility.

## 12.2. DB migration/backfill

Для существующих chat messages:

- создать structured content из текущего plain `body`;
- визуально история должна остаться идентичной;
- API DTO получает `content` + `body` plain preview.

Можно сохранить `body text` как non-null/nullable согласно attachment model, но renderer не должен доверять ему как HTML.

## 12.3. Composer

Заменить plain textarea на доступный rich-text composer без обязательного обновления package versions/lockfile.

Так как AGENTS запрещает обновлять версии без согласования, при отсутствии уже установленного editor dependency предпочтительно реализовать небольшой контролируемый editor на текущем стеке, а не молча добавлять новый крупный пакет.

Toolbar:

- Bold;
- Italic;
- Underline;
- Strike;
- Quote;
- Code;
- Link.

Keyboard shortcuts:

- Ctrl/Cmd+B;
- Ctrl/Cmd+I;
- Ctrl/Cmd+U;
- остальные могут иметь toolbar-only, если shortcut конфликтует с браузером.

Enter отправляет только когда это не ломает редактирование; предпочтительно сохранить текущий UX `Enter — отправить / Shift+Enter — новая строка`, но IME/composition должен работать как сейчас.

## 12.4. Paste

При paste:

- принимать plain text и поддерживаемые marks;
- удалять unsupported tags/styles/scripts;
- ссылки пропускать только по безопасным schemes `https:`, `http:` (при необходимости `mailto:` отдельно, но не обязателен);
- `javascript:`, `data:` и иные опасные URL блокировать.

## 12.5. Web rendering

Создать единый renderer structured content → React elements.

Не использовать unsanitized `dangerouslySetInnerHTML`.

## 12.6. Telegram serialization

Создать единый serializer structured content → Telegram HTML.

Mapping:

- bold → `<b>`;
- italic → `<i>`;
- underline → `<u>`;
- strike → `<s>`;
- inline code → `<code>`;
- blockquote → `<blockquote>`;
- link → `<a href="...">`.

Все dynamic text/attributes обязательно escape.

Nested/overlapping marks должны сериализоваться в корректно вложенные Telegram tags. Unsupported combination нормализовать детерминированно, а не отправлять raw HTML.

## 12.7. Лимиты

Текущий продуктовый лимит 4000 Unicode code points plain content сохранить, если иное не согласовано.

Проверять лимит по plain-text содержимому server-side, а Telegram HTML length дополнительно учитывать при splitting.

Длинное сообщение делить только по безопасным границам structured content так, чтобы HTML tags в каждой части были закрыты.

## 12.8. Входящий Telegram rich text

Для симметрии webhook должен читать `entities/caption_entities` и преобразовывать поддерживаемые Telegram entities в тот же structured format. Тогда жирный/ссылки ученика из Telegram корректно показываются на сайте.

Неизвестные entity сохраняются как plain text.

## 12.9. Acceptance criteria

- [ ] Все 7 видов форматирования корректно отображаются на сайте.
- [ ] Они же корректно приходят ученику в Telegram.
- [ ] Спецсимволы `< > &` не ломают Telegram HTML.
- [ ] Dangerous pasted HTML/script не исполняется.
- [ ] Link с `javascript:` не сохраняется как активная ссылка.
- [ ] Existing plain messages мигрируют без визуальной потери.
- [ ] Telegram formatting ученика отображается на сайте хотя бы для поддерживаемого subset.

---

# 13. TG-014-10 — более удобный Telegram-бот

## 13.1. Использовать пакет 013

Не создавать хаотичное новое сообщение после каждого callback. Переиспользовать:

- `private.telegram_control_messages`;
- `telegram_control_claim`;
- `telegram_control_finish`;
- `sendControlMessage()`;
- существующее правило: текущая control panel редактируется, callback из старого/другого сообщения создаёт новую панель.

## 13.2. Общий стиль сообщений

Все bot templates привести к единой структуре:

1. emoji + короткий жирный заголовок;
2. 1–3 коротких смысловых блока;
3. ключевое действие отдельной кнопкой;
4. navigation row внизу.

Избегать длинных технических объяснений, повторения TutorGate в каждом абзаце и неоднозначных кнопок.

Динамические значения — только через escape helpers/structured serializer.

## 13.3. Главное меню student

Пример:

- `📅 Расписание` → site URL student schedule;
- `💬 Написать репетитору` → текущий picker;
- `🌐 Открыть TutorGate`;
- `🆘 Поддержка` → `https://t.me/tutorgate`.

После отправки сообщения предложить:

- `💬 Написать ещё` / `Выбрать репетитора`;
- `🏠 Главное меню`.

## 13.4. Главное меню tutor

- `💬 Чаты` → `/tutor/chats`;
- `📅 Расписание` → `/tutor/schedule`;
- `📊 Статистика` → `/tutor/statistics`;
- `🌐 Открыть TutorGate`;
- `🆘 Поддержка`.

Bot не превращается в tutor-side full chat composer: преподаватель продолжает писать ученику на сайте.

## 13.5. Главное меню admin

- `📥 Заявки`;
- `💬 Чаты` → `/admin/chats`;
- `📅 Расписание` → `/admin/schedule`;
- `👩‍🏫 Репетиторы` → `/admin/tutors`;
- `🌐 Открыть TutorGate`;
- `🆘 Поддержка`.

## 13.6. Админ: заявки в Telegram

### Queue

`📥 Заявки` показывает pending review count и карточки/страницы, например по 5 заявок.

Каждая карточка:

- роль;
- ФИО;
- @username;
- предметы;
- цель/опыт в разумно ограниченном preview;
- дата заявки.

Кнопки:

- `✅ Принять`;
- `❌ Отклонить`;
- `🌐 Открыть на сайте`;
- paging `← / →`;
- `🏠 Главное меню`.

### Security contract

Webhook не может использовать authenticated web `auth.uid()`.

Добавить service-only bot RPC, который:

1. принимает Telegram user/chat identity + application UUID + action;
2. внутри БД заново находит связанный active profile;
3. требует `role='admin'`;
4. блокирует application `FOR UPDATE`;
5. вызывает тот же доменный transition, что web `review_application`, а не отдельную несовместимую логику.

Рекомендуется вынести общую транзакционную часть web/bot review в private helper и закрыть execute от API-ролей.

### Approve

- генерировать registration token только server-side;
- БД получает только hash;
- после commit бот отправляет applicant registration link текущим существующим безопасным template flow;
- admin control panel показывает `✅ Заявка принята`;
- ошибка delivery не откатывает решение, как в существующем web contract.

### Reject

- первый admin transition выигрывает;
- applicant получает reject message;
- control panel обновляется.

### Resend

Для application status `approved` + `can_resend=true` показывать `🔁 Новая ссылка` и использовать существующие TTL/audit semantics.

### Race/stale callback

Если заявку уже обработал другой admin:

- не менять повторно;
- показать `Заявка уже обработана`;
- обновить queue.

## 13.7. Navigation callbacks

Использовать короткие callback data в пределах Telegram 64-byte limit, например:

- `menu:home`;
- `menu:apps:0`;
- `app:a:<compact-id-or-server-token>`.

Если полный UUID + action не укладывается с будущими prefix, использовать private short-lived callback token mapping; не помещать PII в callback data.

## 13.8. Attachment bot UX

После пакета 014 старое сообщение `Вложения пока не поддерживаются` удалить.

Новые ответы:

- `✅ Файл отправлен`;
- `⚠️ Файл больше 10 МБ`;
- `⚠️ Этот тип сообщения пока не поддерживается` только для действительно неподдерживаемых Telegram типов (например, location/contact/sticker, если они остаются out of scope).

## 13.9. Acceptance criteria

- [ ] `/start` каждой роли показывает role-specific menu.
- [ ] На каждом вложенном экране есть предсказуемый путь назад/home.
- [ ] Student chat picker/reply/cancel не ломается.
- [ ] Admin видит pending applications и может approve/reject.
- [ ] Два admin не могут принять одну заявку дважды.
- [ ] Старый callback безопасен.
- [ ] Destructive account delete из Telegram отсутствует.
- [ ] Support button ведёт на `@tutorgate`.

---

# 14. TG-014-11 — кнопка поддержки на сайте

## 14.1. URL

Канонический URL:

`https://t.me/tutorgate`

Не строить его из пользовательского ввода.

## 14.2. Размещение

Сделать поддержку доступной на всех основных страницах сайта:

- authenticated dashboard;
- public auth/apply/register/reset pages.

Рекомендуемый вариант:

- desktop dashboard: `Поддержка` в нижней части sidebar над account block;
- mobile dashboard: пункт в mobile sheet;
- public pages: компактная кнопка/ссылка в header/footer или фиксированная support action без перекрытия form controls.

Не добавлять плавающую кнопку поверх chat composer/calendar controls, если она мешает mobile интерфейсу.

## 14.3. UI

- иконка `MessageCircle`/`Send`;
- подпись `Поддержка`;
- external link;
- `target="_blank"` + `rel="noopener noreferrer"`;
- accessible name содержит Telegram.

## 14.4. Acceptance criteria

- [ ] Student/tutor/admin находят кнопку без перехода в settings.
- [ ] Public user также может открыть поддержку.
- [ ] Ссылка ведёт именно на `https://t.me/tutorgate`.
- [ ] Mobile layout не перекрывается.

---

# 15. TG-014-12 — ускорение взаимодействия с БД

## 15.1. Цель

Ускорение должно быть доказано измерениями на staging/fixture, а не количеством добавленных индексов.

Сохраняются:

- RLS;
- `requireRole/getUser`;
- owner/delegated checks;
- exclusion constraints;
- server-side magnet;
- signed undo/redo;
- transaction safety.

Нельзя ради скорости возвращать private data широким DTO или переносить security checks только в браузер.

## 15.2. Schedule — не читать всю историю при открытии недели

### Current

`getSchedule()` → `readLessons(null, null, ...)` загружает всю историю.

### Required

Первичная загрузка возвращает только необходимый диапазон:

- выбранная неделя;
- cross-midnight части корректно попадают по interval overlap;
- при необходимости небольшой documented buffer, но не unlimited history.

Навигация недели:

- при переходе на ещё не загруженную неделю client вызывает Server Action/RPC `scheduleWeekAction(owner, week)`;
- загруженная неделя кэшируется в памяти текущего Calendar;
- Back/Forward и existing query param semantics сохраняются;
- CRUD изменяет только затронутые cached ranges;
- clipboard/undo rules сохраняются.

Итог: initial page size не растёт линейно с количеством лет истории.

## 15.3. Schedule bootstrap — сократить round trips

Сейчас после lessons отдельно читаются names, assignments, tutor subjects, visible profiles.

Ввести owner-checked read RPC, например:

`public.schedule_week_snapshot(p_owner uuid, p_week date)`

который возвращает безопасный JSON:

- lessons выбранного interval уже с `studentName/tutorName/subjectName`;
- owner context/offset/rules;
- только assigned active students owner;
- только доступные subjects;
- assignments owner.

Допустимо разделить на 2 RPC, если это заметно проще и быстрее; цель — **не более 2–3 DB round trips для initial schedule**, а не текущая цепочка широких запросов.

Delegated admin contract из 012 обязателен внутри RPC.

## 15.4. Chat polling — delta вместо последних 200 сообщений

### Current

Каждые 5 секунд `chat_snapshot` снова строит directory и историю до 200 messages.

### Required

После initial snapshot использовать cursor/delta RPC, например:

`chat_updates(p_student, p_after_created_at, p_after_id, p_directory_version)`.

Ответ при отсутствии изменений должен быть маленьким:

```json
{
  "messages": [],
  "conversationChanges": [],
  "totalUnread": 0,
  "cursor": "..."
}
```

Новые messages догружаются только после cursor.

Initial history 200 можно сохранить. Для старой истории использовать явное `Загрузить предыдущие`, а не возвращать 200 каждые 5 секунд.

Navigation unread polling желательно объединить/координировать с chat update event, чтобы открытая страница чата не выполняла два почти одинаковых запросных цикла.

## 15.5. Directory — фильтрация и пагинация в SQL

### Current

`getDirectory()` загружает все profiles + subjects + assignments + tutorSubjects, затем `PeoplePage` фильтрует Node-side.

### Required for admin

Ввести server-side paginated RPC/query:

- `kind=tutors|students`;
- `q`;
- `subject` или `tutor`;
- limit, cursor/page;
- total count;
- только relations, нужные строкам текущей страницы.

Рекомендуемый page size: 50.

Non-admin directory также не должен получать отношения, не относящиеся к viewer.

Search по admin identifiers должен сохранять текущую функциональность и не раскрывать их non-admin.

## 15.6. Statistics

Statistics query должна использовать date range и tutor filter на сервере, не историю целиком.

Проверить query plan для:

- tutor + completed + date range;
- all tutors + completed + date range.

При необходимости добавить partial indexes, например после EXPLAIN:

```sql
create index ... on public.lessons(tutor_id, starts_at)
where completed_at is not null and inactive_reason is null;

create index ... on public.lessons(starts_at)
where completed_at is not null and inactive_reason is null;
```

Не добавлять оба индекса автоматически, если staging plan показывает, что один из них не нужен.

## 15.7. Assignment indexes

Текущий `assignments_tutor(tutor_id)` не оптимален для частых pair checks.

Проверить и при подтверждении добавить composite:

```sql
create index assignments_tutor_student_subject
on public.student_tutor_assignments(tutor_id, student_id, subject_id);
```

Существующий unique `(student_id, subject_id)` сохранить.

Если `chat_pair_active(student,tutor)` остаётся дорогим на большой таблице, отдельный `(student_id,tutor_id)` допустим только после EXPLAIN.

## 15.8. Новые attachment indexes

Минимум:

- `chat_attachments(message_id)` — если не покрыт структурой/PK;
- индекс/unique по `storage_path`;
- private technical mapping indexes по фактическим lookup paths Telegram.

## 15.9. Не делать N+1

Новые rich text/attachments не должны привести к:

- отдельному DB запросу на attachments каждого message;
- отдельному signed URL generation на весь 200-message history при каждом poll;
- отдельному profile lookup на каждую lesson.

Attachment metadata присоединяется batch/RPC. Signed download URL создавать лениво по клику либо только для видимых thumbnails с ограниченным TTL.

## 15.10. Global schedule lock

Текущий общий advisory writer lock — потенциальный источник contention между разными tutor.

В рамках 014:

1. измерить lock wait на concurrency fixture;
2. сначала выполнить read/query оптимизации выше;
3. переход на owner-scoped writer locks разрешён **только** если тестами доказано сохранение всех инвариантов rollover/subject-delete/transfer/restore.

Не заменять общий lock «для скорости» без двух-сессионных regression tests.

## 15.11. Performance budgets

На staging fixture с реалистичным объёмом минимум:

- 1 000 profiles;
- 10 000 assignments;
- 50 000 lessons в общей БД, включая несколько лет истории;
- 20 000 chat messages;
- attachments metadata.

Зафиксировать до/после:

- число DB round trips;
- payload bytes;
- server duration;
- SQL `EXPLAIN (ANALYZE, BUFFERS)` для ключевых RPC/query.

Целевые критерии:

- initial schedule: не более 3 DB round trips и объём lessons зависит от недели, а не всей истории;
- no-change chat poll: 1 lightweight RPC, не возвращает последние 200 сообщений;
- directory: одна page, не вся таблица relations;
- p95 DB execution ключевых read RPC на staging fixture ориентир `<200 ms`, chat no-change delta `<100 ms`; если инфраструктурный overhead выше, обязательно показать минимум 2× уменьшение DB execution/payload относительно baseline;
- мутации расписания не становятся медленнее более чем на 20% без документированной причины.

## 15.12. Acceptance criteria

- [ ] Открытие schedule не читает всю историю.
- [ ] Новая week подгружается лениво.
- [ ] Chat polling инкрементальный.
- [ ] Directory фильтруется/paginates server-side.
- [ ] Нет N+1 по lessons/messages/attachments.
- [ ] Индексы подтверждены EXPLAIN.
- [ ] RLS/security tests проходят без ослабления.
- [ ] В verification есть baseline vs after numbers.

---

# 16. Изменения схемы БД — миграция 014

Миграцию выполнить отдельным новым файлом после 013. Исторические миграции 001–013 не редактировать.

Минимальный scope migration 014:

1. chat rich content columns / backfill;
2. `chat_attachments`;
3. private attachment/Telegram mapping при необходимости;
4. storage policies/bucket creation, если управляется SQL в текущем Supabase setup; иначе documented deployment step;
5. изменение chat message invariant `text OR attachment`;
6. расширенные bot receive/delivery RPC;
7. admin hard-delete RPC + private deletion job;
8. FK corrections, необходимые для physical profile deletion;
9. schedule server guards для coral temporal lock;
10. optimized read RPC для schedule week/chat delta/directory page;
11. подтверждённые performance indexes.

## 16.1. Grants

- новые bot/admin technical RPC — `service_role` only, если они работают по Telegram identity или Auth admin lifecycle;
- authenticated schedule/chat read/write RPC сохраняют внутреннюю проверку actor;
- private tables — без прямого `anon/authenticated` доступа;
- Storage bucket — private.

## 16.2. RLS

Attachments наследуют participant model conversation:

- tutor/admin может читать attachment только собственного активного dialog;
- никаких global admin chat bypass;
- student не получает web access, если текущий продукт его не предоставляет;
- service-role bot flow делает DB-side pair checks перед upload/finalize.

---

# 17. Изменения по файлам

Ожидаемые точки изменения (не исчерпывающий список):

### Schedule

- `src/features/schedule/types.ts`
- `src/features/schedule/operations.ts`
- `src/features/schedule/validation.ts`
- `src/features/schedule/actions.ts`
- `src/features/schedule/service.ts`
- `src/features/schedule/queries.ts`
- `src/components/schedule/calendar.tsx`
- `src/components/schedule/context-menu.tsx`
- `src/components/schedule/lesson-dialog.tsx`
- `src/components/schedule/toolbar.tsx`
- `src/app/globals.css`

### Select UI

- `src/components/ui/select.tsx`
- `src/app/globals.css`

### Chat / attachments / formatting

- `src/features/chats/types.ts`
- `src/features/chats/actions.ts`
- `src/features/chats/bot-handler.ts`
- `src/components/chats/chat-view.tsx`
- новые chat attachment/rich-text helpers/components
- `src/lib/telegram/templates.ts`
- `src/lib/telegram/bot.ts`
- `src/app/api/telegram/webhook/route.ts`
- `src/lib/supabase/admin.ts` при необходимости storage helper

### Admin account deletion

- `src/features/admin/user-actions.ts`
- `src/components/people/user-actions-menu.tsx`
- возможный retry UI для deletion jobs

### Bot applications

- `src/features/applications/admin-actions.ts` — вынести общую domain orchestration, если требуется
- `src/features/applications/notifications.ts`
- новые service-only bot application helpers
- `src/features/chats/bot-handler.ts`
- `src/lib/telegram/templates.ts`

### Brand/support/navigation

- `src/components/shared/brand.tsx`
- `src/components/layout/navigation.tsx`
- `src/app/(public)/layout.tsx`
- возможно новый `SupportLink` shared component
- `src/app/globals.css`

### DB/docs/tests

- `supabase/migrations/202609070014_product_polish_chat_files_hard_delete_performance.sql`
- `docs/architecture.md`
- `docs/database.md`
- `docs/auth-and-telegram.md`
- `docs/ui-guidelines.md`
- `docs/decisions.md`
- `docs/verification.md`
- `README.md`
- `AGENTS.md` — только если новые канонические правила должны быть отражены в operational guide

---

# 18. Тестирование

Новые изменения должны сопровождаться regression tests. Старые тесты, которые фиксируют отменённое поведение, обновить осознанно.

## 18.1. Unit / source contracts

Добавить тесты:

- `effectiveLessonColor` precedence;
- completed off restores transfer/base color;
- `isTimeLocked(coral)`;
- coral исключён из drag/transfer temporal flow;
- dropdown center math/clamp;
- rich-text AST validation;
- structured → Telegram HTML serializer;
- malicious link/paste rejection;
- attachment validation 10 MB boundary;
- bot menu callbacks;
- admin application stale callback/race orchestration.

## 18.2. DB tests — PGlite

Новый `tests/package-014-database.test.ts` минимум:

### Schedule

- move coral → 42501/controlled domain error;
- transfer coral → reject;
- edit coral same time + note → success;
- edit coral changed time/duration → reject;
- recolor coral → normal → later move success;
- recolor normal → coral subject to conflict constraints.

### Chat

- text-only message;
- attachment-only message;
- text+attachment;
- 10 MB accepted / >10 MB rejected at DB/finalize boundary;
- pair inactive → attachment blocked;
- attachment rows cascade with message/conversation.

### Hard delete

Fixture с target, у которого есть:

- lessons + note;
- assignment;
- chat messages;
- attachment metadata;
- preferences/availability;
- alias/session/token.

После DB purge ничего не остаётся. Admin target reject. Retry idempotent.

### Bot admin

- service bot action only for linked active admin;
- tutor/student cannot review application через service contract;
- race: first approve/reject wins;
- stale callback returns processed without second transition.

## 18.3. E2E

Playwright/local fixtures:

1. lesson transferred → blue;
2. complete → green → uncomplete restores blue/base;
3. legend opens;
4. coral cannot drag/edit time/transfer;
5. drag at edge does not change week URL;
6. centered Select popup desktop/mobile;
7. drag&drop image in web chat, draft preview/remove/send;
8. generic file attachment;
9. rich formatting toolbar and rendered bubble;
10. hard delete confirmation copy and successful disappearance from directory;
11. support link;
12. logo without dot.

Telegram external media delivery cannot be fully proven local-only: add mocked Bot API tests plus staging smoke test.

## 18.4. Security tests

- forged owner/student UUID;
- direct attachment lookup from unrelated tutor/admin;
- guessed storage path;
- expired signed URL;
- HTML/XSS payload in rich text;
- `javascript:` link;
- oversized upload with spoofed client size;
- Telegram oversized stream;
- hard-delete call from tutor;
- bot review callback from non-admin Telegram identity.

## 18.5. Обязательные команды

После реализации выполнить и зафиксировать результат:

```bash
npm run lint
npm run typecheck
npm test
npm run test:docs
npm run build
npm run test:e2e
```

При наличии выделенных scripts обновить `test:unit`, `test:db` так, чтобы package 014 входил в стандартные suites.

---

# 19. Staging smoke test

Перед production:

1. Применить migration 014 на staging snapshot/fixture.
2. Проверить tutor ↔ student Telegram roundtrip:
   - formatted text;
   - photo;
   - document;
   - Reply на attachment;
   - >10 МБ.
3. Проверить admin bot application approve/reject двумя admin одновременно.
4. Проверить hard delete отдельного staging user со всей связанной историей и Storage.
5. Проверить, что удалённый Telegram может пройти новый application lifecycle согласно общим product rules после полного удаления, если нет иной бизнес-блокировки.
6. Снять performance baseline/after по разделу 15.
7. Проверить delegated admin schedule и coral restrictions.
8. Проверить mobile Select/chat/support UI.

---

# 20. Обновление документации после реализации

Обязательно обновить канонические документы, потому что пакет меняет несколько старых решений:

- `docs/ui-guidelines.md`: transfer target больше не «сохраняет собственный визуальный цвет» — effective blue/green status;
- `docs/architecture.md`: coral больше нельзя drag/transfer/time-edit; drag edge navigation отсутствует; schedule history lazy-loaded;
- `docs/auth-and-telegram.md`: attachments, rich text, bot admin application actions, hard delete;
- `docs/database.md`: hard-delete вместо soft-delete как актуальный contract, новые chat tables/RPC/indexes;
- `docs/decisions.md`: новый ADR о base/effective lesson color и physical account deletion;
- `README.md`: migration 014 и новые chat capabilities;
- `docs/verification.md`: реальные команды, staging limitations и performance results.

Старые ТЗ 008–013 остаются историей и не редактируются как будто требования всегда были такими. В новых канонических docs явно отметить, какие прежние продуктовые решения отменены пакетом 014.

---

# 21. Что пакет 014 явно отменяет из прежних требований

1. Правило 008/текущего UI, по которому active `coral` можно отдельно drag/transfer/time-edit. Теперь temporal changes coral запрещены.
2. Правило UI 008, по которому transfer target визуально сохраняет собственный цвет + только blue border. Теперь его effective status color = blue, при completed = green.
3. Текущий soft-delete 010 как конечная операция удаления. Теперь delete означает physical purge + Auth deletion.
4. Ограничение 011/012 `attachments unsupported` в Telegram chat.
5. Plain-text-only chat composer.
6. Полный `chat_snapshot` polling последних 200 messages каждые 5 секунд как постоянная модель синхронизации.
7. Загрузка всей истории schedule при initial page load.
8. Edge auto-navigation при drag.

---

# 22. Не входит в пакет без отдельного согласования

Чтобы scope был однозначным, в 014 **не включать** автоматически:

- аудио/voice/video messages как отдельные inline players; если Telegram присылает их как unsupported type, бот должен объяснить ограничение. Обычный video-файл, отправленный как document и <=10 МБ, может рассматриваться как generic file;
- stickers, contacts, locations, polls;
- редактирование/удаление уже отправленного chat message;
- end-to-end encryption поверх Supabase/Telegram;
- destructive управление пользователями из Telegram;
- смену dependency versions без отдельного согласования;
- redesign всей цветовой темы сайта.

---

# 23. Definition of Done

Пакет считается завершённым только если одновременно выполнено всё ниже:

- [ ] все 12 пунктов реализованы;
- [ ] ответы заказчика из раздела 2 соблюдены;
- [ ] migration 014 применима после 013 и проходит полный DB suite;
- [ ] исторические миграции не изменены;
- [ ] автоматические цвета не ломают DB conflict class;
- [ ] coral temporal lock защищён в UI и DB;
- [ ] drag не может сам переключить неделю;
- [ ] все общие Select/Combobox центрируются под trigger;
- [ ] вложения до 10 МБ работают web ↔ Telegram;
- [ ] rich formatting безопасно работает web ↔ Telegram;
- [ ] bot имеет role-specific меню и admin application actions;
- [ ] full account delete физически очищает DB/Storage/Auth и имеет retry для частичного внешнего сбоя;
- [ ] logo без точки;
- [ ] support ведёт на `@tutorgate`;
- [ ] performance улучшение подтверждено baseline/after, а не заявлено без замеров;
- [ ] lint/typecheck/tests/docs/build/e2e выполнены и отражены в `docs/verification.md`;
- [ ] staging Telegram smoke test выполнен до production.

