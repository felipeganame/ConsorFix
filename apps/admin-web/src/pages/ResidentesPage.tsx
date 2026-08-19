import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  createResidente,
  importarResidentes,
  listConsorcios,
  listResidentes,
  type Consorcio,
  type Residente,
  type ResultadoImport,
} from '../lib/api.js';

export function ResidentesPage(): JSX.Element {
  const [items, setItems] = useState<Residente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('+54');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Importación masiva (RF-A05). El endpoint existía desde el PR #38 y no había
  // ninguna pantalla que lo llamara: cargar un consorcio de 80 unidades había
  // que hacerlo de a un vecino por vez.
  const [showImport, setShowImport] = useState(false);
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [impConsorcio, setImpConsorcio] = useState('');
  const [csv, setCsv] = useState('');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [crearUnidades, setCrearUnidades] = useState(true);
  const [informe, setInforme] = useState<ResultadoImport | null>(null);

  // Mismo criterio que en Consorcios: "sin vecinos" solo se afirma cuando se
  // sabe. Antes se afirmaba durante la carga y también cuando el pedido fallaba.
  const [cargando, setCargando] = useState(true);

  function load() {
    setCargando(true);
    listResidentes()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }
  useEffect(load, []);
  useEffect(() => {
    listConsorcios().then(setConsorcios).catch(() => setConsorcios([]));
  }, []);

  function onElegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setNombreArchivo(f.name);
    setInforme(null);
    const reader = new FileReader();
    // Se lee acá y se manda como texto: la API recibe el CSV en el body, así
    // que no hace falta multipart ni multer del otro lado.
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.onerror = () => setError('No pude leer el archivo.');
    reader.readAsText(f, 'utf-8');
  }

  async function correrImport(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await importarResidentes({
        consorcio_id: impConsorcio,
        csv,
        dry_run: dryRun,
        crear_unidades: crearUnidades,
      });
      setInforme(r);
      if (!dryRun) load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createResidente({
        nombre,
        telefono_e164: telefono,
        ...(email && { email }),
        ...(password && { password }),
      });
      setNombre('');
      setTelefono('+54');
      setEmail('');
      setPassword('');
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="Vecinos"
        subtitle={`${items.length} ${items.length === 1 ? 'residente registrado' : 'residentes registrados'}`}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => setShowImport((s) => !s)}>
              <Icons.filter size={14} /> {showImport ? 'Cerrar importación' : 'Importar CSV'}
            </button>
            <button type="button" className="btn primary" onClick={() => setShowForm((s) => !s)}>
              <Icons.plus size={14} sw={2.2} /> {showForm ? 'Cancelar' : 'Nuevo vecino'}
            </button>
          </>
        }
      />
      <div className="content">
        <section className="stack">
          {showImport && (
            <div className="card form-grid">
              <div className="form-full" style={{ fontSize: 13, fontWeight: 600 }}>Importar vecinos desde una planilla</div>
              <div className="form-full muted small">
                Columnas aceptadas: <span className="mono">nombre, telefono, email, unidad, rol</span>.
                Acepta alias comunes (celular o whatsapp por telefono; depto o lote por unidad;
                vinculo o tipo por rol) y no distingue acentos ni mayúsculas.
              </div>
              <label>
                <span>Consorcio destino</span>
                <select value={impConsorcio} onChange={(e) => setImpConsorcio(e.target.value)} required>
                  <option value="">Elegí un consorcio…</option>
                  {consorcios.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Archivo CSV</span>
                <input type="file" accept=".csv,text/csv" onChange={onElegirArchivo} />
              </label>
              {nombreArchivo && (
                <div className="muted small">
                  {nombreArchivo} · {csv.split('\n').filter((l) => l.trim()).length} líneas leídas
                </div>
              )}
              <label className="form-full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={crearUnidades} onChange={(e) => setCrearUnidades(e.target.checked)} />
                <span>Crear las unidades que no existan</span>
              </label>
              <div className="form-full actions">
                {/* Primero se prueba, después se aplica: en una planilla de 200
                    filas conviene ver el informe antes de escribir nada. */}
                <button type="button" className="btn ghost" disabled={busy || !csv || !impConsorcio} onClick={() => correrImport(true)}>
                  Probar sin guardar
                </button>
                <button type="button" className="btn primary" disabled={busy || !csv || !impConsorcio} onClick={() => correrImport(false)}>
                  {busy ? 'Procesando…' : 'Importar de verdad'}
                </button>
              </div>

              {informe && (
                <div className="form-full card tight">
                  <div className="row-between">
                    <strong style={{ fontSize: 13 }}>
                      {informe.dryRun ? 'Prueba (no se guardó nada)' : 'Importación aplicada'}
                    </strong>
                    <span className="muted small">{informe.totalFilas} filas en el archivo</span>
                  </div>
                  <div className="kpi-strip mt-3">
                    <div className="kpi">
                      <div className="kpi-label">Vecinos nuevos</div>
                      <div className="kpi-value">{informe.insertadas}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Vínculos creados</div>
                      <div className="kpi-value">{informe.vinculosCreados}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Ya existían</div>
                      <div className="kpi-value">{informe.vinculosYaExistentes}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Con error</div>
                      <div className="kpi-value">{informe.errores.length}</div>
                    </div>
                  </div>

                  {informe.unidadesCreadas.length > 0 && (
                    <div className="muted small mt-3">
                      Unidades creadas: {informe.unidadesCreadas.join(', ')}
                    </div>
                  )}

                  {informe.reusados.length > 0 && (
                    <div className="mt-3">
                      <div className="uppercase">Vecinos que ya existían por teléfono</div>
                      <div className="muted small">
                        Se reusó el registro existente. El nombre del archivo NO se aplicó.
                      </div>
                      <table className="grid mt-2">
                        <thead>
                          <tr><th>Fila</th><th>Teléfono</th><th>En el archivo</th><th>En el sistema</th></tr>
                        </thead>
                        <tbody>
                          {informe.reusados.map((r) => (
                            <tr key={`${r.fila}-${r.telefono}`}>
                              <td className="mono">{r.fila}</td>
                              <td className="mono">{r.telefono}</td>
                              <td>{r.nombreEnArchivo}</td>
                              <td>{r.nombreExistente}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {informe.errores.length > 0 && (
                    <div className="mt-3">
                      <div className="uppercase">Filas rechazadas</div>
                      <table className="grid mt-2">
                        <thead>
                          <tr><th>Fila</th><th>Motivo</th><th>Datos</th></tr>
                        </thead>
                        <tbody>
                          {informe.errores.map((er) => (
                            <tr key={`${er.fila}-${er.motivo}`}>
                              <td className="mono">{er.fila}</td>
                              <td>{er.motivo}</td>
                              <td className="muted small">{Object.values(er.datos).filter(Boolean).join(' · ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {showForm && (
            <form className="card form-grid" onSubmit={onCreate}>
              <label>
                <span>Nombre completo</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={140} />
              </label>
              <label>
                <span>Teléfono (E.164)</span>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} required pattern="\+[1-9]\d{6,14}" maxLength={16} placeholder="+5491100000000" />
              </label>
              <label>
                <span>Email (opcional)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                <span>Contraseña inicial</span>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={200} placeholder="Mínimo 6 caracteres" />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !nombre || !telefono}>Crear vecino</button>
            </form>
          )}

          {error && <div className="error">{error}</div>}

          <table className="grid">
            <thead>
              <tr>
                <th>Vecino</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th style={{ width: 100 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted center">
                    {cargando ? 'Cargando…' : error ? 'No se pudo cargar la lista.' : 'Sin vecinos cargados.'}
                  </td>
                </tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                    <div className="mono small muted">#{r.id.slice(0, 8)}</div>
                  </td>
                  <td className="mono">{r.telefonoE164}</td>
                  <td>{r.email ?? <span className="muted">—</span>}</td>
                  <td>
                    {r.activo
                      ? <span className="chip ok"><span className="dot" />Activo</span>
                      : <span className="chip">Inactivo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
