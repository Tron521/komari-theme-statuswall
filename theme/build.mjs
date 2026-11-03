#!/usr/bin/env node
// 把 src/ 组装成 dist/，注入内容哈希以破除预览站缓存。
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

const hash = createHash('sha256');
for (const file of ['style.css', 'app.js', 'index.html']) {
  hash.update(readFileSync(join(src, file)));
}
const version = hash.digest('hex').slice(0, 10);

cpSync(join(src, 'assets'), join(dist, 'assets'), { recursive: true });
cpSync(join(src, 'style.css'), join(dist, 'assets/style.css'));
cpSync(join(src, 'app.js'), join(dist, 'assets/app.js'));

const html = readFileSync(join(src, 'index.html'), 'utf8').replaceAll('{{V}}', version);
writeFileSync(join(dist, 'index.html'), html);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const bytes = walk(dist).reduce((sum, p) => sum + statSync(p).size, 0);
console.log(`built dist/ (v=${version}, ${walk(dist).length} files, ${(bytes / 1024).toFixed(1)} KB)`);
