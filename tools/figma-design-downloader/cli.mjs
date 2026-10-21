#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parseLink, nodeId, McpClient, catalogue, saveExport } from './lib.mjs';
import { exportScale } from './png.mjs';
import { installCodex } from './integration.mjs';

const help = `Figma Design Downloader — Node.js 22+, без зависимостей

  node cli.mjs parse <figma-url>
  node cli.mjs install-codex [--project <project-root>]
  node cli.mjs list <figma-url> [--page 0:1]
  node cli.mjs download <figma-url> [--page 0:1] [--nodes 1:2,1:3]
       [--all] [--format png|svg] [--scale 1] [--svg-assets] [--raw] [--out design-reference]
  node cli.mjs import <figma-url> --response <json> --node-info <json>
       [--scale 1] [--svg-assets] [--raw] [--out design-reference]
  node cli.mjs catalog --response <metadata-json>

list/download: MCP Streamable HTTP, --mcp-url или FIGMA_MCP_URL.
OAuth access token: только FIGMA_MCP_TOKEN. PAT для MCP не подходит.
В Codex используйте CODEX.md: доступ к подключённому MCP не требует токена CLI.
Без --page список страниц; без выбора экспорт не начинается. --all — только
фреймы выбранной страницы. import принимает сохранённый ответ download_assets.
`;

async function json(file) {
  let input;
  if (file !== '-') input = await readFile(file, 'utf8');
  else { input = ''; for await (const chunk of stdin) input += chunk; }
  try { return JSON.parse(input); } catch { throw new Error('Некорректный JSON входного файла/stdin.'); }
}

async function pick(entries, label, multiple = false) {
  entries.forEach((n,i) => console.log(`${i+1}. ${n.name} [${n.id}]${n.width > 0 ? ` ${n.width}×${n.height}` : ''}`));
  if (!entries.length) throw new Error('Список пуст.');
  if (!stdin.isTTY) throw new Error('Для неинтерактивного запуска укажите --page и --nodes (или --all для выбранной страницы).');
  const rl = createInterface({ input: stdin, output: stdout });
  let answer; try { answer = await rl.question(`${label} (номера${multiple ? ', через запятую' : ''}; пусто — отмена): `); } finally { rl.close(); }
  if (!answer.trim()) throw new Error('Выбор отменён; экспорт не запускался.');
  const ids = answer.split(',').map(x => { if (!/^\s*\d+\s*$/.test(x)) throw new Error('Ожидаются номера списка.'); return Number(x)-1; });
  if ((!multiple && ids.length !== 1) || ids.some(i => i < 0 || i >= entries.length)) throw new Error('Некорректный выбор.');
  return [...new Set(ids)].map(i => entries[i]);
}

async function main() {
  const { values: options, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, page: { type: 'string' }, nodes: { type: 'string' }, all: { type: 'boolean' },
    format: { type: 'string', default: 'png' }, raw: { type: 'boolean' }, 'svg-assets': { type: 'boolean' },
    out: { type: 'string', default: 'design-reference' }, response: { type: 'string' }, 'node-info': { type: 'string' }, 'mcp-url': { type: 'string' },
    scale: { type: 'string', default: '1' }, project: { type: 'string' }
  } });
  const [command, link] = positionals;
  if (!command || options.help) { console.log(help); return; }
  if (command === 'install-codex') {
    if (positionals.length !== 1) throw new Error('install-codex принимает путь только через --project.');
    console.log(JSON.stringify(await installCodex(options.project), null, 2)); return;
  }
  if (!['parse','list','download','import','catalog'].includes(command)) throw new Error('Неизвестная команда. См. --help.');
  const scale = exportScale(options.scale);
  if (!['png','svg'].includes(options.format)) throw new Error('--format должен быть png или svg.');
  if (options.all && options.nodes) throw new Error('--all и --nodes несовместимы.');
  if (command === 'catalog') {
    if (!options.response) throw new Error('Укажите --response.');
    console.log(JSON.stringify(catalogue(await json(options.response)), null, 2));
    return;
  }
  const source = parseLink(link);
  if (source.nodeId && options.page && source.nodeId !== nodeId(options.page)) throw new Error('node-id ссылки конфликтует с --page. Передайте ссылку на файл либо уберите --page.');
  if (command === 'parse') { console.log(JSON.stringify(source, null, 2)); return; }
  const save = async (node, response) => {
    const result = await saveExport({ source, node, response, out: options.out, svg: options['svg-assets'], raw: options.raw, scale });
    console.log(JSON.stringify(result, null, 2));
    if (result.metadata.errors.length) process.exitCode = 1;
  };
  if (command === 'import') {
    if (!options.response || !options['node-info']) throw new Error('import требует --response и --node-info.');
    if (options.response === '-' && options['node-info'] === '-') throw new Error('stdin допускается только для одного JSON.');
    const node = await json(options['node-info']);
    if (source.nodeId && source.nodeId !== nodeId(node.id)) throw new Error('Ссылка import должна указывать на экспортируемый frame.');
    await save(node, await json(options.response));
  } else {
    const client = new McpClient(options['mcp-url'] || process.env.FIGMA_MCP_URL);
    await client.connect();
    const metadata = async id => catalogue(await client.call('get_metadata', { fileKey: source.fileKey, ...(id ? { nodeId: id } : {}) }));
    let entries = await metadata(source.nodeId || (options.page && nodeId(options.page)));
    const direct = source.nodeId && entries.find(n => n.id === source.nodeId && n.type === 'FRAME');
    if (direct && options.nodes) throw new Error('Для выбора нескольких nodes передайте ссылку на страницу или файл.');
    let frames = entries.filter(n => n.type === 'FRAME');
    if (!frames.length) {
      if (options.page || source.nodeId) throw new Error('В выбранном node/page нет верхнеуровневых фреймов. Укажите другую страницу.');
      const pages = entries.filter(n => n.type !== 'FRAME');
      if (command === 'list' && !options.page) { console.log(JSON.stringify({ pages, next: 'Выберите страницу: --page <id>' }, null, 2)); return; }
      const page = options.page ? pages.find(n => n.id === nodeId(options.page)) : (await pick(pages, 'Страница'))[0];
      if (!page) throw new Error('Выбранная страница отсутствует в файле.');
      entries = await metadata(page.id); frames = entries.filter(n => n.type === 'FRAME');
    }
    if (command === 'list') { console.log(JSON.stringify({ frames }, null, 2)); return; }
    let selected;
    if (direct) selected = [direct];
    else if (options.nodes) {
      const ids = [...new Set(options.nodes.split(',').map(nodeId))];
      selected = ids.map(id => { const n = frames.find(n => n.id === id); if (!n) throw new Error(`Фрейм ${id} отсутствует на выбранной странице.`); return n; });
    } else if (options.all) selected = frames;
    else selected = await pick(frames, 'Фреймы', true);
    if (!selected.length) throw new Error('Нет выбранных фреймов.');
    for (const node of selected) {
      try { await save(node, await client.call('download_assets', { fileKey: source.fileKey, nodeId: node.id, defaultFormat: options.format, defaultScale: scale })); }
      catch (e) { console.error(`Фрейм ${node.id}: ${e.message}`); process.exitCode = 1; }
    }
  }
}
main().catch(e => { console.error(`Ошибка: ${e.message}`); process.exitCode = 1; });
