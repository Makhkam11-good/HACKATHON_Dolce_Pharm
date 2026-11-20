#!/usr/bin/env bash
# Печатает LAN IP этой машины (для открытия приложения с телефона: https://<IP>)
set -e
ip=""
if command -v ip >/dev/null 2>&1; then
  ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
fi
if [ -z "$ip" ] && command -v ipconfig >/dev/null 2>&1; then
  # macOS: ipconfig getifaddr; Windows (Git Bash): ipconfig
  ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  if [ -z "$ip" ]; then
    ip=$(ipconfig 2>/dev/null | grep -aE "IPv4" | grep -aoE "([0-9]{1,3}\.){3}[0-9]{1,3}" | grep -E "^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01]))" | head -1)
  fi
fi
if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
echo "${ip:-127.0.0.1}"
