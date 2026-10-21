import { mkdir, writeFile, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inspectPng, exportScale, checkDimensions } from './png.mjs';

export function nodeId(value) {
  const id = String(value).replace(/-/g, ':');
  if (!/^\d+:\d+$/.test(id)) throw new Error('Некорректный node ID: ожидается 123:456 или 123-456.');
  return id;
}

export function parseLink(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Ожидается полная HTTPS-ссылка Figma.'); }
  if (url.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(url.hostname) || url.username || url.password)
    throw new Error('Ожидается HTTPS-ссылка figma.com.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (!['design', 'file'].includes(parts[0]) || !/^[a-zA-Z0-9]+$/.test(parts[1] || ''))
    throw new Error('Поддерживаются Figma Design /design/ и /file/.');
  const key = parts[2] === 'branch' ? parts[3] : parts[1];
  if (!/^[a-zA-Z0-9]+$/.test(key || '')) throw new Error('Некорректный branch key.');
  const id = url.searchParams.has('node-id') ? nodeId(url.searchParams.get('node-id')) : undefined;
  return { fileKey: key, nodeId: id, url: `https://www.figma.com/design/${key}${id ? `?node-id=${encodeURIComponent(id)}` : ''}` };
}

export function safeName(value) {
  let result = String(value).normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-').replace(/\s+/g, '-').replace(/[. -]+$/g, '').replace(/^[. -]+/g, '').slice(0, 70).replace(/[. -]+$/g, '');
  if (!result || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(result)) result = `asset-${result || 'unnamed'}`;
  return result;
}

export function unwrap(response) {
  if (response?.isError) throw new Error('Figma MCP отклонил запрос. Проверьте доступ к файлу, авторизацию и лимиты в клиенте MCP.');
  if (response?.structuredContent != null) return response.structuredContent;
  if (response?.content) {
    for (const block of response.content) {
      if (block.type !== 'text') continue;
      try { return JSON.parse(block.text); } catch { /* XML or guidance */ }
    }
    return response.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  }
  return response;
}

function decode(value) {
  return value.replace(/&#(x[\da-f]+|\d+);|&(quot|apos|lt|gt|amp);/gi, (match, n, entity) => n ? String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)) : ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[entity.toLowerCase()]);
}

// get_metadata emits a small XML vocabulary. DTDs and external entities are never evaluated.
export function catalogue(response) {
  const data = unwrap(response);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const entries = data.pages || data.frames || data.nodes;
    if (Array.isArray(entries)) return entries.map(n => ({ ...n, id: n.id || n.guid }));
  }
  if (typeof data !== 'string') throw new Error('Неизвестная схема metadata MCP. Используйте мост Codex (CODEX.md).');
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* XML */ }
  const stack = [], result = [];
  for (const match of data.matchAll(/<\/?([a-z][\w-]*)\b([^>]*?)>/gi)) {
    const [tag, type, body] = match;
    if (tag.startsWith('</')) { stack.pop(); continue; }
    const attrs = Object.fromEntries([...body.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
    const entry = { id: attrs.id, name: attrs.name, type: type.toUpperCase(), width: Number(attrs.width), height: Number(attrs.height) };
    if (entry.id && (['canvas', 'page'].includes(type) || (type === 'frame' && !stack.includes('frame') && stack.every(x => ['canvas', 'page', 'section', 'document'].includes(x))))) result.push(entry);
    if (!tag.endsWith('/>')) stack.push(type);
  }
  if (!result.length) throw new Error('MCP не вернул страницы или верхнеуровневые фреймы. Используйте CODEX.md.');
  return result;
}

export async function http(url, options = {}, { fetcher = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(60000), redirect: 'error' }); }
    catch { throw new Error('Сетевая ошибка/таймаут. Проверьте соединение; повторите экспорт для обновления временных URL.'); }
    if (response.ok) return response;
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      const header = response.headers.get('retry-after');
      const delay = header == null ? 1000 * 2 ** attempt : /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
      await response.body?.cancel();
      if (delay > 30000) throw new Error(`Лимит API: повторите через ${Math.ceil(delay / 1000)} с (Retry-After).`);
      await sleep(Math.max(0, Number.isFinite(delay) ? delay : 1000));
      continue;
    }
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new Error(`HTTP ${response.status}: проверьте OAuth MCP и доступ; для asset URL повторите download_assets — ссылка могла истечь.`);
    if (response.status === 429) throw new Error('HTTP 429: лимит Figma исчерпан. Повторите позже.');
    throw new Error(`HTTP ${response.status}: запрос не выполнен. При 404 проверьте file key/node ID или обновите asset URL.`);
  }
}

export class McpClient {
  constructor(endpoint = 'https://mcp.figma.com/mcp', token = process.env.FIGMA_MCP_TOKEN) {
    this.endpoint = new URL(endpoint);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(this.endpoint.hostname);
    if (this.endpoint.username || this.endpoint.password || (this.endpoint.protocol !== 'https:' && !(local && this.endpoint.protocol === 'http:')))
      throw new Error('MCP endpoint должен использовать HTTPS (HTTP разрешён только для loopback).');
    this.token = token; this.id = 0; this.protocol = '2025-03-26';
  }
  async rpc(method, params, notification = false) {
    const id = ++this.id;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': this.protocol };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    const res = await http(this.endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }) });
    this.session = res.headers.get('mcp-session-id') || this.session;
    if (notification) { await res.body?.cancel(); return; }
    let message;
    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      try {
        while (!message) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
          if (buffer.length > 20 * 1024 * 1024) throw new Error('Ответ MCP слишком велик. Уточните node ID.');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = event.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n');
            if (!data) continue;
            const candidate = JSON.parse(data);
            if (candidate.id === id) message = candidate;
          }
        }
      } finally { await reader.cancel(); }
    } else message = await res.json();
    if (!message || message.id !== id) throw new Error('MCP не вернул ответ на запрос.');
    if (message.error) throw new Error(`Ошибка MCP (${message.error.code}). Проверьте совместимость инструментов и доступ в клиенте Figma.`);
    return message.result;
  }
  async connect() {
    const init = await this.rpc('initialize', { protocolVersion: this.protocol, capabilities: {}, clientInfo: { name: 'figma-design-downloader', version: '0.2.0' } });
    this.protocol = init.protocolVersion;
    await this.rpc('notifications/initialized', {}, true);
    this.tools = []; let cursor;
    do {
      const list = await this.rpc('tools/list', cursor ? { cursor } : {});
      this.tools.push(...list.tools); cursor = list.nextCursor;
    } while (cursor);
    if (!this.tools.some(t => t.name === 'download_assets')) throw new Error('Этот MCP endpoint не предоставляет download_assets. В Codex инструмент доступен: используйте CODEX.md; экспорт через REST не дублируется.');
  }
  async call(name, args) {
    const tool = this.tools.find(t => t.name === name);
    if (!tool) throw new Error(`MCP не предоставляет ${name}. Используйте мост Codex.`);
    if (name === 'get_metadata' && !args.nodeId && tool.inputSchema?.required?.includes('nodeId'))
      throw new Error('Этот сервер требует nodeId. Передайте ссылку на страницу или используйте мост Codex для списка страниц.');
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (result.isError) unwrap(result);
    return result;
  }
}

function assetUrl(value) {
  const u = new URL(value);
  const allowed = ['figma.com', 'figma-alpha.com', 'figmausercontent.com', 'amazonaws.com', 'cloudfront.net'];
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !allowed.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`)))
    throw new Error('Asset URL не принадлежит разрешённому HTTPS CDN Figma.');
  return u;
}

function validBytes(bytes, format) {
  if (format === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (['jpg','jpeg'].includes(format)) return bytes[0] === 255 && bytes[1] === 216;
  if (format === 'svg') return /<svg[\s>]/i.test(bytes.toString('utf8').slice(0, 16384));
  if (format === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (format === 'gif') return bytes.toString('ascii', 0, 3) === 'GIF';
  return format === 'original' && !/^\s*<!?html/i.test(bytes.toString('utf8').slice(0, 256));
}

async function ensureDirectory(directory) {
  const absolute = path.resolve(directory), root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    await mkdir(current).catch(e => { if (e.code !== 'EEXIST') throw e; });
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Каталог вывода содержит symlink или обычный файл. Выберите обычный каталог.');
  }
}

export async function saveExport({ source, node, response, out = 'design-reference', svg = false, raw = false, scale = 1, fetcher = fetch }) {
  scale = exportScale(scale);
  if (!node?.id || !node.name || !Number.isFinite(node.width) || !Number.isFinite(node.height) || node.width <= 0 || node.height <= 0)
    throw new Error('Нужны metadata фрейма: id, name, положительные width/height.');
  nodeId(node.id);
  if (!/^[a-zA-Z0-9]+$/.test(source?.fileKey || '')) throw new Error('Некорректный file key.');
  const data = unwrap(response);
  if (!data?.export?.url) throw new Error('download_assets не вернул export URL. Ничего не скачано.');
  if (data.export.nodeId && nodeId(data.export.nodeId) !== nodeId(node.id)) throw new Error('Node ID экспорта не совпадает с metadata.');
  const format = data.export.format;
  if (!['png','svg'].includes(format)) throw new Error('Для MVP запросите defaultFormat png или svg.');
  const root = path.resolve(out, source.fileKey, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`);
  await ensureDirectory(root);
  const metadata = { schemaVersion: 2, provider: 'figma-mcp/download_assets', fileKey: source.fileKey, sourceUrl: parseLink(source.url || `https://www.figma.com/design/${source.fileKey}`).url, createdAt: new Date().toISOString(), exportScale: scale, node: { id: node.id, name: node.name, width: node.width, height: node.height }, files: [], errors: [], warnings: [] };
  if (raw && data.rawImagesTruncated) metadata.warnings.push('MCP ограничил исходные изображения первыми 20.');
  if (svg && data.svgAssetsTruncated) metadata.warnings.push('MCP ограничил SVG ассеты первыми 20.');
  const jobs = [{ ...data.export, kind: 'frame', name: node.name }, ...(raw ? (data.rawImages || []).map((a,i) => ({ ...a, kind: 'image', name: `image-${i+1}` })) : []), ...(svg ? (data.svgAssets || []).map((a,i) => ({ ...a, kind: 'vector', name: `vector-${i+1}` })) : [])];
  for (const [i, job] of jobs.entries()) {
    const ext = job.format;
    const filename = `${safeName(job.name)}--${safeName(node.id)}-${i}.${ext === 'original' ? 'bin' : safeName(ext)}`;
    try {
      if (!['png','svg','jpg','jpeg','gif','webp','original'].includes(ext)) throw new Error('Неизвестный формат asset.');
      const res = await http(assetUrl(job.url), {}, { fetcher });
      const limit = 100 * 1024 * 1024;
      if (Number(res.headers.get('content-length')) > limit) { await res.body?.cancel(); throw new Error('Asset превышает 100 MiB.'); }
      const chunks = []; let size = 0;
      for await (const chunk of res.body) { size += chunk.length; if (size > limit) throw new Error('Asset превышает 100 MiB.'); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length || !validBytes(bytes, ext)) throw new Error('Содержимое не соответствует формату (возможно, истёк URL).');
      const image = ext === 'png' ? inspectPng(bytes) : undefined;
      if (image && job.kind === 'frame') checkDimensions(image, node, scale);
      await writeFile(path.join(root, filename), bytes, { flag: 'wx' });
      metadata.files.push({ path: filename, kind: job.kind, format: ext, nodeId: job.nodeId || null, bytes: size, sha256: createHash('sha256').update(bytes).digest('hex'), ...(image ? { image } : {}) });
    } catch (error) { metadata.errors.push({ kind: job.kind, index: i, message: error.message }); }
  }
  await writeFile(path.join(root, 'metadata.json.tmp'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  await rename(path.join(root, 'metadata.json.tmp'), path.join(root, 'metadata.json'));
  return { directory: root, metadata };
}
