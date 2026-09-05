# ТЗ: TutorGate — исправления интерфейса и расширение расписания

**Дата:** 05.09.2026  
**Проект:** TutorGate v2  
**Источник:** анализ архива `tutorgate-v2(3).zip`, 9 присланных скриншотов и уточнений заказчика.  
**Статус:** согласовано к реализации.

---

## 1. Цель пакета

В рамках одного пакета необходимо:

1. убрать согласованные лишние элементы интерфейса;
2. исправить баг сохранения ставки;
3. унифицировать валидацию форм и loading-состояния;
4. реализовать оставшийся интерактив расписания: перенос, «Заниматься с», новые правила пересечений, массовые операции, copy/paste, undo/redo;
5. сохранить текущие требования безопасности TutorGate: RLS, owner-checks, отсутствие прямых клиентских writes в `lessons`, серверную проверку конфликтов и атомарность групповых операций;
6. все изменения расписания показывать **мгновенно на клиенте**, а сохранение выполнять в фоне с откатом при ошибке.

---

## 2. Подтверждённые решения заказчика

1. В админ-панели у пользователя с ролью `admin` вместо `Администратор · Репетитор` показывать только `Администратор`. В интерфейсах ученика/репетитора дополнительную подпись под администратором не показывать.
2. Полностью убрать:
   - footer личного кабинета `TutorGate / Пространство для роста.`;
   - публичный footer `© … TutorGate / Закрытое пространство обучения`;
   - публичную ссылку `Стать частью TutorGate` в header. Сам бренд TutorGate в header оставить.
3. При команде «Перенести…» исходное занятие остаётся в расписании как неактивное; создаётся новое занятие. Новое перенесённое занятие **нельзя повторно переносить командой «Перенести…»**.
4. В окне переноса `Текущая неделя / Следующая неделя` означает реальную текущую/следующую локальную неделю пользователя, а не неделю исходного занятия. Для переноса разрешить специальное исключение: создать target в следующей неделе до её автоматического rollover.
5. «Заниматься с» действует на пару **конкретный репетитор + ученик**, а не глобально на ученика у всех репетиторов.
6. Неактивное занятие нельзя drag&drop и нельзя включать в мультивыделение. Его можно открыть для просмотра, посмотреть заметку и удалить.
7. «Красное занятие» = существующий цвет `coral`. Правила пересечения:
   - обычное ↔ обычное: запрещено;
   - обычное ↔ `coral`: разрешено;
   - `coral` ↔ `coral`: запрещено;
   - любое ↔ неактивное: разрешено.
8. Массовые действия применяются ко всему выделению. «Заниматься с» применяется ко всем уникальным ученикам из выделенных занятий. Должна быть отдельная возможность **«Отменить заниматься с»**.
9. `Ctrl+C` / `Ctrl+V`: используется модель B — после копирования пользователь выбирает точку календаря, и вставленная группа начинается с этой точки, сохраняя относительное расположение. Копировать цвет и заметку; новые копии должны быть непроведёнными и без статусов переноса/неактивности.
10. `Ctrl+Z` / `Ctrl+Shift+Z`: история изменений действует в текущей клиентской сессии расписания и очищается после перезагрузки страницы. Undo/redo должны реально менять данные на сервере, а не только визуальное состояние.
11. Валидация должна выглядеть одинаково во всём проекте: без нативных browser popup; ошибки inline у поля.
12. У loading-кнопок убрать `cursor: wait`; spinner, `aria-busy` и защита от повторного submit остаются.
13. После успешного сброса пароля / отправки заявки / аналогичного публичного flow нельзя одновременно показывать старый вводный блок и success-state. В итоговом success-состоянии остаётся только сам блок успеха. Для reset-password верхний блок `ВОССТАНОВЛЕНИЕ ДОСТУПА / Новый пароль / ...` после успеха также скрывается.
14. В расписании любая пользовательская операция сначала применяется локально, без ожидания сети и без refresh страницы.

---

## 3. Технический контекст текущего проекта

По изученному архиву:

- Next.js 16 App Router;
- React 19;
- TypeScript strict;
- Node 24.x;
- Supabase/PostgreSQL + RLS;
- Server Components по умолчанию;
- расписание — Client Components + Server Actions;
- существующий серверный magnet и GiST exclusion constraints;
- текущая сетка расписания — 5 минут;
- текущий rollover копирует предыдущую неделю;
- `color` занятия: `default | green | coral | gray | blue`;
- private notes хранятся отдельно в `lesson_private_notes`;
- прямые authenticated insert/update/delete для `lessons` уже отозваны, изменение идёт через owner-checked RPC.

### 3.1. Основные затрагиваемые файлы

Минимально ожидаются изменения в:

- `src/features/people/page.tsx`
- `src/components/layout/dashboard-shell.tsx`
- `src/app/(public)/layout.tsx`
- `src/components/forms/admin-forms.tsx`
- `src/components/forms/auth-form.tsx`
- `src/components/forms/application-form.tsx`
- `src/components/shared/token-page.tsx`
- `src/components/statistics/statistics-view.tsx`
- `src/components/ui/button.tsx`
- `src/components/schedule/calendar.tsx`
- `src/components/schedule/context-menu.tsx`
- `src/components/schedule/toolbar.tsx`
- `src/components/schedule/lesson-dialog.tsx`
- новые dialogs для переноса и «Заниматься с»;
- `src/features/schedule/types.ts`
- `src/features/schedule/validation.ts`
- `src/features/schedule/time.ts`
- `src/features/schedule/actions.ts`
- `src/features/schedule/service.ts`
- `src/features/schedule/queries.ts`
- `src/app/globals.css`
- новая Supabase migration после `202609050006_schedule_upgrade.sql`;
- unit/DB/E2E tests;
- актуальная Markdown-документация.

### 3.2. Найденные причины части текущих багов

#### Ставка за час

`RateForm` использует React 19 form action + неконтролируемое поле `react-hook-form`. После успешной action форма может сбрасываться, поэтому сохранённое число исчезает до полной перезагрузки, хотя значение уже записано в БД.

#### Native validation popup

В формах используются `required`, `min`, `max`, `minLength` и т.п. без общего отключения native validation. Поэтому браузер показывает собственный popup вроде `Заполните это поле.` вместо UI TutorGate.

#### Loading cursor

В `globals.css` есть:

```css
.button[aria-busy="true"] { cursor: wait; }
```

Именно это правило необходимо убрать.

#### Расписание и пересечения

Сейчас две GiST exclusion constraints запрещают **любые** пересечения одного tutor и одного student. Для новых правил `coral` и неактивных занятий существующую DB-модель необходимо изменить: одной фронтенд-проверки недостаточно.

---

# 4. Общая модель состояний занятия

Для новых правил цвет и активность должны быть независимыми сущностями.

## 4.1. Цвет

Сохраняется существующий `color`:

```ts
type LessonColor = "default" | "green" | "coral" | "gray" | "blue";
```

`gray` — просто активный серый цвет. Он **не означает неактивность**.

`coral` — тот самый «красный» тип занятия со специальными правилами пересечения.

## 4.2. Неактивность

Добавить отдельную причину неактивности, например:

```ts
type LessonInactiveReason = "transferred" | "available_from" | null;
```

Рекомендуемое расширение DTO:

```ts
interface ScheduleLesson {
  // существующие поля...
  inactiveReason: "transferred" | "available_from" | null;
  inactiveUntil: string | null;       // YYYY-MM-DD, только для available_from
  isTransferTarget: boolean;
  transferSourceId: string | null;
  transferSourceStartsAt: string | null;
}
```

Названия DB-полей могут отличаться, но клиент должен однозначно знать:

- активно ли занятие;
- почему оно неактивно;
- какую дату показать для `Сможет заниматься с …`;
- является ли активное занятие результатом команды «Перенести…».

## 4.3. Conflict class

У занятия должна вычисляться сервером и клиентом одна и та же логическая группа:

```text
inactiveReason != null   -> conflict class = none
color == coral           -> conflict class = coral
иначе                    -> conflict class = normal
```

Конфликт существует только между двумя активными занятиями одной conflict class.

---

# 5. Функциональные требования

## FR-01. Подпись администратора

### Требуемое поведение

В админ-панели в списке репетиторов/людей:

```text
Тарасов Дмитрий Михайлович
Администратор
```

Вместо:

```text
Тарасов Дмитрий Михайлович
Администратор · Репетитор
```

В кабинетах ученика и репетитора дополнительная подпись под именем администратора не должна появляться.

### Важно

Это требование относится к подписи пользователя в списке людей. Обычная подпись текущей роли в sidebar (`Администратор`, `Репетитор`, `Ученик`) не удаляется.

### Acceptance criteria

- [ ] Admin viewer видит под admin-профилем только `Администратор`.
- [ ] Student/tutor viewer не видит дополнительную роль под admin-профилем.
- [ ] Нигде в карточках людей не остаётся текст `Администратор · Репетитор`.

---

## FR-02. Удалить лишние footer/header элементы

### 2.1. Личный кабинет

Из `DashboardShell` полностью удалить:

```text
TutorGate                         Пространство для роста.
```

Не просто скрыть на отдельных страницах, а убрать общий footer из layout.

### 2.2. Публичные страницы

Полностью убрать footer:

```text
© 2026 TutorGate                  Закрытое пространство обучения
```

### 2.3. Публичный header

Убрать ссылку:

```text
Стать частью TutorGate ↗
```

Бренд/logo TutorGate слева оставить.

### Acceptance criteria

- [ ] Dashboard footer отсутствует на всех desktop/mobile страницах кабинета.
- [ ] Public footer отсутствует на login/apply/forgot/reset/register.
- [ ] CTA `Стать частью TutorGate` отсутствует.
- [ ] Brand TutorGate в public header остаётся.
- [ ] После удаления нет лишнего пустого вертикального пространства и dead CSS.

---

## FR-03. Исправить исчезновение ставки за час

### Проблема

После успешного сохранения `Ставка за час` число исчезает из input и появляется снова только после reload.

### Требуемое поведение

1. При вводе и submit значение остаётся в поле.
2. Во время pending значение не очищается.
3. После server success поле содержит фактически сохранённую ставку.
4. После server error введённое значение также не теряется, пользователь может исправить его и отправить снова.
5. Reload не должен быть нужен для визуальной синхронизации.

### Реализация

Не полагаться на uncontrolled reset React form action. Использовать controlled value либо корректный `reset(savedValue)`/аналог после action.

Предпочтительно action возвращает сохранённое нормализованное значение, чтобы UI устанавливал именно server-accepted rate.

### Acceptance criteria

- [ ] `1000` → Save → `1000` остаётся в input без reload.
- [ ] `1234.50` сохраняется и после success не превращается в пустое поле.
- [ ] При ошибке сети/валидации введённое число не исчезает.

---

## FR-04. I-beam курсор на полях с датой

Для всех `input[type="date"]` при hover должен использоваться текстовый I-beam cursor (`cursor: text`), как у обычного текстового input.

Требование глобальное и должно автоматически работать также в новых формах/диалогах.

При необходимости отдельно переопределить `::-webkit-calendar-picker-indicator`, если браузер поверх части поля показывает другой cursor.

### Acceptance criteria

- [ ] В статистике на `Дата от / Дата до` курсор — I-beam.
- [ ] В новом «Заниматься с» date input курсор — I-beam.
- [ ] Поведение одинаково в Chromium-браузерах.

---

## FR-05. Команда «Перенести…»

### 5.1. Доступность команды

Команда доступна владельцу расписания (tutor/admin для своего календаря) для активного занятия.

Нельзя применять «Перенести…» к:

- исходному уже неактивному перенесённому занятию;
- любому другому неактивному занятию;
- активному занятию, которое уже является target предыдущего переноса (`isTransferTarget=true`).

**Обычный drag&drop target-занятия остаётся разрешён:** запрет касается создания цепочки через повторную команду `Перенести…`.

Если в мультивыделении есть хотя бы одно занятие, к которому перенос запрещён, операция не должна частично применяться — disabled/reject для всей группы.

### 5.2. Окно переноса — одно занятие

По `Перенести…` открыть Dialog с полями:

1. `Неделя`
   - `Текущая неделя — DD.MM–DD.MM`
   - `Следующая неделя — DD.MM–DD.MM`
2. `День` — Пн…Вс выбранной недели.
3. `Начало` — time.
4. `Продолжительность, мин` — целое `1…600`.

`Текущая/Следующая` вычисляются от **реального today в сохранённом schedule offset**, независимо от недели, открытой в UI и независимо от даты исходного занятия.

Начало нормализуется на сетку 5 минут тем же правилом, что и остальное расписание.

### 5.3. Мультивыделение + перенос

Для нескольких выделенных занятий:

- неделя/день/начало задают новую позицию **anchor-занятия**;
- anchor = самое раннее занятие выделения по `startsAt`, при равенстве — стабильный `id`;
- остальные занятия сдвигаются на тот же delta и сохраняют относительные расстояния между собой;
- индивидуальная длительность каждого занятия сохраняется;
- единое поле `Продолжительность` в group mode не применяется; рядом показать пояснение `Длительность каждого занятия будет сохранена.`;
- вся рассчитанная группа должна помещаться в выбранную target-неделю; иначе inline error и submit не выполняется.

Это правило масштабируется на любое число выделенных занятий и совпадает с логикой группового drag.

### 5.4. Что происходит после подтверждения

Операция одной группы должна быть **одной серверной транзакцией**.

Для каждого source:

1. source не удаляется;
2. source получает `inactiveReason="transferred"`;
3. source становится визуально серым и заштрихованным;
4. source показывает явную подпись `Перенесено`;
5. source больше не draggable/selectable/editable;
6. `completed_at` source сбрасывается — неактивное перенесённое занятие не считается проведённым;
7. private note source остаётся у source.

Создаётся target:

- новый UUID;
- тот же tutor;
- тот же student;
- тот же subject;
- тот же `color`;
- private note копируется;
- `completed=false`;
- duration = выбранная для single mode или исходная в group mode;
- `isTransferTarget=true`;
- хранится связь/снимок исходного занятия, достаточный для отображения факта переноса даже если source позже удалят.

### 5.5. Визуал target

Target остаётся активным.

Он должен иметь:

- маленькую иконку стрелки переноса;
- **синюю левую рамку**, независимо от основного `color`;
- обычный фон своего `color`;
- tooltip/details могут показывать `Перенесено с DD.MM, HH:MM`.

Не следует менять `color` target на `blue`, потому что `color` участвует в conflict rules. Синяя рамка — отдельный визуальный marker.

### 5.6. Перенос в следующую неделю и rollover

Это специальное исключение из текущего правила «create только в текущей неделе».

- обычное ручное создание по-прежнему разрешено только в текущей неделе;
- обычный drag в будущую неделю по-прежнему запрещён;
- **только dedicated transfer action** может заранее создать target в следующей неделе.

Rollover должен быть изменён:

- `inactiveReason="transferred"` source **не копировать** в новую неделю;
- поэтому заранее созданный target в следующей неделе не получает дубль;
- active transfer target, если он находится в предыдущей неделе при следующем rollover, копируется как обычная новая recurring lesson, но у копии сбрасывается `isTransferTarget`/transfer metadata;
- `completed=false` как и сейчас.

### 5.7. Конфликты при переносе

Применяются новые conflict classes из FR-07.

Для скрытых student conflicts сервер остаётся источником истины. Если используется magnet, для группы разрешён только **общий delta**: нельзя сдвинуть один target независимо от остальных и разрушить геометрию группы.

Если для всей группы невозможно найти допустимое положение — rollback всей операции.

### Acceptance criteria

- [ ] Single transfer создаёт новую карточку и не удаляет source.
- [ ] Source сразу становится gray + hatched + `Перенесено`.
- [ ] Source нельзя drag/select/edit/complete/recolor/transfer.
- [ ] Source можно открыть read-only и удалить.
- [ ] Target имеет transfer arrow + blue left border.
- [ ] Target нельзя повторно переносить командой `Перенести…`.
- [ ] Target можно корректировать обычным drag/edit, если он активен.
- [ ] Target note скопирована, completed=false.
- [ ] Перенос в следующую реальную неделю разрешён.
- [ ] Rollover не создаёт дубль source в target-week.
- [ ] Group transfer атомарен.

---

## FR-06. Команда «Заниматься с…» и «Отменить заниматься с»

### 6.1. Уровень правила

Правило относится к паре:

```text
tutor_id + student_id
```

Оно не влияет на расписание этого ученика у других репетиторов.

### 6.2. Dialog

По `Заниматься с…` открыть Dialog:

- поле `Сможет заниматься с` — `input[type="date"]`;
- текст пояснения: `Занятия этого ученика до выбранной даты станут неактивными.`;
- primary button `Сохранить`;
- если для ученика уже задано правило — secondary/destructive action `Отменить заниматься с`.

Для мультивыделения:

- собрать **уникальные studentId**;
- одна выбранная дата применяется ко всем этим ученикам у текущего tutor;
- если rules разные, поле не должно ложно показывать одну из дат как общее текущее значение;
- кнопка отмены удаляет правила для всех выбранных учеников, у которых они существуют.

### 6.3. Семантика даты

Если указано `15.09.2026`:

- занятия этого tutor/student с локальной датой старта **до 15.09.2026** становятся неактивными;
- занятия с датой **15.09.2026 и позже** остаются/становятся активными;
- граница включительная: ученик **может заниматься начиная с указанной даты**.

### 6.4. Визуал занятий до даты

Такая карточка:

- `inactiveReason="available_from"`;
- серая;
- заштрихованная;
- визуально не выглядит обычным активным lesson;
- показывает `Сможет заниматься с DD.MM`;
- не draggable;
- не включается в rectangle/multi selection;
- допускает наложение других занятий;
- открывается read-only;
- private note можно посмотреть;
- можно удалить;
- можно вызвать отмену правила для ученика.

### 6.5. Отмена

При `Отменить заниматься с`:

- правило tutor/student удаляется;
- занятия, которые были неактивны **именно по причине `available_from`**, снова становятся активными;
- `transferred` source не должен случайно реактивироваться;
- если реактивация создаёт запрещённый конфликт с уже размещёнными active lessons, сервер обязан выполнить действие атомарно и вернуть понятную ошибку вместо частичной реактивации.

В случае такого конфликта правило остаётся как было, UI откатывается.

### 6.6. Новые/rollover занятия

Пока правило существует:

- вновь создаваемые/копируемые/переносимые занятия этого tutor/student, попавшие до `available_from`, должны получить inactive status `available_from`;
- rollover также должен учитывать rule;
- `transferred` source имеет более высокий приоритет как причина неактивности и не должен превращаться обратно в `available_from`.

### 6.7. Completed и статистика

Занятие, ставшее неактивным по `available_from`, не считается проведённым:

- `completed_at` для затронутого lesson сбрасывается;
- weekly summary активных занятий не учитывает inactive lessons;
- статистика заработка/проведённых занятий не учитывает inactive lessons.

### Acceptance criteria

- [ ] Rule одного tutor не меняет того же student у другого tutor.
- [ ] Все lessons до выбранной даты меняются мгновенно на клиенте.
- [ ] На выбранную дату и позже lessons активны.
- [ ] Multi action дедуплицирует учеников.
- [ ] Есть рабочая кнопка отмены.
- [ ] Cancel реактивирует только `available_from`, но не `transferred`.
- [ ] Rollover учитывает rule.
- [ ] Не возникает частично применённых изменений.

---

## FR-07. Новая модель пересечений: inactive и `coral`

### 7.1. Матрица

| A | B | Можно пересекать? |
|---|---|---:|
| active normal | active normal | Нет |
| active normal | active coral | Да |
| active coral | active normal | Да |
| active coral | active coral | Нет |
| inactive | active normal | Да |
| inactive | active coral | Да |
| inactive | inactive | Да |

`normal` = `default`, `green`, `gray`, `blue` при `inactiveReason=null`.

Правила применяются **и по tutor_id, и по student_id**.

### 7.2. DB constraints

Текущие общие constraints:

- `lessons_tutor_overlap`
- `lessons_student_overlap`

нельзя оставить в существующем виде.

Их необходимо заменить partial GiST exclusion constraints, концептуально:

1. tutor active normal vs active normal;
2. student active normal vs active normal;
3. tutor active coral vs active coral;
4. student active coral vs active coral.

Inactive rows не входят ни в одну conflict constraint.

### 7.3. Серверный magnet

`private.resolve_nearest_lesson_start` и все вызывающие RPC должны учитывать conflict class перемещаемого/создаваемого занятия.

- normal ищет свободный интервал только относительно active normal;
- coral — только относительно active coral;
- inactive не должен вытесняться другими занятиями и сам никого не блокирует.

Скрытые student conflicts по-прежнему проверяются сервером без раскрытия чужих данных.

### 7.4. Клиентский preview

Локальный preview должен использовать ту же матрицу:

- normal drag игнорирует visible coral/inactive;
- coral drag игнорирует visible normal/inactive, но не coral;
- inactive drag вообще не запускается.

### 7.5. Изменение цвета

Изменение color тоже может изменить conflict class.

Пример:

- normal сейчас пересекается с coral;
- пользователь меняет normal → coral;
- результат стал бы coral ↔ coral;
- action обязана завершиться ошибкой и откатить color.

Аналогично coral → normal при пересечении с active normal.

Ошибка должна быть пользовательской, например:

`Нельзя изменить цвет: занятие пересекается с другим занятием этого типа.`

### Acceptance criteria

- [ ] DB разрешает normal ↔ coral.
- [ ] DB запрещает coral ↔ coral для tutor и student.
- [ ] DB разрешает любое пересечение с inactive.
- [ ] Client preview совпадает с DB rules для видимых lessons.
- [ ] Нельзя обойти правила прямой конкурентной записью.
- [ ] Recolor не создаёт недопустимый конфликт.

---

## FR-08. Мультивыделение и массовые действия

### 8.1. Кто может входить в мультивыделение

Rectangle selection / обычное selectable state разрешены только для:

```text
inactiveReason == null && color != "coral"
```

Не входят в мультивыделение:

- inactive lessons;
- `coral` lessons.

Это не делает coral «замороженным»: его можно отдельно открыть, drag, удалить, перекрасить, отметить проведённым и вызвать допустимые single actions.

Inactive можно открыть read-only и удалить, но не менять как активное занятие.

### 8.2. Rectangle selection

При выделении прямоугольником client должен фильтровать карточки через общий `isMultiSelectable(lesson)`; нельзя сначала добавить coral/inactive, а потом молча пропускать их при действии.

### 8.3. Контекстное меню

- ПКМ по карточке, которая уже находится в текущем selection, **не сбрасывает** selection до одного lesson.
- ПКМ по другому normal lesson выбирает только его.
- ПКМ по coral/inactive открывает single-item context без добавления его в multi selection.
- Header меню:
  - single: имя ученика;
  - multi: `Выбрано занятий: N`.

### 8.4. Действия над selection

Должны поддерживаться как минимум:

- drag/move;
- delete;
- color;
- completed/uncompleted;
- `Перенести…`;
- `Заниматься с…`;
- `Ctrl+C`;
- undo/redo результата каждого из этих действий.

### 8.5. Group drag

Если drag начинается на занятии, которое входит в selection из N>1:

- двигается вся группа;
- относительные расстояния по дням/времени сохраняются;
- длительности сохраняются;
- preview показывает всю группу;
- используется общий delta для всех lessons;
- локальный magnet ищет ближайший допустимый **общий** delta с шагом 5 минут;
- при равном расстоянии — более поздний delta, как в текущем magnet;
- если ни одного положения для всей группы нет — ни одно занятие не перемещается;
- в будущую неделю обычным drag всё ещё нельзя.

Server action также обязана проверять группу атомарно и сохранять один общий delta после учёта скрытых student conflicts.

### 8.6. Group delete

- один confirmation не обязателен, если его нет сейчас;
- optimistic remove всех карточек;
- один server transaction;
- ошибка → вернуть всю группу.

### 8.7. Group completed

Правило label/action:

- если **все** выбранные completed → `Снять отметку` и поставить `false` всем;
- иначе → `Отметить проведёнными` и поставить `true` всем.

### 8.8. Group color

Один выбранный цвет применяется всем selected lessons атомарно.

Если выбран `coral`, после success эти карточки больше не являются multi-selectable; selection должен очиститься или удалить из себя ставшие coral IDs.

### 8.9. Editor

Обычный LessonDialog для изменения student/subject/date/duration/note открывается только для одного lesson. При N>1 `Enter/Открыть` не запускает массовый editor.

### Acceptance criteria

- [ ] Rectangle никогда не выбирает inactive/coral.
- [ ] Drag selected group двигает все карточки одним delta.
- [ ] При конфликте одной карточки group move не сохраняется частично.
- [ ] Context actions работают по всему selection.
- [ ] Red/coral остаётся individually draggable.

---

## FR-09. Copy / Paste — `Ctrl+C` + `Ctrl+V`

### 9.1. Общий принцип

Это внутренний clipboard расписания. Не требуется помещать ФИО/заметки в системный OS clipboard.

`Ctrl+C` запоминает выбранную группу внутри client state текущей страницы.

Допустимо также поддержать `Cmd+C / Cmd+V` на macOS, не отменяя обязательные Ctrl shortcuts.

### 9.2. Что копируется

Для каждого source:

- student;
- subject;
- relative start offset;
- duration;
- `color`;
- private note — копируется на сервере по source ID.

Не копируются состояния:

- `completed` → всегда `false`;
- `inactiveReason` → `null`;
- `isTransferTarget` → `false`;
- transfer metadata → `null`.

Поскольку inactive/coral не входят в multi selection, обычный `Ctrl+C` работает по active non-coral selected lessons. Active transfer target может быть скопирован; копия становится обычным lesson без transfer marker.

### 9.3. Anchor вставки — вариант B

После `Ctrl+C` пользователь должен выбрать точку календаря:

- click/tap по пустому месту grid без drag-selection;
- время snap 5 минут;
- UI показывает небольшой ненавязчивый marker точки вставки.

`Ctrl+V`:

1. source anchor = самое раннее copied lesson;
2. copied anchor ставится в выбранную календарную точку;
3. остальные lessons получают тот же delta;
4. сохраняются относительные day/time offsets и durations.

Если точка не выбрана:

`Сначала выберите место в расписании для вставки.`

### 9.4. Ограничение недели

Сохранить текущее бизнес-правило: обычное создание разрешено только в текущей локальной неделе.

Следовательно:

- paste в текущую неделю — разрешён;
- paste в прошлую/будущую — запрещён с понятным toast;
- исключение следующей недели существует только для dedicated `Перенести…`.

### 9.5. Конфликты

Batch paste должен сохранять геометрию группы.

Если скрытый student conflict требует сдвига, сервер ищет ближайший допустимый **общий delta**, а не magnet каждого lesson отдельно.

Если группа целиком не помещается — вставка полностью откатывается.

### 9.6. Optimistic UX

Сразу после `Ctrl+V` карточки появляются на grid с временными client IDs. После server response temp rows заменяются canonical DTO.

Для mapping batch response рекомендуется отправлять `clientKey` на каждую создаваемую карточку.

### Acceptance criteria

- [ ] `Ctrl+C` запоминает selection.
- [ ] Пустой click задаёт видимый paste anchor.
- [ ] `Ctrl+V` мгновенно показывает всю группу.
- [ ] Relative layout сохраняется.
- [ ] Note и color копируются.
- [ ] Completed/transfer/inactive state сбрасываются.
- [ ] Ошибка одного элемента откатывает весь batch.

---

## FR-10. Undo / Redo — `Ctrl+Z`, `Ctrl+Shift+Z`

### 10.1. UI

В toolbar уже есть disabled Undo/Redo buttons. Сделать их рабочими.

Shortcuts:

- `Ctrl+Z` — Undo;
- `Ctrl+Shift+Z` — Redo;
- рекомендуется также `Cmd+Z / Cmd+Shift+Z` на macOS.

Shortcut не перехватывается, если focus находится в:

- `input`;
- `textarea`;
- `select`;
- contenteditable;
- открытом dialog, где браузерное undo редактирования текста должно работать нормально.

### 10.2. Срок жизни истории

История хранится только в памяти текущей schedule session.

Очищается:

- после полного reload;
- после размонтирования/ухода со страницы расписания.

Не хранить историю в DB/localStorage/sessionStorage.

### 10.3. Какие операции входят в историю

Обязательно:

- create lesson;
- edit lesson;
- single/group move;
- delete;
- color;
- completed;
- transfer;
- set `Заниматься с`;
- cancel `Заниматься с`;
- paste;
- изменение schedule offset.

Background sync/polling не добавляется в пользовательскую history.

### 10.4. Реальный server undo

Undo не может быть только `setLessons(previous)`.

После Undo серверное состояние должно соответствовать клиентскому. Например:

- undo delete восстанавливает те же lessons, включая notes/status/metadata;
- undo paste удаляет созданные copies;
- undo transfer удаляет target и реактивирует source;
- undo `Заниматься с` возвращает предыдущие rules и статусы;
- undo edit возвращает старую note;
- redo снова применяет действие.

Для delete/restore необходимо сохранять достаточный server snapshot, включая private note, `completed_at`, color и новые status fields.

### 10.5. История команд

Рекомендуемая модель:

```ts
type ScheduleHistoryEntry = {
  label: string;
  before: ...; // достаточный snapshot/inverse payload
  after: ...;  // redo payload
};
```

Не хранить только визуальные DTO, если этого недостаточно для восстановления DB.

### 10.6. Pending/error

- Пока текущая server mutation не завершена, Undo/Redo можно временно disabled, чтобы не создавать гонку.
- Optimistic визуальное изменение уже произошло, поэтому ожидание сети не блокирует восприятие действия.
- History entry становится подтверждённой после server success.
- При server failure optimistic action откатывается и не попадает в undo stack.
- Новое обычное действие после Undo очищает redo stack.

### 10.7. Конкурентные изменения

Если server не может выполнить Undo из-за внешнего изменения/нового конфликта:

- показать error toast;
- не изображать успешный Undo;
- принять server canonical state;
- недействительный history entry удалить/инвалидировать.

### Acceptance criteria

- [ ] Undo delete восстанавливает занятие после server roundtrip.
- [ ] Redo снова удаляет его.
- [ ] Undo/redo group move сохраняет геометрию.
- [ ] Undo transfer полностью восстанавливает source/target состояние.
- [ ] Reload очищает history.
- [ ] Новое действие после undo очищает redo.

---

## FR-11. Единая валидация без browser popup

### 11.1. Область

Требование распространяется на все пользовательские формы, включая:

- login;
- registration;
- forgot password;
- reset password;
- application;
- hourly rate;
- subject add;
- назначения;
- tutor subjects;
- LessonDialog;
- Statistics custom dates;
- новый TransferDialog;
- новый `Заниматься с` dialog.

### 11.2. Отключить native validation UI

На формах использовать `noValidate` и не позволять браузеру показывать:

- `Заполните это поле.`;
- native min/max popup;
- другие собственные validation bubbles.

HTML attributes (`maxLength`, input type и т.п.) можно оставить как вспомогательные ограничения, но источником пользовательского сообщения является UI TutorGate.

### 11.3. Один UX ошибок

После первой попытки submit:

1. client validation выполняется до запроса;
2. ошибки показываются непосредственно под нужным field;
3. invalid control получает `aria-invalid=true`;
4. error связывается через `aria-describedby`;
5. желательно focus первого invalid field;
6. после первой ошибки при исправлении поля его validation обновляется сразу, без второго submit.

Не показывать field validation только toast-ом.

### 11.4. Zod

Использовать существующие Zod schemas как единый источник правил там, где они уже есть:

- `src/lib/validation/schemas.ts`;
- `src/features/schedule/validation.ts`.

Для новых форм добавить Zod schemas рядом с schedule validation.

Server-side Zod сохраняется обязательно и не заменяется client validation.

### 11.5. Server errors

- field errors от Server Action вливаются в тот же inline error UI;
- общая network/permission/server ошибка — toast + при необходимости form-level message;
- после исправления поля stale server field error должен исчезать.

### 11.6. Внешний вид

Использовать один класс/компонент для inline ошибки (`field-error`/общий Field API). Не смешивать для одинаковых ошибок произвольные `form-error`, browser bubble и toast.

### Acceptance criteria

- [ ] Скриншотный browser popup `Заполните это поле.` больше нигде не появляется.
- [ ] Пустой Telegram/login/password/rate/date показывает TutorGate inline error.
- [ ] LessonDialog и public forms визуально используют одинаковый pattern.
- [ ] Server validation по-прежнему работает при обходе client validation.

---

## FR-12. Убрать wait-cursor у loading buttons

Удалить глобальное правило:

```css
.button[aria-busy="true"] { cursor: wait; }
```

Сохранить:

- spinner `Loader2`;
- `aria-busy`;
- disabled/защиту от повторного клика;
- loadingText.

Не удалять сам loading indicator.

### Acceptance criteria

- [ ] Ни одна loading button не включает системный animated wait cursor.
- [ ] Spinner внутри button остаётся.
- [ ] Double submit во время pending невозможен.

---

## FR-13. Чистый success-state публичных форм

### Проблема

Сейчас success component рендерится внутри формы, но page-level `auth-heading`, back link и другие элементы остаются на экране. Получается дублированный экран как на скриншоте 7.

### Требуемое поведение

После `state.success` внутри auth/application card оставить **только success-state данного flow**.

Скрывать/не рендерить предыдущие:

- back link;
- section icon страницы;
- eyebrow страницы;
- page title;
- page description;
- role tabs;
- bottom `Уже есть аккаунт?` / аналогичный pre-success footer внутри карточки.

Собственные элементы success-state остаются:

- success icon;
- success title;
- success text;
- success action/button;
- необходимые пояснения success flow.

### Flows

Обязательно проверить:

- forgot-password → только `Проверьте Telegram` state;
- reset-password → только `Пароль изменён` state, без `ВОССТАНОВЛЕНИЕ ДОСТУПА / Новый пароль / ...` сверху;
- apply → только success подтверждения Telegram;
- register → только success регистрации.

Login успешно redirect-ит и отдельного success-state не требует.

### Реализация

Допустимы варианты:

- поднять success state на уровень card/page;
- передавать callback state наружу;
- общий PublicAuthCard, который знает success state.

Не строить решение только на хрупком визуальном перекрытии старого контента.

### Acceptance criteria

- [ ] После forgot success на card нет старого заголовка `Забыли пароль?`.
- [ ] После reset success на card нет `Новый пароль` и старого description.
- [ ] После application success нет `Заявка в TutorGate` и role tabs.
- [ ] Success state остаётся центрированным и визуально соответствует текущему дизайну.

---

## FR-14. Расписание: мгновенный optimistic client UX

### 14.1. Основное правило

Все действия внутри расписания должны сначала изменить локальный UI и только затем ждать server response.

Это относится к:

- create/edit;
- drag;
- group drag;
- delete;
- completed;
- color;
- transfer;
- `Заниматься с` / cancel;
- paste;
- undo/redo;
- schedule offset.

### 14.2. Запрещено

Для обычной schedule mutation нельзя:

- ждать response перед изменением карточки;
- делать `router.refresh()`;
- использовать `revalidatePath` для обновления grid;
- заменять расписание полным RSC reload;
- показывать исчезновение grid во время save.

### 14.3. SaveState

Сохранить единый индикатор:

- `Сохранение…`;
- `Сохранено`;
- `Не сохранено`.

### 14.4. Ошибка

При server error:

1. откатить ровно optimistic mutation;
2. показать toast;
3. `saveState="error"`;
4. не оставлять половину group action;
5. не записывать failed action в history.

### 14.5. Canonical server response

Server response остаётся источником истины для:

- magnet shift из-за скрытого student conflict;
- canonical IDs созданных lessons;
- DB-normalized status.

После ответа заменить optimistic temp DTO на canonical DTO без refresh.

### 14.6. Атомарность batch

Group move/delete/color/completed/transfer/availability/paste/undo/redo должны быть транзакционными:

```text
успех всех элементов
или
ошибка и отсутствие любых частичных изменений
```

Использовать текущий advisory-lock подход schedule writers там, где он необходим для сохранения конкурентных инвариантов.

### Acceptance criteria

- [ ] На медленной сети карточка двигается/исчезает/появляется сразу.
- [ ] Нет полной перезагрузки страницы после schedule mutation.
- [ ] Ошибка возвращает UI в исходное состояние.
- [ ] Batch никогда не остаётся частично сохранённым.

---

# 6. Требования к базе данных

## DB-01. Новая migration

Не редактировать уже применённые `005/006` migrations.

Создать следующую append-only migration, например:

```text
supabase/migrations/202609050007_schedule_features.sql
```

## DB-02. `lessons`: новые поля

Добавить эквивалент следующих данных:

- inactive reason;
- inactive-until/date для UI;
- marker transfer target;
- nullable source lesson relation;
- snapshot исходного start для отображения истории переноса.

Existing rows backfill:

```text
inactive_reason = NULL
is_transfer_target = false
```

## DB-03. Tutor/student availability rule

Добавить таблицу уровня tutor/student, например:

```text
public.tutor_student_schedule_rules
- tutor_id uuid
- student_id uuid
- available_from date not null
- created_at
- updated_at
PRIMARY KEY (tutor_id, student_id)
```

Writes только через owner-checked RPC. Не давать пользователю менять rule другого tutor.

## DB-04. Partial exclusion constraints

Заменить старые универсальные overlap constraints четырьмя partial constraints для `normal` и `coral`, отдельно для tutor/student.

Inactive rows должны быть исключены из constraints.

Обязательно протестировать миграцию на existing data до добавления новых constraints.

## DB-05. Resolver

Изменить/добавить SQL helper так, чтобы он принимал conflict class или достаточные параметры (`color`, active state) и искал nearest slot только среди rows той же blocking class.

Для batch/group нужен resolver общего delta, а не независимый resolver каждого lesson.

## DB-06. Dedicated RPC для transfer

Нужна owner-checked server transaction, которая:

1. lock source rows;
2. валидирует, что source active и не transfer target;
3. разрешает target только current/next local week;
4. находит валидный group placement;
5. updates sources to transferred inactive;
6. inserts targets;
7. копирует notes;
8. возвращает normalized source + target DTOs.

## DB-07. Dedicated RPC для availability

Операция принимает список уникальных student IDs и date либо cancel mode.

Должна в одной транзакции:

- upsert/delete rules;
- обновить соответствующие lessons;
- сохранить `transferred` inactivity;
- проверить constraints при реактивации;
- вернуть canonical changed lessons/rules.

## DB-08. Batch schedule mutations

Для атомарных массовых действий нужны batch-capable RPC/action contracts как минимум для:

- move;
- color;
- completed;
- paste/copy;
- restore/undo where necessary.

Не выполнять N независимых Server Actions из клиента, если при ошибке пятого элемента первые четыре уже останутся сохранёнными.

## DB-09. Notes

Private notes нельзя включать в общий student DTO.

При transfer/paste/restore notes копируются/восстанавливаются внутри owner-checked server operation.

Student по-прежнему не получает private note.

## DB-10. Rollover

Обновить `private.rollover_tutor`:

- skip `inactive_reason='transferred'`;
- availability-inactive recurring slot можно копировать, но status новой строки вычисляется по актуальному rule target-week;
- copy transfer target как обычный recurring lesson без transfer marker;
- notes/color/duration сохраняются;
- completed сбрасывается;
- existing idempotency `schedule_week_rollovers` сохранить.

---

# 7. Client/API contracts

## 7.1. `ScheduleData`

Для owner schedule добавить текущие availability rules, чтобы UI мог показать `Отменить заниматься с` даже на lesson, который уже находится после даты:

```ts
studentAvailability?: Array<{
  studentId: string;
  availableFrom: string;
}>;
```

Student DTO может получать только уже вычисленные status fields lesson; отдельные owner rules ему не нужны.

## 7.2. Batch result

Текущий `ScheduleResult` ориентирован на один `lesson`. Расширить contract, например:

```ts
interface ScheduleResult {
  error?: string;
  errors?: Record<string, string[]>;
  lesson?: ScheduleLesson;
  lessons?: ScheduleLesson[];
  ids?: string[];
  rules?: Array<{ studentId: string; availableFrom: string | null }>;
  shifted?: boolean;
  // при batch при необходимости — requested/canonical mapping по clientKey
}
```

Не обязательно использовать именно эти имена, но batch response должен позволять без refresh полностью синхронизировать local state.

## 7.3. Shared eligibility helpers

Не размазывать проверки по JSX. Вынести чистые функции, например:

```ts
isInactive(lesson)
isMultiSelectable(lesson)
isTransferAllowed(lesson)
conflictClass(lesson)
```

Клиентские rules должны иметь unit tests.

---

# 8. Визуальные требования расписания

## 8.1. Inactive card

- gray surface;
- hatch/diagonal stripes;
- muted text;
- не использовать только opacity: состояние должно быть однозначно видно;
- cursor не `grab`;
- отсутствие selected outline;
- pointer action click = read-only details;
- source transferred: label `Перенесено`;
- availability: label `Сможет заниматься с DD.MM`.

Не использовать gradients для декоративного дизайна проекта, но техническая штриховка может быть реализована CSS repeating pattern только как state indicator. Если проектное правило «без gradients» трактуется буквально, сделать штриховку псевдоэлементом/линейным SVG pattern без изменения общей visual system.

## 8.2. Transfer target

- обычный background своего color;
- left border blue (`blue` token существующего расписания);
- arrow icon перед именем/в status line;
- blue border не меняет `lesson.color`.

## 8.3. Overlap rendering

Поскольку normal ↔ coral и active ↔ inactive могут физически совпадать по времени, карточки не должны полностью перекрывать друг друга так, чтобы нижняя стала недоступной.

Требуется понятный layout overlap внутри одного day column:

- вычислять lane/width для одновременно видимых cards;
- минимум две пересекающиеся cards показываются рядом/со смещением;
- каждую можно открыть мышкой;
- z-index не должен навсегда скрывать inactive/coral под normal.

Для cross-midnight segment lane рассчитывается на каждом отображаемом day segment.

## 8.4. Student schedule

Read-only student calendar также показывает:

- transferred source state;
- transferred target marker;
- `Сможет заниматься с ...`;
- overlap layout.

Но никаких owner controls student не получает.

---

# 9. Keyboard bindings

Обновить Dialog `Бинды`.

Минимальный список:

| Действие | Shortcut |
|---|---|
| Выбрать занятие | ЛКМ / tap |
| Выбрать несколько | Протянуть область |
| Переместить | Drag |
| Удалить выбранные | Delete |
| Копировать | Ctrl+C |
| Вставить в выбранную точку | Ctrl+V |
| Отменить действие | Ctrl+Z |
| Вернуть действие | Ctrl+Shift+Z |
| Снять выделение | Escape |
| Открыть single selected | Enter |
| Context menu | ПКМ / long press |

Если добавляется macOS support, можно отображать `Ctrl/Cmd` в подсказке.

---

# 10. Ошибки и тексты

Рекомендуемые user-facing сообщения:

- `Это занятие неактивно и не может быть перемещено.`
- `Перенесённое занятие нельзя переносить повторно.`
- `Часть выбранных занятий нельзя перенести.`
- `В выбранном интервале нет места для всей группы.`
- `Нельзя изменить цвет: занятие пересекается с другим занятием этого типа.`
- `Сначала выберите место в расписании для вставки.`
- `Вставлять занятия можно только в текущей неделе.`
- `Не удалось отменить ограничение: после активации занятия пересекаются.`
- `Не удалось отменить последнее действие.`
- `Не удалось вернуть действие.`

Не выводить raw PostgreSQL/Supabase error пользователю.

---

# 11. Тестирование

## 11.1. Unit tests

Добавить проверки:

- `conflictClass`;
- `isMultiSelectable`;
- group anchor/delta calculation;
- group preview geometry;
- paste relative offsets;
- availability date comparison;
- history reducer undo/redo stacks;
- redo cleared after new action;
- temp → canonical replacement.

## 11.2. Database tests

Обязательная матрица tutor и student constraints:

1. normal + normal overlap → reject;
2. normal + coral overlap → allow;
3. coral + coral overlap → reject;
4. active + inactive overlap → allow;
5. inactive + inactive overlap → allow.

Transfer:

- current week target → allow;
- next week target → allow;
- week after next → reject;
- source becomes inactive transferred;
- target note copied;
- target completed=false;
- transfer target cannot be transferred again;
- group failure rolls back all;
- rollover after next-week transfer does not duplicate source.

Availability:

- affects only current tutor/student;
- lessons before date inactive;
- date itself active;
- cancel reactivates only `available_from`;
- transferred source remains inactive;
- reactivation conflict rolls back entire cancel;
- rollover respects rule.

Undo/restore:

- restore deleted row with same owner and note;
- cannot restore/write another tutor's lesson;
- batch restore atomic.

## 11.3. E2E

Минимальные сценарии Chromium desktop + mobile sanity:

1. admin label;
2. removed footers/header CTA;
3. rate stays visible after save;
4. invalid required form shows inline error, no browser bubble;
5. forgot-password success has no old heading;
6. application success has no old heading/tabs;
7. transfer current week;
8. transfer next week;
9. target cannot `Перенести…` again;
10. availability set/cancel;
11. inactive overlay with active lesson;
12. normal overlay coral;
13. coral↔coral prevented;
14. rectangle excludes coral/inactive;
15. group drag;
16. group delete;
17. Ctrl+C → click anchor → Ctrl+V;
18. Ctrl+Z/Redo for delete/move/paste/transfer;
19. optimistic card changes before delayed server response;
20. server error rollback.

## 11.4. Команды перед сдачей

В соответствии с правилами репозитория выполнить и зафиксировать результат:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:docs
npm run build
npm run test:e2e
```

Не отмечать проверку успешной, если команда фактически не запускалась.

---

# 12. Документация после реализации

Обновить минимум:

- `docs/architecture.md`
  - conflict classes;
  - optimistic batch operations;
  - transfer exception next week;
  - undo/redo;
- `docs/database.md`
  - новые lesson fields;
  - tutor/student availability table;
  - partial exclusion constraints;
  - новые RPC;
- `docs/ui-guidelines.md`
  - inactive/transfer visuals;
  - validation contract;
  - loading cursor rule;
- `AGENTS.md`
  - удалить устаревшее утверждение, что все lessons одинаково блокируют overlap;
  - зафиксировать exception transfer → next week;
  - зафиксировать, что inactive/coral имеют отдельные conflict rules.

Existing migrations не переписывать задним числом.

---

# 13. Definition of Done

Пакет считается завершённым только если одновременно выполнено всё ниже:

- [ ] все 13 исходных пожеланий заказчика реализованы;
- [ ] уточнения из раздела 2 соблюдены;
- [ ] public/dashboard лишние элементы удалены, а не просто случайно скрыты на одном breakpoint;
- [ ] ставка после save не исчезает;
- [ ] browser validation popup нигде не используется;
- [ ] loading button не включает wait cursor;
- [ ] success pages не показывают старый heading вместе с success-state;
- [ ] transfer source/target имеют корректные состояния и rollover не создаёт дубль;
- [ ] «Заниматься с» и cancel работают для одного и нескольких учеников;
- [ ] inactive/coral overlap rules защищены на уровне PostgreSQL;
- [ ] inactive и coral не входят в multi selection;
- [ ] group actions атомарны;
- [ ] Ctrl+C/Ctrl+V работают по anchor-модели B;
- [ ] Ctrl+Z/Ctrl+Shift+Z меняют и client, и server state;
- [ ] undo history очищается после reload;
- [ ] schedule mutations отображаются optimistic до server response;
- [ ] при server failure UI полностью откатывается;
- [ ] student read-only schedule корректно показывает новые статусы;
- [ ] RLS/owner checks/private notes security не ослаблены;
- [ ] unit + DB + E2E регрессии добавлены;
- [ ] lint/typecheck/tests/build/e2e реально выполнены перед сдачей;
- [ ] документация обновлена и не противоречит реализации.

---

## 14. Что не входит в этот пакет

Если отдельно не согласовано, не реализовывать в рамках данного ТЗ:

- общий отчёт по ученику из disabled пункта context menu;
- перенос lesson между разными tutor;
- системный clipboard с персональными данными;
- persistent undo history между reload;
- разрешение обычного create/paste/drag в будущую неделю;
- изменение механики Telegram/auth, не связанное с validation/success layout;
- redesign общей цветовой темы TutorGate.

