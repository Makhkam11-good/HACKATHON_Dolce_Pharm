#!/usr/bin/env bash
# Поднимает всё после перезагрузки ПК одной командой:
#   1) запускает Docker Desktop (Windows), если он не запущен, и ждёт его готовности;
#   2) перевыпускает HTTPS-сертификат, если сменился LAN IP (другая сеть Wi-Fi);
#   3) запускает db + backend + nginx + Cloudflare Tunnel;
#   4) печатает адреса для ПК и телефона.
# Запуск из корня проекта:  bash scripts/start.sh
set -e
cd "$(dirname "$0")/.."

# --- 1. Docker
if ! docker info >/dev/null 2>&1; then
  DD="/c/Program Files/Docker/Docker/Docker Desktop.exe"
  if [ -f "$DD" ]; then
    echo "Запускаю Docker Desktop…"
    "$DD" >/dev/null 2>&1 &
  else
    echo "Docker не запущен. Запустите Docker Desktop вручную и повторите." >&2
  fi
  echo -n "Жду Docker"
  for _ in $(seq 1 90); do
    docker info >/dev/null 2>&1 && break
    echo -n "."
    sleep 2
  done
  echo
  docker info >/dev/null 2>&1 || { echo "Docker так и не запустился за 3 минуты. Откройте Docker Desktop и повторите." >&2; exit 1; }
fi
echo "Docker готов."

# --- 2. Сертификат под текущий LAN IP
[ -f .env ] || cp .env.example .env
IP=$(bash scripts/lan-ip.sh)
# mkcert, поставленный через winget, может не попасть в PATH Git Bash
if ! command -v mkcert >/dev/null 2>&1 && [ -n "$LOCALAPPDATA" ]; then
  for d in "$(cygpath "$LOCALAPPDATA" 2>/dev/null)"/Microsoft/WinGet/Packages/FiloSottile.mkcert_*; do
    [ -x "$d/mkcert.exe" ] && PATH="$PATH:$d"
  done
fi
cert_has_ip() { openssl x509 -in nginx/certs/cert.pem -noout -text 2>/dev/null | grep -q "IP Address:$IP\b"; }
if [ ! -s nginx/certs/cert.pem ] || ! cert_has_ip; then
  if command -v mkcert >/dev/null 2>&1; then
    echo "LAN IP $IP — перевыпускаю сертификат…"
    bash scripts/make-certs.sh "$IP" >/dev/null
    CERT_CHANGED=1
  else
    echo "Внимание: mkcert не найден, сертификат для $IP не обновлён (https://localhost и туннель работают)."
  fi
fi

# --- 3. Контейнеры и туннель
docker compose --profile tunnel up -d
[ -n "$CERT_CHANGED" ] && docker compose restart nginx >/dev/null

echo -n "Жду сервер"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q backend)" 2>/dev/null)" = healthy ] && break
  echo -n "."
  sleep 2
done
echo

since=$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose --profile tunnel ps -q tunnel)")
url=""
for _ in $(seq 1 60); do
  url=$(docker compose --profile tunnel logs --no-color --since "$since" tunnel 2>/dev/null \
        | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] && break
  sleep 2
done

# --- 4. Итог
echo
echo "================ Готово ================"
echo "ПК:                     https://localhost"
echo "Телефон, тот же Wi-Fi:  https://$IP   (нужен установленный rootCA)"
if [ -n "$url" ]; then
  echo "Телефон, любая сеть:    $url"
else
  echo "Телефон, любая сеть:    адрес туннеля не получен — повторите: bash scripts/tunnel.sh"
fi
echo "Вход: op01 / demo123 (сотрудник), methodist / demo123 (методист)"
echo
echo "Если адрес туннеля изменился — на телефоне установите приложение заново и заново скачайте курсы."
