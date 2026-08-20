#!/usr/bin/env bash
#
# Túnel con nombre y URL permanente que expone **solo el webhook de Telegram**,
# más el `setWebhook` registrado una sola vez.
#
#   ./scripts/telegram-tunel-fijo.sh consorfix-bot.tu-dominio.com
#
# Por qué solo esa ruta: el túnel publica en internet lo que apunta, y apuntar
# `localhost:3003` entero deja `/auth/login` accesible desde afuera con la base de
# desarrollo detrás —usuarios del seed, contraseñas de ejemplo—. Y la URL no es un
# secreto: los subdominios aparecen en los logs públicos de Certificate
# Transparency, así que "nadie la va a encontrar" no es una defensa. Con una regla
# de ingress por path, todo lo que no sea el webhook devuelve 404 en el borde de
# Cloudflare y nunca llega a esta máquina.
#
# La diferencia con `telegram-tunel.sh`: ese abre un túnel rápido con URL
# aleatoria y vuelve a registrar el webhook en cada arranque. Este usa un hostname
# propio, así que la URL no cambia nunca.
#
# Requiere un dominio con DNS en Cloudflare y `cloudflared tunnel login` hecho.
# No tiene el límite de una sesión simultánea del plan gratis de ngrok.
set -euo pipefail

cd "$(dirname "$0")/.."

HOSTNAME_PUBLICO="${1:-}"
NOMBRE_TUNEL="${TUNEL_NOMBRE:-consorciofix}"
CONFIG="${HOME}/.cloudflared/${NOMBRE_TUNEL}.yml"

if [[ -z "$HOSTNAME_PUBLICO" ]]; then
  echo "uso: $0 <hostname>" >&2
  echo "ej:  $0 consorfix-bot.tu-dominio.com" >&2
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

# Idempotente: un script de entorno que falla la segunda vez que se corre no sirve.
if cloudflared tunnel list 2>/dev/null | grep -qE "[[:space:]]${NOMBRE_TUNEL}[[:space:]]"; then
  echo "el túnel '${NOMBRE_TUNEL}' ya existe, lo reuso"
else
  echo "creando el túnel '${NOMBRE_TUNEL}'…"
  cloudflared tunnel create "$NOMBRE_TUNEL"
fi

UUID="$(cloudflared tunnel list --output json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      const t=JSON.parse(s).find(x=>x.name===process.argv[1]);
      process.stdout.write(t?t.id:'');
    })" "$NOMBRE_TUNEL")"

if [[ -z "$UUID" ]]; then
  echo "no pude resolver el id del túnel '${NOMBRE_TUNEL}'" >&2
  exit 1
fi

echo "apuntando ${HOSTNAME_PUBLICO} al túnel…"
if ! cloudflared tunnel route dns "$NOMBRE_TUNEL" "$HOSTNAME_PUBLICO" >/tmp/cfx-dns.log 2>&1; then
  if grep -qiE "already exists|record with that host|already configured" /tmp/cfx-dns.log; then
    echo "  (el registro ya existía, sigo)"
  else
    echo "no pude crear el registro DNS. ¿El dominio está en Cloudflare?" >&2
    cat /tmp/cfx-dns.log >&2
    exit 1
  fi
fi

# La regla de ingress es lo que limita la exposición: solo el webhook llega a esta
# máquina, el resto muere en el borde con un 404.
cat > "$CONFIG" <<YAML
# Generado por scripts/telegram-tunel-fijo.sh — se reescribe en cada corrida.
tunnel: ${UUID}
credentials-file: ${HOME}/.cloudflared/${UUID}.json

ingress:
  # Única ruta publicada. Todo lo demás de la API queda privado.
  - hostname: ${HOSTNAME_PUBLICO}
    path: ^/webhooks/telegram/?$
    service: http://localhost:${PUERTO}
  - service: http_status:404
YAML

echo "configuración escrita en ${CONFIG}"
echo "  publicada: /webhooks/telegram   ·   el resto de la API: 404"

if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "registrando el webhook (una sola vez: la URL ya no cambia)…"
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
echo "túnel corriendo. Escribile a tu bot desde Telegram."
echo "  Mientras esté abierto podés cambiar todo el código: la API recompila sola."
echo "  Ctrl+C para cerrarlo."
echo
exec cloudflared tunnel --config "$CONFIG" run
