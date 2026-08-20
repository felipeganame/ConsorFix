#!/usr/bin/env bash
#
# Abre un túnel público a la API y registra el webhook de Telegram con esa URL.
#
# El túnel rápido de cloudflared no necesita cuenta ni tiene límite de sesiones
# simultáneas —a diferencia del plan gratis de ngrok, que permite un solo agente
# a la vez—, pero cada vez que arranca da una URL aleatoria. Esto lee esa URL de
# su propia salida y corre `setWebhook` solo, así que reiniciarlo deja de ser un
# trámite: un comando y Telegram vuelve a apuntar donde tiene que apuntar.
#
#   ./scripts/telegram-tunel.sh
#
# Necesita TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET en el .env.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "no encuentro el .env en la raíz del repo" >&2
  exit 1
fi
set -a && . ./.env && set +a

: "${TELEGRAM_BOT_TOKEN:?falta TELEGRAM_BOT_TOKEN en el .env (te lo da @BotFather)}"
: "${TELEGRAM_WEBHOOK_SECRET:?falta TELEGRAM_WEBHOOK_SECRET en el .env (lo elegís vos)}"
PUERTO="${API_PORT:-3000}"

if ! curl -fsS -m 4 "http://localhost:${PUERTO}/health" >/dev/null 2>&1; then
  echo "la API no responde en localhost:${PUERTO} — levantala antes" >&2
  exit 1
fi

SALIDA="$(mktemp -t cfx-tunel)"
trap 'kill "${CF_PID:-0}" 2>/dev/null || true; rm -f "$SALIDA"' EXIT

echo "abriendo el túnel a localhost:${PUERTO}…"
cloudflared tunnel --url "http://localhost:${PUERTO}" --no-autoupdate >"$SALIDA" 2>&1 &
CF_PID=$!

# La URL aparece en la salida a los pocos segundos. Se espera en vez de dormir un
# rato fijo: en una conexión lenta un sleep corto falla y uno largo molesta.
URL=""
for _ in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$SALIDA" | head -1 || true)"
  [[ -n "$URL" ]] && break
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "cloudflared se cerró antes de dar una URL:" >&2
    tail -5 "$SALIDA" >&2
    exit 1
  fi
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "no pude leer la URL del túnel. Últimas líneas:" >&2
  tail -10 "$SALIDA" >&2
  exit 1
fi

echo "túnel arriba: $URL"
echo
echo "  OJO: un túnel rápido publica la API ENTERA, no solo el webhook. Mientras"
echo "  esté abierto, esa URL llega a /auth/login con tu base de desarrollo"
echo "  detrás. El riesgo es acotado —el subdominio es aleatorio, va bajo un"
echo "  certificado comodín (no queda en los logs de Certificate Transparency) y"
echo "  muere al cerrar esto— pero cerralo cuando termines."
echo "  Para algo permanente usá telegram-tunel-fijo.sh, que publica solo el"
echo "  webhook y deja el resto de la API en 404."
echo
echo "registrando el webhook…"

RESP="$(curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${URL}/webhooks/telegram" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'drop_pending_updates=true')"

if ! grep -q '"ok":true' <<<"$RESP"; then
  echo "Telegram rechazó el webhook:" >&2
  echo "$RESP" >&2
  exit 1
fi

echo
echo "listo. Escribile a tu bot desde Telegram."
echo "  El túnel queda abierto acá: si cerrás esta terminal, se cierra."
echo "  Mientras siga abierto podés cambiar todo el código que quieras —"
echo "  la API recompila sola y Telegram no se entera."
echo
echo "Ctrl+C para cerrar el túnel."
wait "$CF_PID"
