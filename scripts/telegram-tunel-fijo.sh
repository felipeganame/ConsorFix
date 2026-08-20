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

# ── El túnel primero, el webhook después ─────────────────────────────────────
#
# Telegram valida el host al registrar el webhook: si el túnel no está arriba o el
# DNS todavía no se propagó a sus resolvers, responde
# "Failed to resolve host: Name or service not known". Registrarlo antes de
# levantar el túnel —como hacía la primera versión de este script— falla siempre.
echo "levantando el túnel…"
cloudflared tunnel --config "$CONFIG" run &
CF_PID=$!
trap 'kill "$CF_PID" 2>/dev/null || true' EXIT

# Se espera a que la URL pública conteste de verdad. Un 401 es la respuesta
# correcta: significa que el pedido llegó hasta la API y esta lo rechazó por
# venir sin el header secreto, o sea que la cadena entera funciona
# —DNS → Cloudflare → túnel → API—. Un 404 sería el borde de Cloudflare
# respondiendo sin llegar acá, y un error de conexión, DNS sin propagar.
echo "esperando a que https://${HOSTNAME_PUBLICO} responda…"
LISTO=""
for _ in $(seq 1 60); do
  CODIGO="$(curl -s -o /dev/null -m 5 -w '%{http_code}' \
    -X POST "https://${HOSTNAME_PUBLICO}/webhooks/telegram" \
    -H 'content-type: application/json' -d '{}' || true)"
  if [[ "$CODIGO" == "401" ]]; then LISTO="si"; break; fi
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "el túnel se cerró solo" >&2
    exit 1
  fi
  sleep 2
done

if [[ -z "$LISTO" ]]; then
  echo "la URL pública no contestó como se esperaba (último código: ${CODIGO:-sin respuesta})." >&2
  echo "Si es un 404, la regla de ingress no matcheó. Si no hay respuesta, el DNS" >&2
  echo "todavía no se propagó: esperá un minuto y volvé a correr el script." >&2
  exit 1
fi
echo "  responde 401 sin el secreto: la cadena DNS → Cloudflare → túnel → API funciona"

# Y se comprueba que el resto de la API NO esté publicada, que es el punto de la
# regla de ingress. Sin esto la restricción sería una intención, no un hecho.
CODIGO_LOGIN="$(curl -s -o /dev/null -m 8 -w '%{http_code}' \
  -X POST "https://${HOSTNAME_PUBLICO}/auth/login" \
  -H 'content-type: application/json' -d '{"email":"x@x.com","password":"x"}' || true)"
if [[ "$CODIGO_LOGIN" == "404" ]]; then
  echo "  /auth/login devuelve 404 desde afuera: el resto de la API queda privada"
else
  echo "  CUIDADO: /auth/login respondió ${CODIGO_LOGIN} desde internet, debería ser 404." >&2
  echo "  Revisá la regla de ingress en ${CONFIG} antes de dejar esto abierto." >&2
fi

if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "registrando el webhook (una sola vez: la URL ya no cambia)…"
  # Sin `-f` y sin abortar por `set -e`: cuando Telegram rechaza algo, el motivo
  # viene en el cuerpo de la respuesta y es justo lo que hay que mostrar. Con
  # `curl -fsS` dentro de una sustitución, `set -e` mataba el script acá y el
  # manejo de error de abajo nunca corría.
  for intento in 1 2 3 4 5; do
    RESP="$(curl -s -m 15 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
      -d "url=https://${HOSTNAME_PUBLICO}/webhooks/telegram" \
      -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
      -d 'drop_pending_updates=true' || echo '{"ok":false,"description":"curl falló"}')"
    if grep -q '"ok":true' <<<"$RESP"; then
      echo "  webhook OK → https://${HOSTNAME_PUBLICO}/webhooks/telegram"
      break
    fi
    # El DNS recién creado tarda en llegar a los resolvers de Telegram, así que
    # este caso puntual se reintenta en vez de darse por perdido.
    if grep -qi "resolve host" <<<"$RESP" && [[ $intento -lt 5 ]]; then
      echo "  Telegram todavía no resuelve el host, reintento en 20s (intento ${intento}/5)…"
      sleep 20
      continue
    fi
    echo "  Telegram rechazó el webhook: $RESP" >&2
    break
  done
else
  echo "sin TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET en el .env:"
  echo "  el túnel igual queda arriba, pero el webhook hay que registrarlo después."
fi

echo
echo "túnel corriendo. Escribile a @Consorfix_bot desde Telegram."
echo "  Mientras esté abierto podés cambiar todo el código: la API recompila sola."
echo "  Ctrl+C para cerrarlo."
echo
wait "$CF_PID"
