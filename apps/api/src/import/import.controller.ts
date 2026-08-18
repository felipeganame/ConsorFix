import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ImportService } from './import.service.js';

const ImportBody = z.object({
  consorcio_id: z.string().uuid(),
  /**
   * Contenido del CSV como texto. Se recibe en el body y no como multipart a
   * propósito: evita una dependencia más (multer, que además arrastraba cuatro
   * advisories de DoS) y el panel puede leer el archivo con FileReader antes de
   * mandarlo. Para 200 residentes son unos pocos KB.
   */
  csv: z.string().min(1).max(2_000_000),
  /** Devuelve el informe sin escribir nada. */
  dry_run: z.boolean().default(false),
  /** Crea las unidades que no existan en vez de rechazar la fila. */
  crear_unidades: z.boolean().default(false),
});

function tid(req: AuthedRequest): string {
  const headerTid = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof headerTid === 'string' && headerTid) return headerTid;
  const t = req.user?.tid;
  if (!t) throw new ForbiddenException('no tenant in token');
  return t;
}

/**
 * Importación masiva de residentes (RF-A05, tarea 1.4).
 *
 * Encabezados aceptados (con o sin acentos, mayúsculas o espacios):
 *   nombre | telefono | email | unidad | rol
 * y alias comunes: celular/whatsapp → telefono, depto/lote → unidad,
 * vinculo/tipo → rol, mail/correo → email.
 */
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('import')
export class ImportController {
  constructor(private readonly importer: ImportService) {}

  @Post('residentes')
  async residentes(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = ImportBody.parse(body);
    return this.importer.importarResidentes(tid(req), dto.consorcio_id, dto.csv, {
      dryRun: dto.dry_run,
      crearUnidades: dto.crear_unidades,
    });
  }
}
