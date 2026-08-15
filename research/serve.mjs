// Tiny static file server for local usage of the web UI.
// Also exported for tests: startServer() on an ephemeral port.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'web') + sep;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

export function startServer(port = 0, host = '127.0.0.1') {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path === '/') path = '/index.html';
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(port, host, () => {
      resolvePromise({
        port: server.address().port,
        url: `http://${host}:${server.address().port}/`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// direct run: serve on PORT (default 8080)
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  const PORT = Number(process.env.PORT) || 8080;
  const s = await startServer(PORT);
  console.log(`DSP 计算器已启动: ${s.url}  (Ctrl+C 停止)`);
}
