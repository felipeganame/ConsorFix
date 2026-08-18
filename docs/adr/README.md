# Decisiones de arquitectura (ADR)

Una ADR por decisión relevante. La regla práctica: si dentro de seis meses
alguien va a preguntar *"¿por qué esto es así?"*, va una ADR.

| # | Decisión | Estado | Fecha |
|---|---|---|---|
| [001](ADR-001-orm-rls-pgvector.md) | ORM, RLS y pgvector | aceptada | 2026-06 |
| [002](ADR-002-ciclo-de-vida-del-ticket.md) | Ciclo de vida del ticket: 4 estados, sin técnico, una sola entidad de costo | aceptada | 2026-06-12 |

## Cuándo escribirla

**Cuando se toma la decisión, no cuando alguien nota que falta.** La ADR-002 se
escribió dos meses tarde: durante ese tiempo la decisión más importante del
núcleo vivía en comentarios de código y contradecía `docs/02` y `docs/03` sin
que existiera registro del por qué. Una auditoría lo marcó como riesgo para la
defensa, con razón: el tribunal lee los requerimientos, busca el código, y no
encuentra ni una cosa ni la otra.

## Decisiones que todavía no tienen ADR y deberían

- **Telegram como segundo canal** (2026-08-18): por qué se agregó al lado de
  WhatsApp en vez de reemplazarlo, y por qué la identidad se resuelve
  compartiendo contacto y no por teléfono escrito.
- **Vercel AI SDK y el pin en `ai@^6`** (2026-08-17): la v7 es ESM-only y pide
  Node ≥22, incompatible con este monorepo CommonJS.
- **`unidad_reportada_id` separado de `unidad_id`** (2026-08-18): está explicado
  en la migración 0004, pero la decisión de modelado merece su propio registro.
