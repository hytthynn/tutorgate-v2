# Развёртывание upgrade 006

1. Сделайте backup БД и проверьте восстановление на staging.
2. Node 24, `npm ci` из оригинального lockfile. Версии пакетов не менялись.
3. Примените миграции по порядку; если 001–005 уже применены, нужна только 006. Старые миграции не изменялись.
4. Включите Supabase Cron/pg_cron. 006 регистрирует job, если расширение доступно. При WARNING выполните supabase/ops/enable_schedule_cron.sql от владельца БД.
5. Выполните supabase/ops/verify_schedule_cron.sql. Без успешного Cron фонового SLA ≤5 минут нет. Ensure при открытии/мутации — fallback, а не замена Cron.
6. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. E2E используют изолированные fixtures, никогда не production DB.
7. На staging проверьте два tutor с общим student, физическое удаление предмета с completed lessons, приватность notes и локальный понедельник при разных offsets.
8. Схема и приложение — один релиз, контракты RPC меняются. При rollback учитывайте, что физически удалённые subjects восстанавливаются только из backup. Blind down migration не предусмотрена.

## Эксплуатация
- Нужен мониторинг cron.job_run_details, skipped_count и длительности job. При простое Cron больше недели не восстанавливается цепочка всех пропущенных недель: источник — непосредственно предыдущая текущей неделя.
- Один advisory lock сериализует schedule writes; измеряйте время выполнения при росте нагрузки.
- Таблица rollover имеет RLS; private helpers не должны экспонироваться через PostgREST.
- Полная CI-проверка этой ревизии в среде без npm-зависимостей не подтверждена; детали verification.md.
