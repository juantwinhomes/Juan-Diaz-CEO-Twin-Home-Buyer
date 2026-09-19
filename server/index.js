/** Long-running Node server: local development, Docker, a VM, Render. */
import { createServer } from 'node:http';
import { handleRequest } from './handler.js';
import { authEnabled } from './auth.js';
import { init } from './db.js';

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const result = await handleRequest({
      method: req.method,
      path: decodeURIComponent(url.pathname),
      query: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers,
      body: await readBody(req),
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown',
      secure: (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
    });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  } catch (err) {
    console.error('[server]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error' }));
  }
});

await init();

server.listen(PORT, HOST, () => {
  console.log(`\n  AI & Systems Daily KPI Dashboard`);
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(authEnabled()
    ? '  ➜  Password protection is ON\n'
    : '  ➜  No password set (fine locally; set APP_PASSWORD before deploying)\n');
});
