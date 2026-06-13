import { createServer } from 'node:http';

const PORT = 8082;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  // Whisper-like transcription mock
  if (req.method === 'POST' && url.pathname === '/v1/audio/transcriptions') {
    return json(res, 200, {
      text: 'Hola, hay una pérdida de agua en el palier del 4to piso.',
      model: 'mock-whisper',
    });
  }

  // Classifier mock — returns deterministic JSON
  if (req.method === 'POST' && url.pathname === '/v1/classify') {
    const body = await readJson(req);
    const text = (body?.text ?? '').toLowerCase();
    const urgencia = /fuego|gas|incendio|inundaci/.test(text) ? 'CRITICA' :
                     /pérdida|perdida|fuga|sin luz|ascensor/.test(text) ? 'ALTA' :
                     'MEDIA';
    return json(res, 200, {
      titulo: text.slice(0, 60) || 'Reporte',
      descripcion_normalizada: text,
      categoria: /plomer|agua|pérdida|perdida/.test(text) ? 'plomeria' :
                 /luz|electric/.test(text) ? 'electricidad' :
                 /ascensor/.test(text) ? 'ascensor' : 'otros',
      origen: /palier|cochera|sum|hall|escaler|pasillo|comun/.test(text) ? 'ESPACIO_COMUN' : 'UNIDAD',
      urgencia,
      ubicacion: undefined,
      confianza: 0.82,
      modelo: 'mock-classifier',
      prompt_version: 'mock-0.0.0',
    });
  }

  // Embeddings mock — deterministic 384-d vector
  if (req.method === 'POST' && url.pathname === '/v1/embeddings') {
    const body = await readJson(req);
    const text = String(body?.text ?? '');
    const vector = new Array(384).fill(0).map((_, i) => ((text.charCodeAt(i % Math.max(1, text.length)) || 0) % 100) / 100);
    return json(res, 200, { vector, model: 'mock-embedder' });
  }

  json(res, 404, { error: 'not_found' });
});

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

server.listen(PORT, () => console.log(`mock-ai on :${PORT}`));
