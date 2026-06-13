import { Controller, ForbiddenException, Get, Param, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { systemDb } from '../db/client.js';

function tid(req: AuthedRequest): string {
  const header = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof header === 'string' && header) return header;
  const t = req.user?.tid;
  if (!t) throw new ForbiddenException('no tenant');
  return t;
}

/**
 * Lista los tickets más similares (top-k por cosine distance) en el MISMO
 * consorcio. Usa el embedding del ticket pivote — si no tiene embedding,
 * devuelve vacío.
 */
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('tickets/:id/similar')
export class SimilarTicketsController {
  @Get()
  async similar(@Req() req: AuthedRequest, @Param('id') id: string) {
    const t = tid(req);
    const result = await systemDb.execute<{
      id: string;
      titulo: string;
      estado: string;
      similarity: number;
      created_at: Date;
    }>(sql`
      WITH pivot AS (
        SELECT embedding, consorcio_id FROM ticket
        WHERE tenant_id = ${t} AND id = ${id} AND embedding IS NOT NULL
      )
      SELECT
        tk.id,
        tk.titulo,
        tk.estado,
        tk.created_at,
        1 - (tk.embedding <=> (SELECT embedding FROM pivot)) AS similarity
      FROM ticket tk, pivot
      WHERE tk.tenant_id = ${t}
        AND tk.consorcio_id = pivot.consorcio_id
        AND tk.id <> ${id}
        AND tk.embedding IS NOT NULL
      ORDER BY tk.embedding <=> pivot.embedding
      LIMIT 5
    `);
    return result.rows;
  }
}
