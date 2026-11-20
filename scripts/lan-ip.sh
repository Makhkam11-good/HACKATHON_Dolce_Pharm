#!/usr/bin/env bash
# Печатает LAN IP этой машины (для открытия приложения с телефона: https://<IP>)
set -e
ip=""
case "$(uname -s)" in
  Darwin)
    iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    ip=$(ipconfig getifaddr "${iface:-en0}" 2>/dev/null || true)
    ;;
  MINGW*|MSYS*|CYGWIN*)
    # Windows (Git Bash): IP интерфейса с маршрутом по умолчанию — не Hyper-V/WSL/VPN-адаптеры
    ip=$(powershell.exe -NoProfile -Command \
      "\$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object { \$_.RouteMetric + \$_.InterfaceMetric } | Select-Object -First 1; if (\$r) { (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex \$r.InterfaceIndex | Select-Object -First 1).IPAddress }" \
      2>/dev/null | tr -d '\r' || true)
    ;;
  *)
    if command -v ip >/dev/null 2>&1; then
      ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
    fi
    if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
      ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    ;;
esac
# защита от мусора в выводе: только корректный IPv4
if ! printf '%s' "$ip" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then ip=""; fi
echo "${ip:-127.0.0.1}"
