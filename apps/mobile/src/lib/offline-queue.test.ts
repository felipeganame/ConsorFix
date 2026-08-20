import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cola offline (RF-E05 / RNF-11).
 *
 * Es la pieza donde un bug se traduce en un reporte perdido: el vecino escribe
 * lo que le pasa sin señal, la app promete que lo va a enviar, y si la cola se
 * equivoca ese texto no llega nunca. Antes no había ningún test.
 *
 * `createTicket` se mockea para poder simular las tres respuestas que importan:
 * éxito, error de red (se reintenta) y rechazo del servidor (no se reintenta).
 */
const createTicket = vi.fn();
vi.mock('./api.js', async () => {
  // ApiError es real: la clasificación de errores depende de su `status`.
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError, createTicket: (...args: unknown[]) => createTicket(...args) };
});

const { ApiError } = await import('./api.js');
const { enqueue, readQueue, syncQueue, descartar, clearQueue } = await import('./offline-queue.js');

function reporte(id: string, titulo = 'Se rompió algo') {
  return {
    consorcio_id: 'c-1',
    unidad_id: 'u-1',
    tipo: 'INFRAESTRUCTURA' as const,
    titulo,
    descripcion: 'detalle del problema',
    client_generated_id: id,
  };
}

beforeEach(async () => {
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
  createTicket.mockReset();
  await clearQueue();
});

describe('encolado', () => {
  it('guarda el reporte y lo conserva entre lecturas', async () => {
    await enqueue(reporte('id-1'));
    const cola = await readQueue();
    expect(cola).toHaveLength(1);
    expect(cola[0]!.body.titulo).toBe('Se rompió algo');
    expect(cola[0]!.attempts).toBe(0);
  });

  it('encolar dos veces el mismo client_generated_id no duplica', async () => {
    // Es la misma clave de idempotencia que usa la API: si la app reintenta el
    // encolado, no puede terminar con dos reportes del mismo hecho.
    await enqueue(reporte('id-1'));
    await enqueue(reporte('id-1', 'texto corregido'));
    const cola = await readQueue();
    expect(cola).toHaveLength(1);
    expect(cola[0]!.body.titulo).toBe('texto corregido');
  });
});

describe('sincronización', () => {
  it('lo que entra bien se saca de la cola', async () => {
    await enqueue(reporte('id-1'));
    createTicket.mockResolvedValueOnce({ id: 'ticket-1' });

    const r = await syncQueue();
    expect(r.enviados).toBe(1);
    expect(r.pendientes).toBe(0);
    expect(await readQueue()).toHaveLength(0);
  });

  it('un error de red deja el reporte para reintentar', async () => {
    await enqueue(reporte('id-1'));
    createTicket.mockRejectedValueOnce(new Error('Network request failed'));

    const r = await syncQueue();
    expect(r.enviados).toBe(0);
    expect(r.reintentables).toBe(1);
    expect(r.rechazados).toBe(0);

    const cola = await readQueue();
    expect(cola).toHaveLength(1);
    expect(cola[0]!.attempts).toBe(1);
    expect(cola[0]!.rechazadoDefinitivamente).toBeUndefined();
  });

  it('un 5xx también se reintenta: el servidor puede recuperarse', async () => {
    await enqueue(reporte('id-1'));
    createTicket.mockRejectedValueOnce(new ApiError(503, 'service unavailable'));

    const r = await syncQueue();
    expect(r.reintentables).toBe(1);
    expect((await readQueue())[0]!.rechazadoDefinitivamente).toBeUndefined();
  });

  it('un 403 no se reintenta más, pero tampoco se borra solo', async () => {
    // El caso real: al vecino le dieron de baja el vínculo mientras estaba sin
    // señal. Antes esto se reencolaba para siempre y hacía fallar todas las
    // sincronizaciones siguientes.
    await enqueue(reporte('id-1'));
    createTicket.mockRejectedValueOnce(new ApiError(403, 'sin vínculo activo en ese consorcio'));

    const r = await syncQueue();
    expect(r.rechazados).toBe(1);
    expect(r.reintentables).toBe(0);

    const cola = await readQueue();
    expect(cola).toHaveLength(1);
    expect(cola[0]!.rechazadoDefinitivamente).toBe(true);
    expect(cola[0]!.lastError).toContain('vínculo');

    // Y en la pasada siguiente ni se intenta.
    createTicket.mockClear();
    const r2 = await syncQueue();
    expect(createTicket).not.toHaveBeenCalled();
    expect(r2.enviados).toBe(0);
    expect(r2.rechazados).toBe(1);
  });

  it('429 y 408 se tratan como transitorios, no como rechazo', async () => {
    await enqueue(reporte('id-1'));
    await enqueue(reporte('id-2'));
    createTicket
      .mockRejectedValueOnce(new ApiError(429, 'demasiados intentos'))
      .mockRejectedValueOnce(new ApiError(408, 'timeout'));

    const r = await syncQueue();
    expect(r.rechazados).toBe(0);
    expect(r.reintentables).toBe(2);
  });

  it('un reporte rechazado no bloquea a los demás', async () => {
    await enqueue(reporte('malo'));
    await enqueue(reporte('bueno'));
    createTicket
      .mockRejectedValueOnce(new ApiError(400, 'unidad inexistente'))
      .mockResolvedValueOnce({ id: 'ticket-ok' });

    const r = await syncQueue();
    expect(r.enviados).toBe(1);
    expect(r.rechazados).toBe(1);

    const cola = await readQueue();
    expect(cola).toHaveLength(1);
    expect(cola[0]!.id).toBe('malo');
  });

  it('el vecino puede descartar un reporte rechazado', async () => {
    await enqueue(reporte('id-1'));
    createTicket.mockRejectedValueOnce(new ApiError(400, 'no va'));
    await syncQueue();

    await descartar('id-1');
    expect(await readQueue()).toHaveLength(0);
  });

  it('con la cola vacía no llama a la API', async () => {
    const r = await syncQueue();
    expect(createTicket).not.toHaveBeenCalled();
    expect(r).toEqual({ enviados: 0, reintentables: 0, rechazados: 0, pendientes: 0 });
  });

  it('reintentar algo que en realidad sí entró no crea un segundo ticket', async () => {
    // La API deduplica por client_generated_id, así que el reintento devuelve el
    // mismo ticket. Lo que le toca a la cola es sacarlo, no encolarlo de nuevo.
    await enqueue(reporte('id-1'));
    createTicket.mockResolvedValueOnce({ id: 'ticket-ya-existia' });

    await syncQueue();
    expect(createTicket).toHaveBeenCalledTimes(1);
    expect(createTicket.mock.calls[0]![0]).toMatchObject({ client_generated_id: 'id-1' });
    expect(await readQueue()).toHaveLength(0);
  });
});
