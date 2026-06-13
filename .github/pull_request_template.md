# PR — <breve descripción>

**RF / RNF / Gap:** <ej. RF-B02, RNF-11, G14>

## Cambios
- 

## Definition of Done (regla 6 de CLAUDE.md)
- [ ] Criterios de aceptación del RF cumplidos
- [ ] Tests unitarios y/o de integración pasando (CI verde)
- [ ] `pnpm lint` y `pnpm typecheck` verdes
- [ ] Cobertura ≥70% en módulos críticos tocados (domain / RBAC / tickets / clasificación)
- [ ] README del módulo actualizado si aplica
- [ ] Si se tocó una política RLS o tabla tenant-scoped: test en `pnpm test:isolation`
- [ ] Si se tocó un prompt: `pnpm ai:eval` corrido y resultado registrado en el changelog del prompt
- [ ] Sin secretos en código; `.env.example` actualizado si se agregaron variables

## Notas
- 
