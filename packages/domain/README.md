# @consorciofix/domain

Lógica pura del dominio. **Sin dependencias de framework.** Acá vive lo testeado al ≥70%.

## Contenido

- `ticket/states.ts` — enum de estados (RF-D02, G13)
- `ticket/transitions.ts` — máquina de estados; única vía de cambio de estado (regla 2 de CLAUDE.md)
- `errors.ts` — errores tipados del dominio (no strings)

## TDD obligatorio

Cada nueva regla → test primero en `*.test.ts` adyacente. Cobertura mínima 70%.
