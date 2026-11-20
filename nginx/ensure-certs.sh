#!/bin/sh
# Если сертификаты mkcert не созданы (scripts/make-certs.sh), генерируем самоподписанный,
# чтобы `docker compose up` работал всегда. Для телефона лучше mkcert (доверенный корень).
set -e
CERT=/etc/nginx/certs/cert.pem
KEY=/etc/nginx/certs/key.pem
if [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; then
  echo "[certs] mkcert-сертификаты не найдены — создаю самоподписанный"
  mkdir -p /etc/nginx/certs
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout "$KEY" -out "$CERT" >/dev/null 2>&1
fi
