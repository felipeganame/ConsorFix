#!/usr/bin/env bash
#
# Túnel con nombre y URL permanente, más el webhook de Telegram registrado una
# sola vez.
#
#   ./scripts/telegram-tunel-fijo.sh consorfix.tu-dominio.com
#
# La diferencia con `telegram-tunel.sh`: ese abre un túnel rápido con URL
# aleatoria y vuelve a registrar el webhook en cada arranque. Este usa un
# hostname propio, así que la URL no cambia nunca: el `setWebhook` se corre una
# vez y después reiniciar el túnel, la Mac o la API no obliga a tocar nada.
#
# Requiere un dominio con DNS en Cloudflare y `cloudflared tunnel login` hecho
# (existe ~/.cloudflared/cert.pem). No tiene el límite de una sesión simultánea
# del plan gratis de ngrok, así que convive con otros túneles de la misma cuenta.
set -euo pipefail

cd "$(dirname "$0")/.."

HOSTNAME_PUBLICO="${1:-}"
NOMBRE_TUNEL="${TUNEL_NOMBRE:-consorciofix}"

if [[ -z "$HOSTNAME_PUBLICO" ]]; then
  echo "uso: $0 <hostname>" >&2
  echo "ej:  $0 consorfix.tu-dominio.com" >&2
  exit 1
fi

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "falta autorizar cloudflared con tu cuenta: cloudflared tunnel login" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "no encuentro el .env en la raíz del repo" >&2
  exit 1
fi
set -a && . ./.env && set +a
PUERTO="${API_PORT:-3000}"

if ! curl -fsS -m 4 "http://localhost:${PUERTO}/health" >/dev/null 2>&1; then
  echo "la API no responde en localhost:${PUERTO} — levantala antes" >&2
  exit 1
fi

# Crear el túnel solo si no existe: el script tiene que poder correrse muchas
# veces sin acumular túneles ni fallar en el segundo intento.
if cloudflared tunnel list 2>/dev/null | grep -qE "[[:space:]]${NOMBRE_TUNEL}[[:space:]]"; then
  echo "el túnel '${NOMBRE_TUNEL}' ya existe, lo reuso"
else
  echo "creando el túnel '${NOMBRE_TUNEL}'…"
  cloudflared tunnel create "$NOMBRE_TUNEL"
fi

# Igual con el DNS: si el registro ya apunta a este túnel, Cloudflare devuelve un
# error que acá no es un problema.
echo "apuntando ${HOSTNAME_PUBLICO} al túnel…"
if ! cloudflared tunnel route dns "$NOMBRE_TUNEL" "$HOSTNAME_PUBLICO" 2>&1 | tee /tmp/cfx-dns.log; then
  if grep -qiE "already exists|record with that host" /tmp/cfx-dns.log; then
    echo "  (el registro ya existía, sigo)"
  else
    echo "no pude crear el registro DNS. ¿El dominio está en Cloudflare?" >&2
    exit 1
  fi
fi

if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "registrando el webhook de Telegram (una sola vez: la URL ya no cambia)…"
  RESP="$(curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    -d "url=https://${HOSTNAME_PUBLICO}/webhooks/telegram" \
    -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
    -d 'drop_pending_updates=true')"
  if grep -q '"ok":true' <<<"$RESP"; then
    echo "  webhook OK → https://${HOSTNAME_PUBLICO}/webhooks/telegram"
  else
    echo "  Telegram rechazó el webhook: $RESP" >&2
  fi
else
  echo "sin TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET en el .env:"
  echo "  el túnel igual queda arriba, pero el webhook hay que registrarlo después."
fi

echo
echo "túnel corriendo. https://${HOSTNAME_PUBLICO} → localhost:${PUERTO}"
echo "  Mientras esté abierto podés cambiar todo el código: la API recompila sola."
echo "  Ctrl+C para cerrarlo."
echo
exec cloudflared tunnel run --url "http://localhost:${PUERTO}" "$NOMBRE_TUNEL"
