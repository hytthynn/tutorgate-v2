# Проверки пакета 011

Дата: 06.09.2026. [ТЗ](TZ_TutorGate_011_chat_bot_and_compact_ui.md), [установка и smoke test](release-011.md).

Код включён в архив. Полная production-сборка НЕ подтверждена. Точные зависимости проекта отсутствуют, npm registry недоступен. Старые успешные логи 009/010 не являются проверкой 011.

## Фактические результаты

**Пройдено: 54/54 быстрых теста, проверка Markdown-ссылок и синтаксическая трансформация 140 файлов.**

Логи текущего повторного прогона: `docs/verification-011-logs`. Быстрые тесты запускаются на предустановленном tsx/Zod, а не полном locked dependency tree. Итоговые количества — unit.log; проверка Markdown-ссылок — test-docs.log. Syntax transform проверяет разбор кода, но не заменяет semantic typecheck.

npm ci --offline --ignore-scripts: ENOTCACHED; сетевой npm в первом прогоне: DNS ENOTFOUND. Отсутствуют Next, ESLint, @playwright/test, PGlite и React types. Поэтому lint/build/typecheck/полный npm test/E2E не считаются пройденными. Добавленные DB/E2E тесты необходимо выполнить в CI после npm ci. Production Supabase/Telegram не использовались.

## Покрытие

- Каталог /start, секретные URL только в keyboard, HTML escaping, long-message split.
- Sentinel нового draft, пустые select и существующий исторический предмет.
- Picker/cancel, Reply, duplicate, oversize/attachments, tutor/admin запрет ответа из бота, ошибки записи и уведомления.
- DB: миграции 001–011, unique pair, RLS/service grants, лимит 4000, tail 200, bounded read marker, отзыв назначения и blocked accounts.
- E2E fixtures обновлены для Bot API message_id/callback_query; добавлены сценарии roundtrip, badge/polling, failed delivery, responsive.

## UI

Изолированные React/CSS превью проверяют только компоновку, не Next/Supabase-интеграцию. Перед перезапуском среды осмотрены desktop/mobile: исправлены textarea и постоянная плашка 200 сообщений. Финальные изолированные превью чата (1280/390px), empty state и четырёх справочников осмотрены и сохранены в verification-011-logs/visual. Горизонтального overflow в этих fixtures нет. Иконки/кнопки и серверные вызовы подменены; справочники — CSS-fixtures, это не запуск настоящих Next-страниц. Полный E2E обязателен.

Рабочая среда дважды перезапускалась; результат восстановлен из сохранённого checkpoint, доступные проверки повторены. Неисполненные staging-проверки перечислены в release-011.md.
