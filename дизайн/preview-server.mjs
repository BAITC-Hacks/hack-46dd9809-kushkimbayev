import http from 'node:http';
import { readFile } from 'node:fs/promises';

// Serve only the design files; the project's backend and secrets are not exposed.
const files = new Map([
  ['/', ['preview.html', 'text/html']],
  ['/preview.html', ['preview.html', 'text/html']],
  ['/extension/content.js', ['extension/content.js', 'text/javascript']],
  ['/extension/app.html', ['extension/app.html', 'text/html']],
  ['/extension/app.css', ['extension/app.css', 'text/css']],
  ['/extension/app.js', ['extension/app.js', 'text/javascript']],
  ['/extension/assets/sip4.png', ['extension/assets/sip4.png', 'image/png']]
]);
const server = http.createServer(async (req, res) => {
  const entry = files.get(new URL(req.url, 'http://127.0.0.1:8788').pathname);
  if (req.method !== 'GET' || !entry) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await readFile(new URL(entry[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load design file'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port 8788 is already in use. Stop the previous preview and retry.' : error.message);
  process.exitCode = 1;
});
server.listen(8788, '127.0.0.1', () => console.log('EKT design preview: http://127.0.0.1:8788'));
