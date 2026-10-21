import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
const root = await realpath(process.argv[2] || 'site/dist');
const port = Number(process.argv[3] || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.ttf':'font/ttf' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname);
    const file = await realpath(path.join(root, name.endsWith('/') ? name + 'index.html' : name));
    if (!file.startsWith(root + path.sep)) throw Error('Outside root');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`QA server http://127.0.0.1:${port}`));
