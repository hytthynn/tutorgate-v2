# Визуальная система

Warm dark / mocha. Основные tokens в `src/app/globals.css`:

| Назначение | Значение |
|---|---|
| Background | #17130f |
| Surface | #1e1914 |
| Raised surface | #251e18 |
| Text | #f2e8dc |
| Secondary text | #b8aa9b |
| Accent | #d39a59 |
| Accent hover | #dda667 |
| Danger | #d9776a |
| Border | rgba(244,224,203,.10) |

Geist через next/font, кириллица и latin. Body 14px; подписи 11–13px, page title 22–24px. Основная сетка отступов 4/8/12/16/20/24/32/40px. Radius: inputs/buttons 8px, cards/dialogs 10px, badges 5–6px. Цвет текста не чисто белый, фон не абсолютный чёрный.

На desktop sidebar 236px, на небольших desktop 216px, на mobile Radix Dialog в виде бокового Sheet. Контент ограничен 1472px. Поля и кнопки mobile не менее 40–44px по высоте. Табличные строки становятся карточками без горизонтальной прокрутки.

Вход и заявка — компактные формы в центре. Карамель используется для основного действия, выбранных предметов, тонких деталей и focus. Списки и управление используют secondary buttons. Danger зарезервирован для удаления предметов.

Dialogs ограничены высотой viewport, внутреннее содержимое прокручивается. Radix обеспечивает focus trap, Escape, возврат фокуса и accessible title. Формы имеют label, autocomplete, inline field errors, server pending states и глобальный toast. Не добавлять неподписанные иконки-действия.

Recharts: одна карамельная серия, тонкая горизонтальная сетка, muted axis, тёмный tooltip. Пока нет занятий — KPI=0 и явное empty state, без искусственных точек данных. Периоды/метрика/репетитор применяются сразу через router.replace. Свой период отправляется только с валидной парой дат.

Допустимы тонкие границы и небольшой контраст поверхностей. Запрещены gradients, glow, blur, glassmorphism, неон, большие тени, oversized заголовки, emoji вместо Lucide. Motion минимален и отключается через prefers-reduced-motion.

Браузерные проверки предусмотрены на 375, 768, 1280 и 1440px; артефакты screenshot — локальная `artifacts/`, исключена из Git.


Select/Combobox: case-insensitive поиск только для учеников/репетиторов, не для предметов; ArrowUp/Down, Enter, Esc, возврат фокуса. Popup портируется в body либо Radix focus scope. Dialog не использует transform, поэтому fixed popup не обрезается. Toast success 3с, info/warning 4с, error 5с; дедупликация и закрытие; на mobile сверху.

## Состояния 007

Button loading: Loader2.spin + disabled + aria-busy, понятный loadingText; icon-only заменяет иконку spinner и сохраняет accessible name. asChild не получает loading. Отмена/навигация/dialog triggers без spinner.

Save status: постоянно видимые «Сохранено» (спокойный зелёный), «Сохранение…» (spinner), «Не сохранено» (danger); role=status, aria-live=polite, aria-atomic. Padding карточек 0 4px сохранён; CircleCheck присутствует только у проведённых занятий. Add tooltip только для прошлой/будущей недели. В кабинете ученика admin-tutor показывается без строки роли; sidebar не меняется.
