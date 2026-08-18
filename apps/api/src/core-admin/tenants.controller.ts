import { Body, ConflictException, Controller, Get, Post, Req } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { PasswordService } from '../auth/password.service.js';
import { systemDb } from '../db/client.js';
import { tenant, usuarioAdmin } from '../db/schema/index.js';
import { AuditService } from '../audit/audit.service.js';

const CreateTenantBody = z.object({
  nombre: z.string().min(2).max(140),
  plan: z.enum(['basico', 'pro']).default('basico'),
  // El primer admin va junto con la administración: un tenant sin nadie que
  // pueda entrar es inútil, y crearlo en dos pasos deja la ventana en la que
  // existe una administración sin dueño.
  admin: z.object({
    nombre: z.string().min(2).max(140),
    email: z.string().email(),
    password: z.string().min(10).max(200),
  }),
});

/**
 * ABM de administraciones (RF-A01). Solo SUPER_ADMIN.
 *
 * Estos endpoints usan `systemDb` a propósito: son las únicas operaciones
 * legítimamente cross-tenant del sistema —crear un tenant es, por definición,
 * trabajar fuera de todo tenant— y el guard de rol es lo que las protege.
 *
 * Hasta ahora el permiso `tenant.manage` existía en la matriz de RBAC y estaba
 * testeado, pero ningún endpoint lo consumía: el único INSERT de tenant vivía
 * en el seed. Un SUPER_ADMIN no podía dar de alta una administración desde el
 * producto.
 */
@Roles('SUPER_ADMIN')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    return systemDb
      .select({ id: tenant.id, nombre: tenant.nombre, plan: tenant.plan, createdAt: tenant.createdAt })
      .from(tenant)
      .orderBy(tenant.createdAt);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = CreateTenantBody.parse(body);

    const hash = await this.passwords.hash(dto.admin.password);

    const creado = await systemDb.transaction(async (tx) => {
      // El chequeo del email va DENTRO de la transacción: afuera, dos requests
      // concurrentes lo pasaban los dos y el segundo devolvía un 500 de
      // constraint en vez del 409 que corresponde.
      const existente = await tx
        .select({ id: usuarioAdmin.id })
        .from(usuarioAdmin)
        .where(eq(usuarioAdmin.email, dto.admin.email))
        .limit(1);
      if (existente[0]) throw new ConflictException('ya existe un usuario con ese email');

      const t = (
        await tx.insert(tenant).values({ nombre: dto.nombre, plan: dto.plan }).returning()
      )[0]!;
      const admin = (
        await tx
          .insert(usuarioAdmin)
          .values({
            tenantId: t.id,
            nombre: dto.admin.nombre,
            email: dto.admin.email,
            passwordHash: hash,
            rol: 'ADMIN',
          })
          .returning({ id: usuarioAdmin.id, email: usuarioAdmin.email })
      )[0]!;
      return { tenant: t, admin };
    });

    // Auditoría (RF-H05): dar de alta una administración es de las acciones más
    // sensibles del sistema.
    void this.audit.record({
      tenantId: creado.tenant.id,
      actorId: req.user!.sub,
      actorTipo: 'ADMIN',
      accion: 'tenant.create',
      entidad: 'tenant',
      entidadId: creado.tenant.id,
      detalle: { nombre: dto.nombre, plan: dto.plan, adminEmail: dto.admin.email },
    });

    return {
      id: creado.tenant.id,
      nombre: creado.tenant.nombre,
      plan: creado.tenant.plan,
      admin: creado.admin,
    };
  }
}
