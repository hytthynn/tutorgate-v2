# ТЗ: TutorGate — пакет 018

**Дата фиксации:** 08.09.2026  
**Статус:** согласовано по уточнениям заказчика, готово к разработке  
**База проекта:** TutorGate v2, Next.js 16.3.4 / React 19.2.8 / Supabase/PostgreSQL  
**Последняя обнаруженная миграция в проекте:** `202609080017_telegram_sync_albums.sql`  
**Предлагаемая новая миграция:** `supabase/migrations/202609080018_chat_schedule_rates_background.sql`

---

## 1. Цель пакета

Пакет должен реализовать 11 продуктовых изменений без нарушения существующих правил безопасности, RLS, delegated schedule, optimistic/undo-redo механики расписания и Telegram-интеграции:

1. поддержка LaTeX-формул в чате;
2. полноценное отображение inline-кода и блоков кода, включая корректную отправку в Telegram;
3. персональная ставка конкретного репетитора с fallback на общую ставку;
4. администраторская «Личная» ставка для пары репетитор + ученик, действующая на все будущие занятия;
5. фиксация ставки занятия в момент отметки занятия проведённым;
6. корректное отображение Telegram GIF и всех типов Telegram-стикеров на сайте;
7. убрать визуальное выделение всей таблицы расписания при получении фокуса;
8. добавить скругление прямоугольнику мультивыделения;
9. заменить выпадающий список сдвига от МСК на ручной ввод;
10. добавить персональный фон расписания из изображения/GIF/видео до 7 МБ для tutor/admin;
11. привести toolbar редактора чата к приложенному референсу, без кнопок изображения и ссылки, сохранив underline и strikethrough.

---

## 2. Зафиксированные решения заказчика

Следующие решения считать согласованными и не требующими повторного уточнения при разработке.

### 2.1. LaTeX

Поддержать все четыре распространённых синтаксиса:

- inline: `$...$`;
- block: `$$...$$`;
- inline: `\(...\)`;
- block: `\[...\]`.

Для безопасного рендера использовать **KaTeX**. Добавление зависимости и изменение `package-lock.json` в рамках этого пакета разрешено.

Формулы должны иметь live-preview в веб-редакторе и корректно рендериться в уже отправленном сообщении.

Telegram не умеет нативно рендерить LaTeX, поэтому при отправке сообщения с сайта в Telegram передавать исходную LaTeX-запись как текст, не заменяя её картинкой.

### 2.2. Код

Поддержать:

- inline-код: `` `console.log()` ``;
- fenced code block:

  ````text
  ```js
  console.log("Hello");
  ```
  ````

- указание языка после открывающих тройных backticks;
- syntax highlighting на сайте;
- кнопку `Копировать` на block-коде;
- сохранение пробелов, табов и переводов строк;
- корректную Telegram HTML-разметку `<code>` / `<pre><code>...</code></pre>`.

Для syntax highlighting разрешено добавить отдельную клиентскую библиотеку, рекомендуемый вариант — `highlight.js` с импортом только нужного API/языков либо эквивалент с сопоставимым размером.

### 2.3. Ставки

Приоритет ставки фиксируется следующим образом:

1. **личная ставка tutor + student**;
2. **персональная ставка tutor**;
3. **общая ставка `app_settings.hourly_rate`**.

Персональная ставка tutor может быть удалена/сброшена — после этого автоматически используется общая ставка.

Личная ставка tutor + student:

- доступна для установки/изменения/сброса **только администратору**;
- задаётся из контекстного меню занятия через пункт `Личное`;
- относится не к одному занятию, а к паре `tutor + student`;
- применяется ко всем будущим занятиям этой пары, в том числе уже созданным в расписании, если они ещё не были проведены;
- не меняет ставку уже проведённых занятий.

### 2.4. Фиксация ставки

В момент перехода занятия из `не проведено` в `проведено` в самом занятии должен сохраняться snapshot фактической ставки за час.

После этого:

- изменение общей ставки;
- изменение ставки tutor;
- изменение личной ставки tutor + student

не должно менять заработок по уже проведённому занятию.

Если администратор/репетитор снимает отметку `Проведено`, snapshot ставки очищается. При повторной отметке занятия проведённым ставка фиксируется заново по актуальным на этот момент правилам.

### 2.5. Telegram media

Поддержать направление **только Telegram → сайт** для следующих типов:

- GIF/Telegram `animation`;
- статический sticker (`.webp`);
- animated sticker (`.tgs`);
- video sticker (`.webm`).

Отправку sticker/GIF с сайта обратно в Telegram в этом пакете не добавлять.

### 2.6. Расписание

- убрать только рамку/outline, которой сейчас подсвечивается **вся** `.schedule-grid` при фокусе;
- существующее мультивыделение занятий протягиванием мыши сохранить;
- прямоугольнику мультивыделения добавить скруглённые углы;
- нижняя подпись шкалы времени должна быть `00:00`, а не `24:00`;
- МСК-сдвиг вводится вручную, только целым числом от `-12` до `+12`;
- значение `2` визуально трактуется как `МСК+2`, `-3` как `МСК−3`, `0` как `МСК`.

### 2.7. Фон расписания

- доступен tutor и admin, поскольку admin также может быть владельцем собственного расписания;
- файл до **7 МБ**;
- поддерживаются изображения, GIF и видео;
- рекомендуемые форматы: `JPEG`, `PNG`, `WebP`, `GIF`, `MP4`, `WebM`;
- видео: `autoplay + muted + loop + playsInline`;
- фон персонален для владельца расписания;
- при delegated просмотре администратор видит фон выбранного репетитора;
- администратор не меняет фон чужого расписания через delegated view; изменить фон можно только в собственном расписании владельца;
- должна быть возможность заменить и удалить фон.

### 2.8. Toolbar чата

Toolbar должен визуально соответствовать приложенному референсу, но:

- **не показывать кнопку ссылки**;
- **не показывать кнопку изображения**;
- сохранить существующие `Underline` и `Strikethrough`.

Нужны элементы:

- Bold;
- Italic;
- Underline;
- Strikethrough;
- Quote;
- Code;
- Ordered list;
- Bulleted list;
- Align left;
- Align center;
- Align right;
- Undo;
- Redo.

Существующая отдельная кнопка вложений/скрепка под редактором остаётся.

Автоматическое распознавание безопасных `http/https` URL в тексте можно сохранить, но ручной кнопки создания ссылки в toolbar быть не должно.

---

# 3. Результаты изучения текущего проекта

## 3.1. Архитектура

Проект построен на:

- Next.js 16 App Router;
- React 19;
- strict TypeScript;
- Supabase Auth / PostgreSQL / Storage;
- Server Components по умолчанию;
- Server Actions для пользовательских мутаций;
- Telegram webhook как единственный основной Route Handler;
- RLS + SECURITY DEFINER RPC для защищённых бизнес-операций.

Ключевой архитектурный инвариант: identity и роль перепроверяются на сервере, а delegated редактирование чужого расписания администратором проходит через owner-aware RPC. Новые функции пакета обязаны сохранить эту модель.

## 3.2. Текущее состояние чата

Ключевые файлы:

- `src/components/chats/rich-editor.tsx`;
- `src/components/chats/rich-content.tsx`;
- `src/components/chats/paste-content.ts`;
- `src/components/chats/attachments.tsx`;
- `src/features/chats/rich-text.ts`;
- `src/features/chats/incoming.ts`;
- `src/features/chats/actions.ts`;
- `src/features/chats/delivery.ts`;
- `src/features/chats/types.ts`;
- `src/app/api/telegram/webhook/route.ts`;
- миграции `011`, `014`, `017`.

Сейчас `RichContent` — плоский массив runs:

```ts
{ text: string; marks: RichMark[] }[]
```

Поддерживаемые marks:

- bold;
- italic;
- underline;
- strike;
- code;
- link;
- blockquote.

Ограничение этой модели: она хорошо описывает inline marks, но не позволяет корректно хранить block-code, ordered/unordered lists и выравнивание абзацев.

Сейчас Telegram entity `pre` преобразуется в обычный mark `code`, поэтому теряется различие между inline code и code block.

`telegramContent()` сейчас умеет сериализовать только плоские marks.

Таблица `chat_messages` уже имеет:

- `body` — plain-text fallback/поиск;
- `content jsonb` — rich representation;
- revision/polling contract.

Следовательно, новый формат можно внедрить без новой текстовой колонки, расширив JSON contract `content`.

## 3.3. Текущая Telegram media-интеграция

Webhook schema сейчас принимает:

- `document`;
- `photo`;
- `caption`;
- `entities` / `caption_entities`.

Не принимаются:

- `animation`;
- `sticker`.

Вложения на сайте сейчас классифицируются в основном как:

- `image`;
- `file`.

Preview умеет `jpeg/png/webp/gif`, но отдельного проигрывания Telegram animation/video sticker/TGS нет.

## 3.4. Текущее состояние ставок

Общая ставка хранится в:

```sql
public.app_settings.hourly_rate numeric(12,2)
```

Форма администратора находится в:

- `src/features/settings/page.tsx`;
- `src/components/forms/admin-forms.tsx` (`RateForm`).

Статистика сейчас в `src/features/statistics/service.ts` загружает **текущую** глобальную ставку и умножает на все проведённые занятия выбранного периода.

Это означает, что изменение глобальной ставки сейчас пересчитывает всю историческую статистику. Требование пакета должно это поведение изменить.

В `/admin/tutors` используется `PeoplePage`; персональной ставки tutor сейчас нет.

## 3.5. Текущее расписание

Ключевые файлы:

- `src/components/schedule/calendar.tsx`;
- `src/components/schedule/toolbar.tsx`;
- `src/components/schedule/context-menu.tsx`;
- `src/features/schedule/actions.ts`;
- `src/features/schedule/queries.ts`;
- `src/features/schedule/service.ts`;
- `src/features/schedule/types.ts`;
- `src/features/schedule/validation.ts`;
- `supabase/migrations/202609050005_schedule.sql` и последующие schedule migrations.

Найдены конкретные причины двух UI-проблем:

1. вся таблица подсвечивается правилом:

```css
.schedule-grid:focus-visible {
  outline: 2px solid #d39a59;
  outline-offset: 2px;
}
```

2. `24:00` появляется из-за:

```tsx
Array.from({ length: 25 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`)
```

Последний элемент получает `hour = 24`.

Прямоугольник мультивыделения — `.schedule-selection`; сейчас `border-radius` отсутствует.

Сдвиг МСК сейчас реализован через `Select` с 25 значениями `-12…+12`.

`user_schedule_preferences.msk_offset_hours` уже ограничен целым `smallint between -12 and 12`, то есть для пункта ручного ввода менять тип БД не требуется.

Фона расписания сейчас в модели/Storage нет.

---

# 4. Общая модель rich content v2

## 4.1. Причина изменения

Текущий плоский `RichContent` нельзя расширять списками, alignment и настоящим code block без неоднозначных служебных marks.

Ввести версионированный block-based формат, например:

```ts
type RichRun = {
  text: string;
  marks: Array<
    | { type: "bold" }
    | { type: "italic" }
    | { type: "underline" }
    | { type: "strike" }
    | { type: "code" }
    | { type: "link"; href: string }
  >;
};

type RichBlock =
  | {
      type: "paragraph";
      align: "left" | "center" | "right";
      content: RichRun[];
    }
  | {
      type: "blockquote";
      content: RichRun[];
    }
  | {
      type: "code_block";
      language?: string;
      text: string;
    }
  | {
      type: "bullet_list" | "ordered_list";
      items: Array<{ content: RichRun[] }>;
    };

type RichDocumentV2 = {
  version: 2;
  blocks: RichBlock[];
};
```

Точные имена TS-полей могут отличаться, но контракт обязан сохранять различие между inline и block-семантикой.

## 4.2. Обратная совместимость

Существующие сообщения уже записаны как JSON-array v1. Нельзя ломать их чтение.

Требуется:

- `parseRichContent()` принимает v1 и v2;
- v1 при чтении нормализуется в `paragraph` v2 в памяти;
- новые сообщения пишутся как v2;
- массово переписывать все старые сообщения необязательно;
- `body` остаётся каноническим plain-text fallback до 4000 символов.

## 4.3. Серверная валидация

Запрещено доверять JSON с клиента.

Добавить Zod schema для v2 с ограничениями:

- plain-text сумма документа ≤ 4000 Unicode characters;
- разумный лимит количества blocks, например ≤ 500;
- разумный лимит items, например ≤ 500;
- URL только `http:` / `https:`;
- `language` — нормализованный идентификатор длиной ≤ 40, whitelist символов `[A-Za-z0-9_+#.-]`;
- никакого raw HTML;
- неизвестные node/mark types отклонять;
- `code_block.text` хранить как plain text, не HTML.

## 4.4. SQL helper для plain text

Сейчас RPC местами используют `jsonb_array_elements(p_content)` и предполагают v1-array.

Добавить закрытый helper, например:

```sql
private.chat_content_plain(p_content jsonb) returns text
```

Он должен:

- понимать v1 и v2;
- формировать plain text в визуальном порядке;
- между block nodes добавлять `\n`;
- для list добавлять `• ` или `1. ` только если это необходимо для `body`/Telegram fallback;
- ограничивать результат текущим контрактом 4000 символов;
- использоваться во всех `chat_send_*`, `chat_finalize_uploads`, bot receive RPC вместо прямого `jsonb_array_elements`.

Helper закрыть от `anon/authenticated`.

---

# 5. TG-018-01 — LaTeX в чате

## 5.1. Рендер

Добавить KaTeX и единый безопасный renderer.

Поддержать:

```text
$a^2+b^2=c^2$
$$\int_0^1 x^2 dx$$
\(E=mc^2\)
\[\frac{a}{b}\]
```

Рендерить только текстовые участки, которые не находятся внутри:

- inline `code`;
- `code_block`.

Это обязательно, чтобы `$` и `\[` внутри программного кода не превращались в формулу.

## 5.2. Безопасность

- не разрешать `trust: true` в KaTeX;
- не разрешать произвольный HTML;
- ошибки парсинга не должны ломать сообщение;
- при ошибке показывать исходную LaTeX-строку как обычный текст;
- нельзя использовать `dangerouslySetInnerHTML` с необработанным пользовательским вводом; если KaTeX API возвращает HTML, разрешён только output самого KaTeX при отключённых unsafe features.

## 5.3. Live preview

В редакторе:

- пользователь продолжает редактировать исходный `$...$`/`$$...$$` текст;
- preview обновляется без отправки сообщения;
- обновление желательно debounce 100–200 мс, чтобы не вызывать тяжёлый render на каждый keydown;
- незакрытая формула во время ввода не считается ошибкой формы.

## 5.4. Telegram

При `website → Telegram`:

- исходный LaTeX остаётся текстом;
- Telegram HTML escape применяется как обычно;
- LaTeX не превращать в image/document;
- не пытаться использовать MarkdownV2 только ради формул.

При `Telegram → website` текст с LaTeX-синтаксисом автоматически рендерится сайтом тем же renderer после получения.

## 5.5. Acceptance criteria

- [ ] `$x^2$` отображается inline-формулой на сайте.
- [ ] `$$x^2$$` отображается block-формулой.
- [ ] `\(...\)` и `\[...\]` поддерживаются.
- [ ] Ошибочный LaTeX остаётся читаемым текстом и не ломает весь message bubble.
- [ ] LaTeX внутри code block не рендерится как формула.
- [ ] В Telegram приходит исходная LaTeX-запись без повреждения спецсимволов.
- [ ] Старые сообщения продолжают отображаться.

---

# 6. TG-018-02 — inline code и code block

## 6.1. Ввод

Редактор должен распознавать:

- одиночные backticks как inline code;
- три backticks в начале/структуре блока как code block;
- необязательный язык после opening fence.

Пример:

````text
```javascript
const sum = (a, b) => a + b;
console.log(sum(2, 3));
```
````

После преобразования fence не обязан визуально оставаться в WYSIWYG; в модели хранится `code_block` + `language` + `text`.

## 6.2. Отображение на сайте

Code block:

- `<pre><code>`;
- monospace;
- `white-space: pre`;
- горизонтальный scroll при длинных строках;
- не переносить искусственно код, если это ломает структуру;
- сверху компактная строка с language label, если язык указан;
- справа кнопка `Копировать`;
- кнопка копирует только исходный код, без fences;
- syntax highlighting не должен изменять исходные данные.

Inline code:

- остаётся компактным `<code>` внутри строки;
- не получает кнопку копирования;
- не получает block background/layout.

## 6.3. Telegram serialization

Inline:

```html
<code>console.log()</code>
```

Block:

```html
<pre><code class="language-javascript">console.log()</code></pre>
```

Если language не задан:

```html
<pre>console.log()</pre>
```

Перед отправкой обязательно HTML-escape:

- `&`;
- `<`;
- `>`;
- кавычки в атрибутах.

Telegram splitting должен разбивать длинные сообщения только между безопасными block boundaries либо переоткрывать/закрывать entity корректно. Нельзя разрезать `<pre>` посередине без закрытия.

## 6.4. Telegram → сайт

`fromTelegram()` должен различать:

- entity `code` → inline code;
- entity `pre` → `code_block`;
- `language`, если Telegram прислал его в поддерживаемой структуре/entity metadata.

## 6.5. Acceptance criteria

- [ ] Inline backticks отображаются inline code.
- [ ] Triple backticks создают настоящий code block.
- [ ] Переводы строк/отступы сохраняются byte-for-byte с учётом нормализации CRLF → LF.
- [ ] У code block есть `Копировать`.
- [ ] Указанный язык даёт syntax highlighting на сайте.
- [ ] В Telegram block приходит как `<pre>`/`<pre><code>` и отображается блоком, а не обычным inline code.
- [ ] Символы `<`, `>`, `&` в коде не ломают Telegram HTML.

---

# 7. TG-018-03 — персональная ставка репетитора

## 7.1. Новая таблица

Рекомендуемая схема:

```sql
create table public.tutor_billing_rates (
  tutor_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate numeric(12,2) not null check(hourly_rate between 0 and 1000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
```

`tutor_id` допускает profile с ролью `tutor` или `admin`, если пользователь может владеть расписанием преподавателя.

## 7.2. Права

- читать персональные ставки для административного directory — только admin;
- менять/удалять — только admin;
- tutor/student не должны получать чужие billing settings через прямой SELECT;
- расчёт ставки для snapshot выполняется server-side в DB helper и не требует раскрытия таблицы клиенту.

Рекомендуется revoke direct writes и admin SECURITY DEFINER RPC:

```text
admin_set_tutor_rate(tutor_id, hourly_rate|null)
```

`NULL` означает «сбросить персональную ставку и использовать общую».

## 7.3. UI `/admin/tutors`

В строке каждого активного tutor/admin добавить управление ставкой.

Допустимый UX:

- кнопка/пункт `Ставка` в actions;
- dialog с текущим effective состоянием;
- radio/toggle:
  - `Использовать общую ставку`;
  - `Персональная ставка`;
- number input `0…1 000 000`, step `0.01`;
- показать текущую общую ставку для понимания fallback;
- сохранить;
- отдельное безопасное действие `Сбросить к общей`.

В строке tutor можно ненавязчиво показать:

```text
Ставка: 1 500 ₽/ч
```

или

```text
Ставка: общая, 1 200 ₽/ч
```

## 7.4. Валидация

- finite number;
- 0 допустим, если бизнес допускает бесплатное занятие;
- максимум `1 000 000`;
- не больше 2 знаков после запятой;
- tutor существует;
- tutor active;
- target имеет роль `tutor|admin`;
- actor — active admin.

## 7.5. Acceptance criteria

- [ ] Администратор может задать ставку конкретному tutor.
- [ ] Ставка другого tutor не меняется.
- [ ] Сброс персональной ставки возвращает fallback на global rate.
- [ ] Tutor/student не могут изменить ставку через прямой RPC/API.
- [ ] Значение участвует в rate snapshot новых проведённых занятий.

---

# 8. TG-018-04 — «Личное»: ставка tutor + student

## 8.1. Новая таблица

Рекомендуемая схема:

```sql
create table public.tutor_student_billing_rates (
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  hourly_rate numeric(12,2) not null check(hourly_rate between 0 and 1000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (tutor_id, student_id)
);
```

## 8.2. Контекстное меню

В `LessonContextMenu` добавить пункт:

```text
Личное
```

Пункт показывается **только если текущий actor — admin**.

Важно: `editable === true` недостаточно, потому что tutor тоже editable. В `ScheduleData` добавить явный capability, например:

```ts
canManagePersonalRates: boolean;
```

Для admin — true, для tutor/student — false.

## 8.3. Dialog

После `ПКМ по занятию → Личное` открыть dialog:

```text
Личная ставка
Ученик: Иван Иванов
Репетитор: Пётр Петров

( ) Использовать ставку репетитора / общую
(•) Личная ставка: [ 1800.00 ] ₽ / час

[Отмена] [Сохранить]
```

Если pair-rate отсутствует, dialog должен показать текущий fallback:

- персональную ставку tutor, если есть;
- иначе глобальную.

При сохранении `NULL/reset` строка pair-rate удаляется.

## 8.4. Семантика «все будущие занятия»

Не надо массово обновлять все строки `lessons` в момент изменения pair-rate.

Правильная модель:

- непроведённое занятие не содержит зафиксированную стоимость;
- когда оно становится проведённым, DB resolver берёт актуальную ставку по priority chain;
- поэтому уже созданное на следующую неделю занятие автоматически получит новую pair-rate, если будет проведено после её установки.

Это одновременно выполняет требование «ко всем будущим занятиям» и не создаёт рассинхронизацию при массовых переносах/rollover.

## 8.5. Admin delegated schedule

Если admin открыл:

```text
/admin/schedule?tutor=<uuid>
```

и вызывает `Личное`, `tutor_id` должен определяться из **server-verified owner**, а не доверяться произвольному client payload.

Нельзя позволять подменить `tutor_id` и изменить ставку пары вне доступного контекста.

## 8.6. Acceptance criteria

- [ ] Tutor не видит пункт `Личное`.
- [ ] Student не видит пункт `Личное`.
- [ ] Admin видит пункт на занятии.
- [ ] Ставка относится ко всем будущим занятиям пары, а не только к clicked lesson.
- [ ] Ставка пары имеет приоритет над tutor/global.
- [ ] Reset возвращает fallback tutor → global.
- [ ] Already-completed lesson не пересчитывается после изменения pair-rate.

---

# 9. TG-018-05 — snapshot ставки в занятии

## 9.1. Новое поле

Добавить в `public.lessons`:

```sql
hourly_rate_snapshot numeric(12,2)
  check(hourly_rate_snapshot is null or hourly_rate_snapshot between 0 and 1000000)
```

Допустимое состояние:

- `completed_at is null` → `hourly_rate_snapshot is null`;
- `completed_at is not null` → snapshot должен быть заполнен.

После backfill добавить CHECK constraint, если миграция гарантирует отсутствие старых NULL.

## 9.2. Resolver effective rate

Добавить закрытую SQL-функцию:

```text
private.effective_hourly_rate(tutor_id, student_id) -> numeric(12,2)
```

Алгоритм:

```text
pair rate
  ?? tutor rate
  ?? app_settings.hourly_rate
```

Функция должна читать данные внутри одной транзакции с изменением `completed_at`.

## 9.3. Trigger / canonical mutation

Фиксация ставки должна быть обеспечена на уровне БД, а не только React UI.

Рекомендуемый trigger BEFORE INSERT/UPDATE на `lessons` либо расширение канонического trigger:

```text
OLD.completed_at is null
NEW.completed_at is not null
=> NEW.hourly_rate_snapshot = effective_hourly_rate(NEW.tutor_id, NEW.student_id)
```

При:

```text
OLD.completed_at is not null
NEW.completed_at is null
=> NEW.hourly_rate_snapshot = null
```

При любом update уже проведённого занятия, если completed остаётся completed:

```text
snapshot НЕ пересчитывать
```

## 9.4. Запрет произвольной подмены snapshot

Пользователь не должен передавать `hourly_rate_snapshot` в `schedule_command`.

- поле вычисляется только сервером/trigger;
- signed before/after snapshot расписания должен включать поле, если оно необходимо для корректного undo/redo completed toggle;
- restore не должен принимать клиентское произвольное значение вне подписанного server snapshot.

## 9.5. Undo/redo

Если действие `Проведено` отменяется через undo:

- completed снимается;
- snapshot очищается.

Если затем redo возвращает проведённость, нужно определить корректную семантику.

Для настоящего undo/redo состояния рекомендуется восстанавливать **подписанный snapshot той же ставки**, а не пересчитывать её по текущим настройкам, потому что redo должен вернуть состояние исходной операции.

При обычном ручном снятии `Проведено`, а затем новой ручной отметке — ставка вычисляется заново.

## 9.6. Миграция существующей истории

В проекте нет таблицы истории изменения `app_settings.hourly_rate`, поэтому точную ставку прошлых проведённых занятий восстановить невозможно.

Для уже существующих `completed_at is not null` при применении 018 выполнить one-time backfill **по effective ставке на момент миграции**:

```text
pair rate (если к этому моменту уже есть)
→ tutor rate
→ current global rate
```

Поскольку pair/tutor rate вводятся этой же миграцией и изначально пусты, фактически старая история получит текущую global rate.

Это не заявлять как исторически точное восстановление. После применения 018 все новые completed transitions становятся точными snapshots.

## 9.7. Статистика

Изменить `src/features/statistics/service.ts` и aggregate contract.

Не загружать текущий `app_settings.hourly_rate` для расчёта истории.

`readLessons()` для completed statistics должен возвращать `hourly_rate_snapshot`.

Расчёт earnings по каждому временному сегменту:

```text
earnings = duration_hours * lesson.hourly_rate_snapshot
```

Если занятие пересекает полночь, существующая логика распределения duration по локальным дням сохраняется, но ставка берётся из snapshot этого занятия.

## 9.8. Acceptance criteria

- [ ] Проведённое занятие получает snapshot ставки.
- [ ] Изменение global rate не меняет его earnings.
- [ ] Изменение tutor rate не меняет его earnings.
- [ ] Изменение pair rate не меняет его earnings.
- [ ] Снять `Проведено` → snapshot очищен.
- [ ] Повторно вручную отметить → snapshot взят заново.
- [ ] Earnings статистики считаются по snapshot каждого занятия.
- [ ] Приоритет pair → tutor → global покрыт DB-тестами.

---

# 10. TG-018-06 — Telegram GIF и stickers на сайте

## 10.1. Webhook schema

Расширить `updateSchema.message`.

### Animation

Добавить:

```ts
animation: mediaSchema.extend({
  mime_type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
}).optional()
```

### Sticker

Добавить schema с минимумом:

```ts
sticker: {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
  is_animated?: boolean;
  is_video?: boolean;
  emoji?: string;
}
```

Не принимать неизвестные nested payloads без лимитов Zod.

## 10.2. Media types

Нормализовать входящие Telegram media в один internal input:

```ts
type IncomingTelegramMedia = {
  fileId: string;
  fileName: string;
  size?: number;
  mediaKind: "image" | "animation" | "sticker_static" | "sticker_animated" | "sticker_video" | "file";
  mimeHint?: string;
};
```

## 10.3. Attachment model

Расширить `chat_attachments.kind`.

Вместо только `image|file` поддержать как минимум:

```text
image
file
animation
sticker_static
sticker_animated
sticker_video
```

Если существующий CHECK constraint ограничивает значения — заменить constraint в новой миграции, не редактируя 014.

## 10.4. Download и MIME verification

Не доверять одному `mime_type` Telegram.

После скачивания проверять сигнатуру/контейнер:

- GIF: `GIF87a/GIF89a`;
- WebP: RIFF + WEBP;
- WebM: EBML header;
- MP4: `ftyp`;
- TGS: gzip stream, после распаковки JSON должен иметь ожидаемую Lottie structure.

Сохранить текущий общий лимит вложений чата — 10 МБ на сообщение/файл по существующему контракту. Если Telegram media превышает допустимый лимит, не пытаться загрузить его в Storage.

## 10.5. Storage

Переиспользовать private bucket `chat-attachments`.

Не делать bucket public.

Создание attachment + message должно оставаться атомарно привязанным к существующему `chat_bot_receive_*` flow с очисткой orphan upload при неуспехе.

## 10.6. Website rendering

### Telegram animation / GIF

Если сохранён GIF:

```html
<img ...>
```

Если Telegram animation фактически MP4/WebM:

```html
<video autoplay muted loop playsinline>
```

- controls по умолчанию не нужны;
- клик может открыть увеличенный preview;
- respect `prefers-reduced-motion`: при reduced motion не auto-play либо показывать poster/ручной play.

### Static sticker

- отображать WebP как изображение;
- прозрачный фон сохранять;
- не растягивать до обычного большого photo-preview;
- максимальный визуальный размер около 240×240 px desktop и 180×180 mobile.

### Video sticker

- `<video autoplay muted loop playsInline>`;
- прозрачность/alpha, если браузер поддерживает контейнер;
- fallback на скачивание при невозможности воспроизведения.

### Animated TGS sticker

Добавить клиентский TGS renderer.

Рекомендуемый вариант:

- `lottie-web` dynamic import только для TGS;
- скачать private signed URL;
- распаковать gzip через `DecompressionStream("gzip")` там, где доступно;
- передать проверенный JSON в Lottie;
- при отсутствии API/ошибке показать fallback `Анимированный стикер` + кнопка скачать.

Не использовать server-side ffmpeg/Chromium conversion в Vercel Function для каждого sticker.

## 10.7. Caption

GIF/animation со `caption` должен создавать одно сообщение с:

- rich caption content;
- media attachment.

Sticker без текста должен быть валидным non-empty chat message за счёт attachment.

## 10.8. Telegram albums

Существующая album sync из миграции 017 не должна сломаться.

Animation/sticker вне album обрабатывать обычным single receive flow. Если Telegram не допускает конкретный media kind в album, не добавлять искусственную album-семантику.

## 10.9. Acceptance criteria

- [ ] Telegram GIF/animation отображается движущимся media на сайте.
- [ ] Static WebP sticker отображается как sticker, а не generic file.
- [ ] TGS sticker анимируется на поддерживаемом браузере.
- [ ] WebM video sticker проигрывается loop/muted.
- [ ] Sticker без caption создаёт валидное сообщение.
- [ ] Media недоступного/невалидного формата не приводит к XSS или падению thread.
- [ ] Website → Telegram sticker/GIF send в этом пакете не появляется.

---

# 11. TG-018-07 — убрать выделение всей таблицы расписания

## 11.1. Изменение

Удалить визуальный full-grid outline:

```css
.schedule-grid:focus-visible {
  outline: 2px solid #d39a59;
  outline-offset: 2px;
}
```

`tabIndex={0}` и keyboard handlers можно сохранить, поскольку они нужны для:

- Delete;
- Enter;
- Ctrl+C;
- Ctrl+V;
- undo/redo;
- Escape.

Но получение фокуса сеткой не должно рисовать рамку вокруг всей таблицы.

## 11.2. Что сохранить

Не убирать:

- `.schedule-lesson.is-selected`;
- rectangle selection;
- selected state;
- drag preview;
- клавиатурные bind-ы.

## 11.3. Acceptance criteria

- [ ] Клик по пустой сетке не создаёт рамку вокруг всего календаря.
- [ ] Keyboard shortcuts продолжают работать.
- [ ] Выбранные занятия визуально выделяются как раньше.
- [ ] Rectangle multi-select продолжает работать.

---

# 12. TG-018-08 — скругление прямоугольника мультивыделения

Добавить для `.schedule-selection`:

```css
border-radius: 8px;
```

Допускается значение 6–10 px, если дизайн-токены проекта требуют другого радиуса, но визуально прямоугольник должен явно иметь скруглённые углы.

Не менять алгоритм hit testing / selection boundaries.

### Acceptance criteria

- [ ] Прямоугольник selection имеет скруглённые углы.
- [ ] Геометрия фактического выделения занятий не изменилась.
- [ ] Скругление одинаково работает desktop/mobile pointer selection, где функция доступна.

---

# 13. TG-018-09 — исправить `24:00` → `00:00`

## 13.1. Изменение

Шкала по-прежнему должна иметь 25 подписей границ суток, но последняя подпись должна быть `00:00`.

Пример:

```ts
const label = hour === 24 ? "00:00" : `${String(hour).padStart(2, "0")}:00`;
```

Не менять геометрическое значение последней отметки: она остаётся на `100%` высоты дня.

## 13.2. Acceptance criteria

- [ ] Верх шкалы — `00:00`.
- [ ] Низ шкалы — `00:00`.
- [ ] `24:00` нигде в schedule time labels не отображается.
- [ ] Позиции hour lines не сдвигаются.

---

# 14. TG-018-10 — ручной ввод сдвига МСК

## 14.1. UI

В `ScheduleToolbar` заменить `Select aria-label="Сдвиг МСК"` на компактный number/text input.

Рекомендуемый UX:

```text
МСК [ +2 ]
```

или одно поле с визуальным prefix `МСК`.

Input:

- min `-12`;
- max `12`;
- step `1`;
- только целые значения;
- разрешить ввод `+2`, `2`, `-2`, `0`;
- normalize display после commit;
- не отправлять Server Action на каждый символ.

Commit:

- `Enter`;
- `blur`;
- опционально debounce после завершённого валидного значения.

При invalid input:

- не менять saved offset;
- показать inline error или toast;
- вернуть последнее сохранённое значение после blur.

## 14.2. Delegated schedule

Существующее правило сохранить:

```text
canEditOffset = false
```

когда admin смотрит чужое расписание.

В этом случае поле read-only/disabled и показывает offset владельца.

## 14.3. Server/DB

Существующий DB contract `smallint between -12 and 12` сохранить.

`schedule_command kind="offset"` по-прежнему должен повторно проверять диапазон на сервере.

## 14.4. Acceptance criteria

- [ ] Выпадающего списка offset больше нет.
- [ ] `2` сохраняется как `+2`.
- [ ] `-3` сохраняется как `-3`.
- [ ] `12` и `-12` допустимы.
- [ ] `13`, `-13`, `2.5`, пустая строка не сохраняются.
- [ ] Во время delegated view admin не может менять offset tutor.

---

# 15. TG-018-11 — фон расписания

## 15.1. Storage bucket

Создать private bucket, например:

```text
schedule-backgrounds
```

Ограничение Storage:

```text
7 * 1024 * 1024 = 7 340 032 bytes
```

Bucket не public.

## 15.2. Metadata

Расширить `public.user_schedule_preferences`:

```sql
background_path text,
background_mime_type text,
background_kind text,
background_updated_at timestamptz
```

`background_kind`:

```text
image
video
```

GIF можно хранить как `image` и показывать `<img>`.

Альтернатива — отдельная таблица `schedule_backgrounds`; она допустима, но preference-table логически уже принадлежит владельцу расписания и подходит для 1 background per owner.

## 15.3. Кто может менять

Owner write rule:

- tutor меняет только свой background;
- admin в собственном расписании меняет только свой background;
- admin в delegated schedule может **просматривать**, но не заменять/удалять background target tutor;
- student не загружает background.

Проверка должна выполняться server-side, а не только скрытием кнопки.

Добавить capability в `ScheduleData`, например:

```ts
canManageBackground: boolean;
```

Значение true только для self-owned `tutor|admin` schedule.

## 15.4. Upload flow

Использовать безопасный staged upload pattern, аналогичный chat attachments:

1. client выбирает файл;
2. client-side проверка size/type;
3. Server Action перепроверяет actor/owner/capability;
4. подготовка уникального Storage path;
5. upload;
6. verify metadata/signature;
7. атомарно записать новый background path;
8. после успешной фиксации поставить старый object на удаление;
9. при ошибке metadata update удалить новый orphan object.

Не перезаписывать всегда один и тот же Storage key, чтобы браузер/CDN не показывал старый фон из кеша.

## 15.5. Допустимые форматы

Whitelist:

```text
image/jpeg
image/png
image/webp
image/gif
video/mp4
video/webm
```

Не доверять только extension/MIME браузера. Проверить magic bytes/container header.

SVG не разрешать, чтобы не расширять XSS surface.

## 15.6. Toolbar

Для owner добавить кнопку, например:

```text
Фон
```

Dialog:

```text
Фон расписания

[preview]
[Загрузить / заменить]
[Удалить фон]

Максимум 7 МБ. JPEG, PNG, WebP, GIF, MP4, WebM.
```

Upload control должен иметь нормальное pending состояние и блокировать повторный submit.

## 15.7. Отображение

Фон относится к области `.schedule-grid`/day columns, а не ко всей dashboard page.

Layering:

```text
background media           z-index 0
readability overlay        z-index 1
hour/day grid              z-index 2
lessons                    z-index 3+
selection/now/drag         выше
```

Текущие `.schedule-day` имеют непрозрачный фон `#1b1612`, поэтому при наличии background их фон должен становиться полупрозрачным/transparent через modifier class, иначе media не будет видно.

Нужен overlay для читаемости. Рекомендуемый старт:

```text
rgba(20, 16, 12, 0.45–0.65)
```

Точное значение подобрать визуально без ухудшения контраста текста занятий.

### Image/GIF

```css
object-fit: cover;
width: 100%;
height: 100%;
```

### Video

```html
<video autoplay muted loop playsInline preload="metadata">
```

При `prefers-reduced-motion: reduce` autoplay отключить и показать первый доступный кадр/paused video.

## 15.8. Signed URL

Поскольку bucket private:

- Server Component/query может выдавать short-lived signed URL;
- URL не сохранять в БД;
- в БД хранить только Storage path + MIME/kind;
- при истечении URL на долгоживущей открытой странице предусмотреть refresh через Server Action либо срок, достаточный для обычной schedule-session.

## 15.9. Delegated view

`schedule_owner_context`/snapshot должен возвращать только безопасную metadata background target owner.

Admin видит background tutor в `/admin/schedule?tutor=...`.

Кнопка `Фон` там disabled/hidden, поскольку owner другой.

## 15.10. Удаление аккаунта

Существующий hard-delete/storage cleanup flow должен включить `schedule-backgrounds` path, чтобы object не оставался orphan после удаления пользователя.

## 15.11. Acceptance criteria

- [ ] Tutor может загрузить фон своего расписания ≤7 МБ.
- [ ] Admin может загрузить фон своего расписания.
- [ ] JPEG/PNG/WebP/GIF отображаются.
- [ ] MP4/WebM проигрываются muted/loop/autoplay.
- [ ] Фон не мешает читать занятия и time grid.
- [ ] Фон сохраняется после reload/login.
- [ ] Фон можно заменить.
- [ ] Фон можно удалить.
- [ ] Файл >7 МБ отклоняется client + server + Storage policy.
- [ ] Student не может установить фон.
- [ ] Admin в delegated view видит фон tutor, но не может его изменить.
- [ ] Старый object удаляется после успешной замены.

---

# 16. TG-018-12 — toolbar редактора по референсу

> Нумерация TG внутри пакета содержит 12 технических подпунктов, потому что исходный пункт №11 объединяет внешний вид toolbar и новые block controls. Продуктовых требований заказчика по-прежнему 11.

## 16.1. Состав toolbar

В `src/components/chats/rich-editor.tsx` добавить/оставить в следующей логической последовательности:

1. Bold;
2. Italic;
3. Underline;
4. Strikethrough;
5. Quote;
6. Code;
7. Ordered list;
8. Bulleted list;
9. Align left;
10. Align center;
11. Align right;
12. Undo;
13. Redo.

Удалить/не добавлять toolbar controls:

- Link;
- Image.

Attachment icon под editor остаётся отдельным действием.

## 16.2. Иконки

Использовать существующий `lucide-react`:

- `Bold`;
- `Italic`;
- `Underline`;
- `Strikethrough`;
- `Quote`;
- `Code`;
- `ListOrdered`;
- `List`;
- `AlignLeft`;
- `AlignCenter`;
- `AlignRight`;
- `Undo2`;
- `Redo2`.

## 16.3. Внешний вид

Ориентироваться на приложенный screenshot:

- toolbar сверху editor;
- компактные иконки;
- единая горизонтальная линия;
- subtle active state;
- без тяжёлой тени/gradient;
- overflow на узком экране — горизонтальный scroll либо адаптивный перенос, но без выхода за viewport;
- focus-visible на кнопках;
- `aria-label`/`title` на каждой иконке.

## 16.4. Block controls

### Quote

Quote должен быть block semantics, а не просто inline mark поверх произвольного кусочка текста.

### Lists

- ordered list нумеруется;
- bullet list показывает маркеры;
- Enter внутри list создаёт новый item;
- Enter в пустом list item завершает list;
- paste plain multiline text внутрь item не должен создавать raw HTML.

### Alignment

Работает для paragraph blocks:

- left;
- center;
- right.

Для code block alignment всегда left.

Для list/quote рекомендуется left, если не реализуется отдельная block alignment semantics.

Telegram не поддерживает выравнивание текста. При отправке в Telegram alignment не сериализовать — передавать содержимое в правильном порядке.

## 16.5. Undo/redo редактора

Toolbar Undo/Redo относится к **редактированию draft сообщения**, а не к расписанию.

Нужен локальный history stack rich document:

- undo text input;
- undo formatting;
- undo list/alignment conversion;
- redo;
- очищать redo после нового branch edit;
- не смешивать с browser global history/navigation.

Горячие клавиши:

```text
Ctrl/Cmd+Z
Ctrl/Cmd+Shift+Z
```

## 16.6. Keyboard formatting

Сохранить/добавить:

```text
Ctrl/Cmd+B — bold
Ctrl/Cmd+I — italic
Ctrl/Cmd+U — underline
```

Не перехватывать браузерные shortcut-и вне editor.

## 16.7. Paste sanitation

Сохраняется принцип текущего проекта:

- raw HTML напрямую не вставляется;
- paste parser читает только whitelist semantics;
- scripts/styles/event handlers удаляются;
- link URL проверяется `safeLink()`;
- неизвестные tags превращаются в plain text/paragraph structure.

## 16.8. Acceptance criteria

- [ ] Toolbar визуально соответствует референсу по структуре.
- [ ] Нет иконки Link.
- [ ] Нет иконки Image.
- [ ] Underline сохранён.
- [ ] Strikethrough сохранён.
- [ ] Ordered/Bullet lists работают.
- [ ] Left/Center/Right alignment работает на сайте.
- [ ] Undo/Redo работает для draft.
- [ ] Attachment button под editor сохранён.
- [ ] Toolbar не выходит за экран mobile.

---

# 17. Изменения типов и API contracts

## 17.1. `ScheduleLesson`

Добавить только если UI/статистика действительно нуждается в значении:

```ts
hourlyRateSnapshot?: number | null;
```

Для обычного schedule UI можно не отдавать snapshot, если он нигде не показывается. Для statistics DTO поле обязательно.

## 17.2. `ScheduleData`

Добавить:

```ts
canManagePersonalRates: boolean;
canManageBackground: boolean;
background?: {
  kind: "image" | "video";
  mimeType: string;
  url: string;
} | null;
```

Не отдавать Storage path клиенту без необходимости; предпочтительно отдавать signed URL и safe metadata.

## 17.3. Chat attachment

Расширить `ChatAttachment.kind` на media types из раздела 10.

## 17.4. Rich content

Сделать explicit parser:

```ts
parseRichDocument(input: unknown): RichDocumentV2
plainText(document: RichDocumentV2): string
telegramContent(document: RichDocumentV2): string[]
```

Не разбрасывать проверку v1/v2 по UI-компонентам.

---

# 18. Изменения Server Actions / RPC

## 18.1. Новые административные операции

Добавить owner/role-checked operations:

```text
admin_set_tutor_rate(tutor_id, rate|null)
admin_set_tutor_student_rate(tutor_id, student_id, rate|null)
```

Вариант реализации через существующий `runAdminAction` допустим, если конечная DB операция всё равно повторно проверяет admin identity.

## 18.2. Background actions

Добавить server-only actions, например:

```text
prepareScheduleBackgroundUpload
finalizeScheduleBackgroundUpload
removeScheduleBackground
refreshScheduleBackgroundUrl
```

Или один staged RPC + signed upload URL. В любом варианте обязательны:

- owner check;
- role check;
- 7 MB check;
- MIME/magic validation;
- private Storage;
- cleanup orphan objects.

## 18.3. Chat RPC

Обновить rich-content RPC так, чтобы они принимали v2 JSON и вычисляли `body` через закрытый `private.chat_content_plain`.

Не ломать текущие функции album/reply/dedupe.

---

# 19. Изменения БД — рекомендуемая миграция 018

Миграция должна быть новой. **Не редактировать 001–017.**

Порядок внутри миграции:

1. взять существующий advisory lock проекта, если migration pattern его использует;
2. создать `tutor_billing_rates`;
3. создать `tutor_student_billing_rates`;
4. добавить `lessons.hourly_rate_snapshot`;
5. добавить helper `private.effective_hourly_rate`;
6. добавить/обновить trigger completed snapshot;
7. backfill старых completed lessons;
8. добавить/validate CHECK completed ↔ snapshot;
9. расширить `user_schedule_preferences` background metadata;
10. создать private bucket `schedule-backgrounds` с 7 MB limit;
11. создать background RPC/policies;
12. расширить `chat_attachments.kind` constraint;
13. добавить rich v2 plain-text helper;
14. заменить только необходимые chat RPC новыми версиями;
15. grant/revoke;
16. добавить индексы только при реальной необходимости;
17. обновить DB comments/documentation.

## 19.1. RLS / grants

Не выдавать authenticated прямой `UPDATE` на rate tables.

Admin mutations должны проверять:

```sql
auth.uid() is not null
and private.is_admin()
and private.is_active_user(auth.uid())
```

Background metadata не должна позволять admin случайно использовать общий admin bypass для изменения чужого owner background. Проверка должна быть `owner_id = auth.uid()` для write flow.

## 19.2. Concurrency ставок

При marking lesson completed resolver и snapshot должны выполняться в одной DB-транзакции.

Допустимо, что конкурентное изменение rate и completed решится порядком блокировок/commit. Требование: snapshot соответствует одному целостному committed состоянию, а не смеси двух ставок.

---

# 20. UX и ошибки

## 20.1. Rate dialogs

Ошибки:

- `Введите ставку от 0 до 1 000 000 ₽.`
- `Ставка должна содержать не более двух знаков после запятой.`
- `Не удалось сохранить ставку. Попробуйте ещё раз.`

Success toast:

- `Ставка репетитора сохранена.`
- `Личная ставка сохранена.`
- `Используется основная ставка.` / `Личная ставка сброшена.`

## 20.2. Background

Ошибки:

- `Файл должен быть не больше 7 МБ.`
- `Поддерживаются JPEG, PNG, WebP, GIF, MP4 и WebM.`
- `Не удалось загрузить фон. Попробуйте ещё раз.`

Success:

- `Фон расписания обновлён.`
- `Фон удалён.`

## 20.3. Offset

Invalid input:

```text
Введите целый сдвиг от −12 до +12.
```

## 20.4. Telegram unsupported media

Если Telegram media нельзя загрузить из-за размера/повреждения:

- webhook не должен падать весь update pipeline;
- сохранить/отправить понятный fallback только если это совместимо с текущей bot UX;
- минимум — log + безопасный status без бесконечного Telegram retry.

---

# 21. Performance requirements

1. KaTeX/highlighter/Lottie не должны попадать целиком в initial bundle чата, если функциональность сообщения их не требует.
2. Использовать dynamic import для тяжёлых renderers:
   - KaTeX можно грузить на chat route;
   - highlight grammar — только при code block;
   - `lottie-web` — только при TGS attachment.
3. Не пересчитывать KaTeX всего thread при каждом символе draft.
4. Не генерировать новый signed URL background на каждый schedule render/update без причины.
5. Background video ≤7 МБ, `preload="metadata"`, не `auto`.
6. Sticker/GIF lazy-load через существующий IntersectionObserver pattern.
7. Новая statistics aggregation должна читать snapshot одним запросом с lessons, без отдельного N+1 запроса ставки на каждое занятие.

---

# 22. Security requirements

Обязательные требования:

- никаких raw HTML из rich editor;
- LaTeX renderer без trusted commands;
- code всегда escaped;
- private Storage для chat media/background;
- SVG background запрещён;
- MIME проверяется по bytes;
- signed URL не хранится в DB;
- rate mutations только admin;
- tutor/student не видят billing tables прямым SELECT;
- pair-rate target tutor берётся из server-verified schedule owner/context;
- snapshot ставки нельзя передать произвольным client field;
- delegated admin не получает права менять background чужого tutor;
- существующие RLS/owner checks расписания не ослаблять;
- Telegram `file_id` и URL загрузки не доверять как доказатель MIME;
- Telegram TGS JSON не должен вставляться в DOM как HTML;
- content v2 проходит Zod validation и server-side structural validation.

---

# 23. Тесты

## 23.1. Unit — rich text

Добавить тесты:

- v1 content → v2 normalize;
- bold/italic/underline/strike;
- ordered/bullet list plainText;
- align does not alter plainText;
- inline code;
- code block;
- Telegram HTML escaping;
- Telegram `pre` → code block;
- block splitting до Telegram limit;
- safe/unsafe URL;
- LaTeX detection ignores code;
- malformed LaTeX fallback.

## 23.2. Unit — rates

Тест priority resolver:

```text
pair > tutor > global
```

Пограничные значения:

```text
0
0.01
1000000
```

Отказ:

```text
-1
1000000.01
NaN
Infinity
3 decimals
```

## 23.3. DB tests

Обязательно PGlite/Supabase migration tests:

- migration 018 applies after 017;
- tutor rate only admin write;
- pair rate only admin write;
- direct authenticated write rejected;
- completed transition captures correct snapshot;
- completed → incomplete clears snapshot;
- unrelated update on completed lesson preserves snapshot;
- global change does not change stored snapshot;
- pair rate fallback after delete;
- background write only self-owner tutor/admin;
- delegated admin cannot change target background;
- student cannot upload background metadata;
- chat content v1 still accepted/read;
- chat content v2 accepted;
- sticker-only message passes nonempty constraint because attachment exists;
- new attachment kinds pass constraint;
- invalid kind fails.

## 23.4. Schedule unit/UI tests

- bottom label `00:00`;
- no `.schedule-grid` full focus outline behavior;
- selection rectangle radius class/style;
- offset accepts integer -12…12;
- offset rejects decimal/out-of-range;
- delegated offset disabled;
- personal rate menu visible only admin;
- background action visible only self-owned tutor/admin schedule.

## 23.5. Telegram tests

Fixtures:

- `animation` GIF/MP4 payload;
- static WebP sticker;
- animated TGS sticker;
- video WebM sticker;
- sticker without caption;
- animation with caption + entities;
- media > limit;
- duplicate update_id;
- reply mapping preserved.

Проверить, что webhook:

- принимает schema;
- не возвращает 400 для валидных Telegram media;
- сохраняет правильный kind;
- сохраняет dedupe semantics;
- не ломает control/reply state.

## 23.6. E2E

Минимальные сценарии:

1. Admin задаёт tutor rate → проводит занятие → меняет tutor rate → старая статистика не меняется.
2. Admin через `Личное` задаёт pair rate → следующее занятие получает pair snapshot.
3. Tutor не видит `Личное`.
4. Tutor загружает GIF/video background → reload → background остался.
5. Admin открывает delegated tutor schedule → видит tutor background, кнопки его изменения нет.
6. Chat: создать message с bold + list + LaTeX + code block → reload → структура сохранена.
7. Telegram fixture sticker/GIF → message появляется на сайте с корректным renderer.

---

# 24. Файлы, которые предположительно потребуют изменения

## Chat

- `src/features/chats/rich-text.ts`;
- `src/components/chats/rich-editor.tsx`;
- `src/components/chats/rich-content.tsx`;
- `src/components/chats/paste-content.ts`;
- `src/components/chats/attachments.tsx`;
- `src/features/chats/attachments.ts`;
- `src/features/chats/incoming.ts`;
- `src/features/chats/types.ts`;
- `src/features/chats/delivery.ts`;
- `src/app/api/telegram/webhook/route.ts`;
- `src/app/globals.css`.

## Rates/statistics

- `src/features/admin/actions.ts`;
- `src/components/forms/admin-forms.tsx` либо новый rate dialog component;
- `src/features/people/page.tsx`;
- `src/features/people/queries.ts`;
- `src/features/statistics/service.ts`;
- `src/features/statistics/aggregate.ts`;
- `src/features/schedule/queries.ts` при расширении lesson DTO.

## Schedule

- `src/components/schedule/calendar.tsx`;
- `src/components/schedule/toolbar.tsx`;
- `src/components/schedule/context-menu.tsx`;
- новый `personal-rate-dialog.tsx`;
- новый `background-dialog.tsx`;
- `src/features/schedule/actions.ts`;
- `src/features/schedule/queries.ts`;
- `src/features/schedule/types.ts`;
- `src/features/schedule/validation.ts` при новых commands/actions;
- `src/app/globals.css`.

## DB / config

- `supabase/migrations/202609080018_chat_schedule_rates_background.sql`;
- `package.json`;
- `package-lock.json`;
- `docs/database.md`;
- `docs/architecture.md`;
- `docs/verification.md` после фактических проверок.

---

# 25. Definition of Done

Пакет считается выполненным только если одновременно выполнено следующее:

- [ ] Все 11 пользовательских требований реализованы.
- [ ] LaTeX работает во время редактирования и после отправки.
- [ ] Code block визуально и семантически отличается от inline code.
- [ ] Code block корректно доставляется в Telegram.
- [ ] Toolbar соответствует референсу по составу без Link/Image.
- [ ] Underline/Strikethrough не потеряны.
- [ ] Tutor custom rate работает с fallback на global.
- [ ] Admin personal pair rate работает для всех будущих занятий пары.
- [ ] Earnings исторических проведённых занятий после 018 больше не зависят от текущей ставки.
- [ ] GIF и все три класса sticker Telegram отображаются на сайте.
- [ ] Full-grid focus outline расписания отсутствует.
- [ ] Selection rectangle скруглён.
- [ ] `24:00` заменено на `00:00`.
- [ ] Offset вводится вручную, server validation сохранена.
- [ ] Background image/GIF/video ≤7 МБ работает и хранится private.
- [ ] Delegated admin видит background tutor, но не меняет его.
- [ ] RLS/owner checks не ослаблены.
- [ ] Старые rich messages v1 не сломаны.
- [ ] Новая миграция применима поверх 001–017 без редактирования истории.
- [ ] `npm run lint` успешно.
- [ ] `npm run typecheck` успешно.
- [ ] `npm test` успешно.
- [ ] `npm run test:docs` успешно.
- [ ] `npm run build` успешно.
- [ ] релевантные `npm run test:e2e` успешно.
- [ ] `docs/verification.md` содержит только реально выполненные команды и их фактический результат.

---

# 26. Не входит в этот пакет

Чтобы не расширять scope незаметно, явно не входит:

- отправка sticker из веб-чата в Telegram;
- отправка GIF как Telegram `sendAnimation` с веб-сайта;
- формулы как изображения в Telegram;
- Markdown-редактор вместо текущего rich editor;
- произвольный HTML в сообщениях;
- SVG-background;
- background для student schedule;
- изменение background чужого tutor администратором;
- дробные timezone offsets;
- отдельная биллинговая история изменения ставок по датам — source of truth после 018 является snapshot каждого проведённого занятия.

---

# 27. Краткая карта бизнес-логики ставки

```text
Администратор меняет общую ставку
             │
             ├───────────────┐
             │               │
   tutor custom rate?        no
       │ yes                 │
       ▼                     ▼
  ставка tutor         общая ставка
       │
       │
Для конкретного student есть pair rate?
       │
   yes ▼               no ─────────► ставка tutor/global
   pair rate
       │
       ▼
Занятие отмечают «Проведено»
       │
       ▼
lessons.hourly_rate_snapshot = resolved rate
       │
       ▼
Статистика всегда использует snapshot
```

---

# 28. Краткая карта media flow Telegram → сайт

```text
Telegram update
   │
   ├─ text/entities ───────────────► rich content v2
   │
   ├─ animation ─┐
   ├─ sticker ───┼─► schema validation
   └─ photo/doc ─┘
                     │
                     ▼
               getFile/download
                     │
                     ▼
              size + magic check
                     │
                     ▼
          private chat-attachments
                     │
                     ▼
            atomic message bind
                     │
                     ▼
  Website renderer by attachment.kind
```

---

# 29. Итог

После реализации пакета TutorGate должен получить единый расширенный rich-chat с LaTeX, code blocks, списками, alignment и сохранённой Telegram-совместимостью; корректную обработку Telegram GIF/stickers; многоуровневую систему ставок с неизменяемой историей заработка; ручной МСК-сдвиг; исправленное визуальное поведение selection/time labels; а также персонализируемый private background расписания для tutor/admin.

Главный технический принцип пакета: **исторические деньги фиксируются в `lessons`, визуальные/редакторские возможности остаются безопасными структурированными данными, а новые административные возможности не обходят существующие owner/RLS проверки.**
