import { Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { canInviteInquilino } from '@consorciofix/domain';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { withTenant } from '../db/client.js';
import { residente, vinculoResidente } from '../db/schema/index.js';
import { tenantIdFromReq } from './tenant-ctx.js';

const AdminCreate = z.object({
  nombre: z.string().min(1).max(140),
  telefono_e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  email: z.string().email().optional(),
  password: z.string().min(6).max(200).optional(),
});

const PropietarioInvite = z.object({
  unidad_id: z.string().uuid(),
  nombre: z.string().min(1).max(140),
  telefono_e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

@Controller('residentes')
export class ResidentesController {
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get()
  async list(@Req() req: AuthedRequest) {
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) =>
      tx
        .select({
          id: residente.id,
          nombre: residente.nombre,
          telefonoE164: residente.telefonoE164,
          email: residente.email,
          activo: residente.activo,
        })
        .from(residente)
        .where(eq(residente.tenantId, tid)),
    );
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = AdminCreate.parse(body);
    const tid = tenantIdFromReq(req);
    const hash = dto.password ? await argon2.hash(dto.password, { type: argon2.argon2id }) : null;
    return withTenant(tid, async (tx) =>
      (await tx
        .insert(residente)
        .values({
          tenantId: tid,
          nombre: dto.nombre,
          telefonoE164: dto.telefono_e164,
          email: dto.email ?? null,
          passwordHash: hash,
        })
        .returning({ id: residente.id, nombre: residente.nombre, email: residente.email }))[0],
    );
  }

  /**
   * Propietario invita inquilino a una unidad PROPIA. Crea residente + vínculo
   * INQUILINO en un solo paso. Verifica row-level: el caller debe ser
   * PROPIETARIO ACTIVO de la unidad target.
   */
  @Roles('RESIDENTE')
  @Post('invite-inquilino')
  async inviteInquilino(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = PropietarioInvite.parse(body);
    const tid = tenantIdFromReq(req);
    const propietarioId = req.user!.sub;
    return withTenant(tid, async (tx) => {
      const vinculos = await tx
        .select()
        .from(vinculoResidente)
        .where(and(eq(vinculoResidente.tenantId, tid), eq(vinculoResidente.unidadId, dto.unidad_id)));
      const allowed = canInviteInquilino(propietarioId, {
        unidadId: dto.unidad_id,
        vinculos: vinculos.map((v) => ({ residenteId: v.residenteId, rol: v.rol, activo: v.activo })),
      });
      if (!allowed) throw new ForbiddenException('solo propietario activo puede invitar inquilinos');
      const hash = await argon2.hash(dto.password, { type: argon2.argon2id });
      const newResi = (await tx
        .insert(residente)
        .values({
          tenantId: tid,
          nombre: dto.nombre,
          telefonoE164: dto.telefono_e164,
          email: dto.email,
          passwordHash: hash,
        })
        .returning())[0]!;
      await tx
        .insert(vinculoResidente)
        .values({
          tenantId: tid,
          residenteId: newResi.id,
          unidadId: dto.unidad_id,
          rol: 'INQUILINO',
          creadoPorId: propietarioId,
        });
      return { id: newResi.id, email: newResi.email, vinculo: 'INQUILINO', unidad_id: dto.unidad_id };
    });
  }
}
