import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function readOrdinary(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Нужен обычный файл: ${path.basename(file)}`);
    return await readFile(file, 'utf8');
  } catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}
function block(text, body, start = '<!-- figma-design-downloader:start -->', end = '<!-- figma-design-downloader:end -->') {
  const begins = text.split(start).length-1, ends = text.split(end).length-1;
  if (begins !== ends || begins > 1 || (begins && text.indexOf(end) < text.indexOf(start)))
    throw new Error('Повреждён блок figma-design-downloader; исправьте его вручную.');
  const value = `${start}\n${body}\n${end}`;
  return begins ? text.slice(0,text.indexOf(start)) + value + text.slice(text.indexOf(end)+end.length)
    : text + (text && !text.endsWith('\n') ? '\n' : '') + (text ? '\n' : '') + value + '\n';
}

export async function installCodex(project = process.cwd()) {
  const root = await realpath(project);
  if (!(await lstat(root)).isDirectory()) throw new Error('project должен быть каталогом.');
  const tool = await realpath(path.dirname(fileURLToPath(import.meta.url)));
  const relative = path.relative(root, tool);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('Сначала скопируйте инструмент в подпапку проекта, например tools/figma-design-downloader.');
  if (/[\r\n`<>]/.test(relative)) throw new Error('Путь инструмента содержит неподдерживаемые символы.');
  if (await lstat(path.join(root, 'AGENTS.override.md')).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; }))
    throw new Error('AGENTS.override.md имеет приоритет: добавьте ссылку на CODEX.md в него вручную. Файлы не изменены.');
  const agents = path.join(root,'AGENTS.md'), ignore = path.join(root,'.gitignore');
  const oldAgents = await readOrdinary(agents), oldIgnore = await readOrdinary(ignore);
  const guide = relative.split(path.sep).join('/') + '/CODEX.md';
  const newAgents = block(oldAgents, `Для запросов на скачивание материалов Figma через Figma Design Downloader прочитай \`${guide}\` и следуй этому workflow. Не применяй его к другим задачам.`);
  const newIgnore = block(oldIgnore, '/design-reference/\n/.figma-work/', '# figma-design-downloader:start', '# figma-design-downloader:end');
  // Validate both inputs before writing either. Repeated installation keeps one managed block.
  if (newAgents !== oldAgents) await writeFile(agents, newAgents);
  if (newIgnore !== oldIgnore) await writeFile(ignore, newIgnore);
  return { project: root, guide, changed: { agents: newAgents !== oldAgents, gitignore: newIgnore !== oldIgnore } };
}
