import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = 8081;
const outbox = [];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  // Read outbox (for E2E tests to inspect what the API sent us)
  if (req.method === 'GET' && url.pathname === '/__outbox') {
    return json(res, 200, outbox);
  }
  if (req.method === 'DELETE' && url.pathname === '/__outbox') {
    outbox.length = 0;
    return json(res, 204, {});
  }

  // Send (mock of Meta send API)
  if (req.method === 'POST' && url.pathname.startsWith('/v18.0/')) {
    const body = await readJson(req);
    const id = `wamid.${randomUUID()}`;
    outbox.push({ id, body, at: new Date().toISOString() });
    return json(res, 200, { messaging_product: 'whatsapp', messages: [{ id }] });
  }

  // Media download (mock): returns a tiny placeholder OGG-shaped buffer.
  // The real bytes don't matter when AI_PROVIDER=mock (MockTranscriber returns
  // a canned response); for AI_PROVIDER=openai this would 400 — use real Meta in that case.
  if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
    const buf = Buffer.from([0x4f, 0x67, 0x67, 0x53]); // "OggS"
    res.writeHead(200, { 'content-type': 'audio/ogg', 'content-length': buf.length });
    res.end(buf);
    return;
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

server.listen(PORT, () => console.log(`mock-whatsapp on :${PORT}`));
