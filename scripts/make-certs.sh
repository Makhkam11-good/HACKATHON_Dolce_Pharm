#!/usr/bin/env bash
# Создаёт доверенный HTTPS-сертификат mkcert для localhost, 127.0.0.1 и LAN IP.
# HTTPS обязателен: без него на телефоне не работают Service Worker, камера и WebCrypto.
# Без mkcert nginx при старте сам создаст самоподписанный сертификат (браузер покажет предупреждение).
set -e
cd "$(dirname "$0")/.."
IP=${1:-$(bash scripts/lan-ip.sh)}
if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert не найден. Установите: https://github.com/FiloSottile/mkcert#installation"
  echo "  Windows: choco install mkcert   |   macOS: brew install mkcert   |   Linux: apt install mkcert"
  exit 1
fi
mkcert -install
mkdir -p nginx/certs
mkcert -cert-file nginx/certs/cert.pem -key-file nginx/certs/key.pem localhost 127.0.0.1 ::1 "$IP"
cp "$(mkcert -CAROOT)/rootCA.pem" nginx/certs/rootCA.pem
echo
echo "Готово. Сертификат выпущен для: localhost 127.0.0.1 $IP"
echo "Корневой сертификат для телефона: nginx/certs/rootCA.pem (см. README, раздел «Телефон»)"
echo "Откройте: https://$IP"
