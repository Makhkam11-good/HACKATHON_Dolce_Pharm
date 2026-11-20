#!/usr/bin/env bash
# Поднимает приложение вместе с Cloudflare Tunnel и печатает публичный адрес https://*.trycloudflare.com.
# Телефон открывает этот адрес из любой сети без установки сертификатов.
# Адрес меняется при каждом перезапуске туннеля. Остановить туннель: docker compose stop tunnel
set -e
cd "$(dirname "$0")/.."

docker compose --profile tunnel up -d --build

# Адрес надо искать только в логах текущего контейнера: после перезапуска в старых логах остаётся прежний адрес
since=$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose --profile tunnel ps -q tunnel)")

echo "Жду публичный адрес от cloudflared…"
url=""
for _ in $(seq 1 60); do
  url=$(docker compose --profile tunnel logs --no-color --since "$since" tunnel 2>/dev/null \
        | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] && break
  sleep 2
done

if [ -z "$url" ]; then
  echo "Не удалось получить адрес за 2 минуты. Логи туннеля: docker compose --profile tunnel logs tunnel" >&2
  exit 1
fi

echo
echo "Публичный адрес: $url"
echo "  Откройте его на телефоне (Chrome или Safari) и установите PWA."
echo "  Проверка API:  $url/api/health"
echo "  При перезапуске туннеля адрес меняется: PWA нужно установить заново и заново скачать курсы."
