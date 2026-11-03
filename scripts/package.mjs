#!/usr/bin/env node
// 把 theme/ 打包成可上传的 komari 主题 zip：komari-theme.json + preview.png + dist/**
// 不依赖第三方库（ZIP store 模式），输出可复现：同样的 src 得到同样的字节。
//
//   node scripts/package.mjs            -> dist-package/StatusWall-<version>.zip
//   node scripts/package.mjs --out dir

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const themeDir = join(root, 'theme');

const manifest = JSON.parse(await readFile(join(themeDir, 'komari-theme.json'), 'utf8'));
const version = manifest.version;
const outFlag = process.argv.indexOf('--out');
const outDir = outFlag > -1 ? resolve(process.argv[outFlag + 1]) : join(root, 'dist-package');
const outFile = join(outDir, `StatusWall-${version}.zip`);

/* ---------------------------------------------------------------- CRC32 */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------------------------------------------------------- 收集文件 */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const files = [
  join(themeDir, 'komari-theme.json'),
  join(themeDir, 'preview.png'),
  ...await walk(join(themeDir, 'dist')),
].map((f) => ({ abs: f, name: relative(themeDir, f).split(sep).join('/') }))
  .sort((a, b) => (a.name < b.name ? -1 : 1));

/* ---------------------------------------------------------------- 写 ZIP */
const chunks = [];
const central = [];
let offset = 0;
/* 固定时间戳（2024-01-01 00:00），保证同样的 src 打包出同样的字节 */
const dosTime = 0;
const dosDate = ((2024 - 1980) << 9) | (1 << 5) | 1;

for (const { name, abs } of files) {
  const data = await readFile(abs);
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);           // version needed
  local.writeUInt16LE(0x0800, 6);       // UTF-8 flag
  local.writeUInt16LE(0, 8);            // store
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, data);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt16LE(dosTime, 12);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);

  offset += local.length + nameBuf.length + data.length;
}

const cdBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12);
eocd.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...chunks, cdBuf, eocd]);
await mkdir(outDir, { recursive: true });
await writeFile(outFile, zip);

const sha = createHash('sha256').update(zip).digest('hex');
console.log(`${relative(root, outFile)}  ${(zip.length / 1024).toFixed(1)} KB  ${files.length} files`);
console.log(`sha256 ${sha}`);
for (const f of files) console.log(`  ${f.name}`);
