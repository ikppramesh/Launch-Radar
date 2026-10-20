import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refresh, dayKey } from './src/fetcher.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS) || 3;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let running = null;
function runRefresh() {
  running ||= refresh().catch((e) => console.error('[refresh] failed:', e)).finally(() => { running = null; });
  return running;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, refreshing: !!running }));
  }

  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    const meta = await runRefresh();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: !!meta, added: meta?.added ?? 0 }));
  }

  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Latest Gadgets running at http://localhost:${PORT} (refresh every ${REFRESH_HOURS}h)`);
  runRefresh();
});

// Periodic refresh, plus an extra one right after midnight so "today" fills quickly.
let lastDay = dayKey(new Date());
setInterval(runRefresh, REFRESH_HOURS * 3600e3);
setInterval(() => {
  const d = dayKey(new Date());
  if (d !== lastDay) { lastDay = d; runRefresh(); }
}, 60e3);
