import { inflateSync } from 'node:zlib';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function fail(message) { throw new Error(`Некорректный PNG: ${message}`); }
function paeth(a, b, c) {
  const p = a + b - c, x = Math.abs(p-a), y = Math.abs(p-b), z = Math.abs(p-c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}

// Static PNG image-data validation, including Adam7. Ancillary metadata is not rendered.
// Specification: https://www.w3.org/TR/png-3/
export function inspectPng(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0,8).equals(signature)) fail('сигнатура');
  let offset = 8, header, palette, ended = false, idatClosed = false, chunks = 0;
  const data = [];
  while (offset < bytes.length) {
    if (++chunks > 100000) fail('слишком много chunks');
    if (bytes.length - offset < 12) fail('усечённый chunk');
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (length > 0x7fffffff || end > bytes.length) fail('длина chunk');
    const type = bytes.toString('latin1', offset+4, offset+8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) fail('тип chunk');
    if (crc32(bytes.subarray(offset+4, end-4)) !== bytes.readUInt32BE(end-4)) fail(`CRC ${type}`);
    const payload = bytes.subarray(offset+8, end-4);
    if (!header && type !== 'IHDR') fail('первым должен быть IHDR');
    if (data.length && type !== 'IDAT') idatClosed = true;
    if (['acTL','fcTL','fdAT'].includes(type)) fail('APNG не поддерживается; нужен статический PNG');
    if (type === 'IHDR') {
      if (header || length !== 13) fail('IHDR');
      const width = payload.readUInt32BE(0), height = payload.readUInt32BE(4);
      const depth = payload[8], color = payload[9], interlace = payload[12];
      const depths = { 0:[1,2,4,8,16], 2:[8,16], 3:[1,2,4,8], 4:[8,16], 6:[8,16] };
      if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || width*height > 64000000) fail('размеры: максимум 64 млн пикселей');
      if (!depths[color]?.includes(depth) || payload[10] || payload[11] || interlace > 1) fail('параметры IHDR');
      header = { width, height, depth, color, interlace };
    } else if (type === 'PLTE') {
      if (palette || data.length || !length || length % 3 || length > 768 || [0,4].includes(header.color)) fail('PLTE');
      palette = length / 3;
      if (header.color === 3 && palette > 2 ** header.depth) fail('размер палитры');
    } else if (type === 'IDAT') {
      if (idatClosed || (header.color === 3 && !palette)) fail('порядок IDAT/PLTE');
      data.push(payload);
    } else if (type === 'IEND') {
      if (length || !data.length || end !== bytes.length) fail('IEND или данные после IEND');
      ended = true; offset = end; break;
    } else if (type[0] === type[0].toUpperCase()) fail(`неизвестный critical chunk ${type}`);
    offset = end;
  }
  if (!ended) fail('нет IEND');
  const { width, height, depth, color, interlace } = header;
  const channels = { 0:1, 2:3, 3:1, 4:2, 6:4 }[color], bits = channels*depth;
  const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const rows = passes.map(([x,y,dx,dy]) => {
    const w = Math.max(0, Math.ceil((width-x)/dx)), h = Math.max(0, Math.ceil((height-y)/dy));
    return { w, h, rowBytes: Math.ceil(w*bits/8) };
  }).filter(p => p.w && p.h);
  const expected = rows.reduce((n,p) => n + p.h*(1+p.rowBytes), 0);
  if (expected > 256*1024*1024) fail('распакованные данные превышают 256 MiB');
  const compressed = Buffer.concat(data);
  let decoded;
  try { decoded = inflateSync(compressed, { maxOutputLength: expected+1, info: true }); }
  catch { fail('повреждённый zlib/Adler32 или превышение размера'); }
  if (decoded.buffer.length !== expected || decoded.engine.bytesWritten !== compressed.length) fail('длина данных/zlib');
  let pos = 0;
  for (const { w, h, rowBytes } of rows) {
    let previous = Buffer.alloc(rowBytes);
    for (let y = 0; y < h; y++) {
      const filter = decoded.buffer[pos++];
      if (filter > 4) fail('фильтр строки');
      const row = decoded.buffer.subarray(pos, pos+rowBytes); pos += rowBytes;
      // Every sample value is valid except an out-of-range palette index.
      if (color === 3) {
        for (let i = 0; i < row.length; i++) {
          const a = i ? row[i-1] : 0, b = previous[i], c = i ? previous[i-1] : 0;
          row[i] = (row[i] + [0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter]) & 255;
        }
        for (let x = 0; x < w; x++) {
          const bit = x*depth, sample = (row[bit >>> 3] >>> (8-depth-(bit & 7))) & ((1 << depth)-1);
          if (sample >= palette) fail('индекс вне палитры');
        }
        previous = row;
      }
    }
  }
  return { width, height, bitDepth: depth, colorType: color, interlaced: !!interlace };
}

export function exportScale(value) {
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale < 0.01 || scale > 4) throw new Error('scale должен быть числом от 0.01 до 4.');
  return scale;
}

export function checkDimensions(image, node, scale) {
  const expected = { width: Math.max(1, Math.round(node.width*scale)), height: Math.max(1, Math.round(node.height*scale)) };
  if (image.width !== expected.width || image.height !== expected.height)
    throw new Error(`Размер PNG ${image.width}×${image.height} не совпадает с ожидаемым ${expected.width}×${expected.height} при scale=${scale}. Проверьте настройки экспорта Figma; изображение не сохранено.`);
}
