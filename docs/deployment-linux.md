# Автоматический деплой на Linux через Docker

Push в `main` запускает `.github/workflows/deploy.yml`: lint, TypeScript, unit/DB-тесты, ссылки документации, E2E на локальных fixtures, затем сборку Next.js standalone в Docker. Образ передаётся по SSH без registry и PAT. Compose запускает приложение и Caddy с автоматическим HTTPS. Сервер должен быть **Linux amd64**, поскольку образ собирается на amd64 runner.

## Однократная подготовка сервера

1. Установить [Docker Engine и Compose plugin](https://docs.docker.com/engine/install/). Нужен Compose **2.30+**: секреты читаются через [env_file format: raw](https://docs.docker.com/reference/compose-file/services/#format), без подстановки `$` и обработки кавычек. Также нужны Bash, curl, gzip и flock (util-linux).
2. Создать отдельного SSH-пользователя, например `deploy`, с домашней папкой и доступом к Docker без sudo. Членство в группе docker даёт административный доступ к хосту. Проверить из новой сессии: `docker info` и `docker compose version`.
3. Добавить публичную часть выделенного SSH-ключа в `~deploy/.ssh/authorized_keys`. Приватную часть сохранить только в GitHub Secrets. Пользователь должен иметь право записывать в `$HOME/tutorgate`.
4. Использовать публичный IPv4 сервера или направить DNS A домена на сервер. Открыть TCP 80/443 и SSH-порт, при необходимости UDP 443. Порты 80/443 должны быть свободны. Порт приложения 3000 наружу не публикуется.
5. Проверить fingerprint SSH host key через консоль провайдера. Сохранить проверенную строку known_hosts. Для нестандартного порта формат имени — `[hostname]:port`. Не доверять результату ssh-keyscan без сверки fingerprint.

## GitHub Secrets

В репозитории открыть **Settings → Secrets and variables → Actions → New repository secret** ([документация GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)).

| Secret | Значение |
| --- | --- |
| `SSH_HOST` | IPv4 или DNS-имя сервера |
| `SSH_USER` | Например `deploy` |
| `SSH_PORT` | Необязательно, по умолчанию `22` |
| `SSH_PRIVATE_KEY` | Полный приватный OpenSSH-ключ без passphrase для выделенного deploy-пользователя |
| `SSH_KNOWN_HOSTS` | Проверенная строка known_hosts для сервера |
| `APP_URL` | Например `https://2.26.3.180` или `https://tutor.example.org`, без пути и нестандартного порта |
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Публичный publishable/anon ключ, доступный браузеру |
| `SUPABASE_SECRET_KEY` | Серверный secret/service_role ключ |
| `TELEGRAM_BOT_TOKEN` | Токен бота |
| `TELEGRAM_BOT_USERNAME` | Имя бота без `@` |
| `TELEGRAM_WEBHOOK_SECRET` | 1–256 символов: латинские буквы, цифры, `_`, `-` |
| `AUTH_ALIAS_DOMAIN` | Необязательно, по умолчанию `auth.tutorgate.internal`; для существующей БД сохранить прежнее значение |
| `LATEX_RENDER_URL` | Необязательно: HTTPS endpoint отдельного [LaTeX-сервиса](latex-renderer.md) |
| `LATEX_RENDER_TOKEN` | Вместе с URL; минимум 32 символа |

Все значения приложения однострочные, без внешних кавычек. Приватный SSH-ключ и known_hosts могут быть многострочными. Серверные секреты не передаются Docker build, не включаются в образ и не сохраняются в Actions artifacts. Два `NEXT_PUBLIC_*` значения фиксируются при сборке и доступны браузеру. После изменения любых Secrets запустить workflow заново.

Доступ по IP использует HTTPS: Caddy явно запрашивает сертификат Let’s Encrypt с профилем `shortlived`. [Сертификаты для IP](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability) действуют около шести дней и автоматически обновляются Caddy; его постоянный volume и открытые порты 80/443 нужны для продления. Требуется Caddy с поддержкой ACME profiles (на сервере проверен 2.11.4). HTTP перенаправляется на HTTPS, production-cookie остаётся Secure. При переходе на домен поменять APP_URL в GitHub Secrets и повторить деплой и настройку Telegram webhook.

## Первый запуск и эксплуатация

Применить необходимые миграции Supabase по порядку до 020 включительно и проверить Auth/RLS/Storage по [инструкции](deployment-vercel.md#1-подготовить-supabase). Откат Git не откатывает БД; workflow намеренно не запускает миграции production автоматически.

После заполнения Secrets: **Actions → Deploy Linux → Run workflow → main**, либо push в `main`. Первый запуск без Secrets завершится ошибкой с именем недостающего значения. Workflow не деплоит произвольные ветки при ручном запуске.

Релизы находятся в `$HOME/tutorgate/releases`, успешный — по ссылке `$HOME/tutorgate/current`. Проверяются healthcheck `/login` и внешний HTTPS. При ошибке запуска или HTTPS предыдущий релиз восстанавливается вместе со своим runtime.env. Первый неудачный запуск останавливается. Возможен короткий перерыв при замене контейнера; это не zero-downtime deployment. Healthcheck проверяет HTTP, а реальный вход, БД и Telegram нужно проверить отдельно.

После первого успешного запуска или смены домена/бота настроить webhook на сервере:

```bash
cd ~/tutorgate/current
docker compose --env-file deploy.env exec -T app node scripts/set-webhook.mjs
```

Настроить часовой запуск очистки вложений через `crontab -e` deploy-пользователя (заменить `/home/deploy` своим HOME):

```cron
0 * * * * cd /home/deploy/tutorgate/current && /usr/bin/flock -n /home/deploy/tutorgate/cleanup.lock /usr/bin/docker compose --env-file deploy.env exec -T app node scripts/cleanup-chat-storage.mjs
```

Cron самой БД остаётся в Supabase. LaTeX-брокер с Docker-доступом запускается на **отдельном** хосте согласно [его инструкции](latex-renderer.md).

Логи и состояние:

```bash
cd ~/tutorgate/current
docker compose --env-file deploy.env ps
docker compose --env-file deploy.env logs --tail=100 app proxy
```

Старые релизы и образы сохраняются для отката. Контролировать свободное место; удалять старые релизы вручную после проверки, сохраняя текущий и предыдущий. В старых runtime.env остаются прежние секреты. Не запускать `docker system prune -a` перед проверкой возможности отката. Сертификаты Caddy находятся в постоянных Docker volumes, `down -v` их удалит.

В исходной версии приложения вне Vercel IP rate limit использует общий bucket `local`; identity limit сохраняется. При большой нагрузке это может ограничивать разных пользователей совместно. Заголовкам клиента приложение не доверяет.

## Проверка конфигурации 14.09.2026

Локально прошли lint, typecheck, 169 unit/DB-тестов, test:docs и production build. YAML разобран парсером, actionlint и `bash -n deploy/deploy.sh` прошли. Полный E2E: 102/103; оставшийся тест использовал неоднозначный селектор двух status на странице настроек. После уточнения селектора его отдельный повтор прошёл 1/1; полный набор после этого не повторялся. Docker отсутствует в локальной среде, поэтому сборка контейнера и реальный SSH/HTTPS-деплой здесь не проверены. Логи локальных проверок: `artifacts/linux-deployment/` (не включены в Git).
