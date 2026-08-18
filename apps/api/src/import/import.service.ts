import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { consorcio, residente, unidad, vinculoResidente } from '../db/schema/index.js';

/**
 * Importación masiva de residentes (RF-A05).
 *
 * El criterio de aceptación del RF es explícito: **las filas inválidas se
 * reportan con su motivo**. Por eso el resultado no es un "ok/error" global
 * sino un informe fila por fila — quien importa 200 residentes necesita saber
 * que la 47 falló porque el teléfono está mal, no que "la importación falló".
 *
 * Diseño: se valida TODO primero y se inserta después, en una sola
 * transacción. Una importación a medias es peor que ninguna: deja al admin sin
 * saber qué quedó cargado. Con `dryRun` se puede ver el informe sin escribir.
 */
export interface FilaError {
  fila: number;
  motivo: string;
  datos: Record<string, string>;
}

export interface ResultadoImport {
  totalFilas: number;
  validas: number;
  /** Residentes nuevos creados. */
  insertadas: number;
  /** Vínculos efectivamente creados (puede diferir de `insertadas`). */
  vinculosCreados: number;
  /**
   * Filas que no crearon nada porque el vínculo ya existía. Se informan
   * aparte: antes se contaban como insertadas, así que el admin veía "200
   * insertadas" cuando la base había descartado la mitad.
   */
  vinculosYaExistentes: number;
  /**
   * Residentes que ya existían por teléfono y se reusaron. Se informa el
   * nombre del archivo y el que quedó, porque el nombre nuevo NO se aplica:
   * el admin que sube la planilla corregida creería que actualizó los datos.
   */
  reusados: Array<{ fila: number; telefono: string; nombreEnArchivo: string; nombreExistente: string }>;
  errores: FilaError[];
  dryRun: boolean;
  /** Unidades que no existían y se crearon al pasar. */
  unidadesCreadas: string[];
}

// E.164: '+' y entre 8 y 15 dígitos. Mismo criterio que el ABM individual.
const TELEFONO = /^\+[1-9]\d{7,14}$/;

const Fila = z.object({
  nombre: z.string().min(2, 'nombre demasiado corto').max(140),
  telefono: z.string().regex(TELEFONO, 'teléfono no es E.164 (ej. +5491100000001)'),
  email: z.union([z.string().email('email inválido'), z.literal('')]).optional(),
  unidad: z.string().min(1, 'falta la unidad').max(40),
  rol: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => v === 'PROPIETARIO' || v === 'INQUILINO', 'rol debe ser PROPIETARIO o INQUILINO'),
});

/** Acepta encabezados con acentos, mayúsculas o espacios. */
function normalizarClave(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_');
}

const ALIAS: Record<string, string> = {
  nombre: 'nombre',
  nombre_completo: 'nombre',
  apellido_y_nombre: 'nombre',
  telefono: 'telefono',
  celular: 'telefono',
  whatsapp: 'telefono',
  email: 'email',
  mail: 'email',
  correo: 'email',
  unidad: 'unidad',
  depto: 'unidad',
  departamento: 'unidad',
  lote: 'unidad',
  rol: 'rol',
  vinculo: 'rol',
  tipo: 'rol',
};

@Injectable()
export class ImportService {
  private readonly log = new Logger(ImportService.name);

  async importarResidentes(
    tenantId: string,
    consorcioId: string,
    csv: string,
    opts: { dryRun?: boolean; crearUnidades?: boolean } = {},
  ): Promise<ResultadoImport> {
    const dryRun = opts.dryRun ?? false;
    const crearUnidades = opts.crearUnidades ?? false;

    // El consorcio se valida ANTES de mirar las filas. Si no existe, un informe
    // que diga "0 filas válidas" es engañoso: el problema no está en el archivo.
    await withTenant(tenantId, async (tx) => {
      const existe = (
        await tx
          .select({ id: consorcio.id })
          .from(consorcio)
          .where(and(eq(consorcio.tenantId, tenantId), eq(consorcio.id, consorcioId)))
          .limit(1)
      )[0];
      if (!existe) throw new NotFoundException('consorcio not found');
    });

    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => ALIAS[normalizarClave(h)] ?? normalizarClave(h),
    });

    const errores: FilaError[] = [];
    // Se guarda la fila ORIGINAL junto con los datos: la segunda pasada de
    // validación (existencia de la unidad) también reporta por fila, y usar el
    // índice del array de válidas da números corridos cuando alguna se descartó.
    const validas: Array<{ fila: number; datos: z.infer<typeof Fila> }> = [];

    // Papaparse reporta errores de estructura (comillas sin cerrar, etc.).
    for (const e of parsed.errors) {
      errores.push({
        // +2: la fila 0 del parser es la primera de datos, y hay encabezado.
        fila: (e.row ?? 0) + 2,
        motivo: `archivo mal formado: ${e.message}`,
        datos: {},
      });
    }

    const telefonosVistos = new Map<string, number>();

    parsed.data.forEach((raw, i) => {
      const fila = i + 2;
      const res = Fila.safeParse(raw);
      if (!res.success) {
        errores.push({
          fila,
          motivo: res.error.issues.map((x) => `${x.path.join('.') || 'fila'}: ${x.message}`).join('; '),
          datos: raw,
        });
        return;
      }
      // Duplicados DENTRO del archivo: si no se detectan acá, la constraint
      // UNIQUE(tenant_id, telefono) aborta la transacción entera y el admin no
      // sabe cuál de las 200 filas la rompió.
      const previa = telefonosVistos.get(res.data.telefono);
      if (previa !== undefined) {
        errores.push({
          fila,
          motivo: `teléfono repetido en el archivo (ya aparece en la fila ${previa})`,
          datos: raw,
        });
        return;
      }
      telefonosVistos.set(res.data.telefono, fila);
      validas.push({ fila, datos: res.data });
    });

    const resultado: ResultadoImport = {
      totalFilas: parsed.data.length,
      validas: validas.length,
      insertadas: 0,
      vinculosCreados: 0,
      vinculosYaExistentes: 0,
      reusados: [],
      errores,
      dryRun,
      unidadesCreadas: [],
    };

    if (validas.length === 0) return resultado;

    await withTenant(tenantId, async (tx) => {
      const unidades = await tx
        .select({ id: unidad.id, etiqueta: unidad.etiqueta })
        .from(unidad)
        .where(and(eq(unidad.tenantId, tenantId), eq(unidad.consorcioId, consorcioId)));
      const porEtiqueta = new Map(unidades.map((u) => [u.etiqueta.trim().toUpperCase(), u.id]));

      // Segunda pasada de validación: la unidad tiene que existir. Se hace acá
      // porque necesita la base, y su resultado también va al informe.
      const listas: Array<{ fila: number; datos: z.infer<typeof Fila>; unidadId: string }> = [];
      for (const { fila, datos: v } of validas) {
        const clave = v.unidad.trim().toUpperCase();
        let unidadId = porEtiqueta.get(clave);
        if (!unidadId) {
          if (!crearUnidades) {
            errores.push({
              fila,
              motivo: `la unidad "${v.unidad}" no existe en el consorcio (usá crear_unidades=true para crearla)`,
              datos: v as unknown as Record<string, string>,
            });
            continue;
          }
          if (!dryRun) {
            const nueva = (
              await tx
                .insert(unidad)
                .values({ tenantId, consorcioId, etiqueta: v.unidad.trim() })
                .returning({ id: unidad.id })
            )[0]!;
            unidadId = nueva.id;
            porEtiqueta.set(clave, unidadId);
          } else {
            // También se marca en la prueba, y no solo al escribir: sin esto
            // cada fila que apunta a la misma unidad nueva la volvía a contar,
            // así que una planilla con dos ocupantes por unidad informaba el
            // doble de unidades a crear. El admin usa justamente esta vista
            // previa para decidir si aplica el archivo.
            unidadId = 'dry-run';
            porEtiqueta.set(clave, unidadId);
          }
          resultado.unidadesCreadas.push(v.unidad.trim());
        }
        listas.push({ fila, datos: v, unidadId });
      }

      resultado.validas = listas.length;
      if (dryRun || listas.length === 0) return;

      for (const { fila, datos, unidadId } of listas) {
        // Un residente puede ya existir (por teléfono) si vive en otra unidad
        // del mismo tenant: en ese caso se reusa y solo se agrega el vínculo.
        const existente = (
          await tx
            .select({ id: residente.id, nombre: residente.nombre, activo: residente.activo })
            .from(residente)
            .where(and(eq(residente.tenantId, tenantId), eq(residente.telefonoE164, datos.telefono)))
            .limit(1)
        )[0];

        let resiId: string;
        if (existente) {
          resiId = existente.id;
          // Se reusa por teléfono, pero el nombre del archivo NO se aplica: eso
          // sería una actualización silenciosa de datos personales desde una
          // planilla. Se informa para que el admin decida.
          if (existente.nombre !== datos.nombre.trim() || existente.activo === false) {
            resultado.reusados.push({
              fila,
              telefono: datos.telefono,
              nombreEnArchivo: datos.nombre.trim(),
              nombreExistente: existente.activo === false
                ? `${existente.nombre} (DADO DE BAJA)`
                : existente.nombre,
            });
          }
        } else {
          resiId = (
            await tx
              .insert(residente)
              .values({
                tenantId,
                nombre: datos.nombre.trim(),
                telefonoE164: datos.telefono,
                ...(datos.email ? { email: datos.email } : {}),
              })
              .returning({ id: residente.id })
          )[0]!.id;
          resultado.insertadas++;
        }

        // `returning()` para saber si la base insertó de verdad: el índice único
        // es (residenteId, unidadId, rol) SIN `activo`, así que reimportar para
        // reactivar un vínculo dado de baja cae en el DO NOTHING y no hace nada.
        // Antes se contaba igual como insertado.
        const vinculo = await tx
          .insert(vinculoResidente)
          .values({
            tenantId,
            residenteId: resiId,
            unidadId,
            rol: datos.rol as 'PROPIETARIO' | 'INQUILINO',
            activo: true,
          })
          .onConflictDoNothing()
          .returning({ id: vinculoResidente.id });

        if (vinculo.length > 0) resultado.vinculosCreados++;
        else resultado.vinculosYaExistentes++;
      }
    });

    this.log.log(
      { tenantId, consorcioId, ...resultado, errores: resultado.errores.length },
      'importacion de residentes',
    );
    return resultado;
  }
}
