#!/usr/bin/env node
// 用合成数据给主题拍截图：本地起一个静态服务器指向 theme/dist，拦截所有 API，
// 不连任何真实 Komari 站点，截图里不会出现真实机器名/价格。
//
//   node scripts/screenshot.mjs                # 生成 docs/screenshots + theme/preview.png
//   node scripts/screenshot.mjs --out /tmp/x   # 换输出目录
//
// 需要：npm i -D playwright && npx playwright install chromium

import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PUBLIC, NODES, TASKS, latestStatus, historyRecords, pingRecords, snapshot } from './fixtures.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'theme/dist');
const outDir = process.argv.includes('--out')
  ? resolve(process.argv[process.argv.indexOf('--out') + 1])
  : join(root, 'docs/screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404).end('api is mocked in the browser');
    return;
  }
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = join(dist, rel.replace(/^\/+/, ''));
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;
console.log(`serving ${dist} at ${url}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.route('**/api/public*', (r) => r.fulfill({ json: PUBLIC }));
await page.route('**/api/nodes*', (r) => r.fulfill({ json: { data: NODES } }));
await page.route('**/api/task/ping*', (r) => r.fulfill({ json: { data: TASKS } }));
await page.route('**/api/rpc2', async (r) => {
  const { method, params, id } = r.request().postDataJSON();
  let result = {};
  if (method === 'common:getRecords') {
    result = params && params.type === 'ping'
      ? { records: pingRecords(params.hours || 2), tasks: TASKS }
      : { records: historyRecords(params.hours || 2) };
  } else if (method === 'common:getNodesLatestStatus') {
    result = latestStatus();
  }
  await r.fulfill({ json: { jsonrpc: '2.0', id, result } });
});
// 实时通道：直接用快照喂 WS；浏览器不支持时退回轮询（同样被 mock）
try {
  await page.routeWebSocket('**/api/clients', (ws) => {
    ws.onMessage(() => ws.send(JSON.stringify(snapshot())));
  });
} catch {
  await page.route('**/api/clients', (r) => r.abort());
}

await mkdir(outDir, { recursive: true });
await page.goto(url, { waitUntil: 'domcontentloaded' });
const shots = [
  { name: 'desktop', width: 1920, height: 1080, scale: 'css' },
  { name: 'laptop', width: 1366, height: 768, scale: 'css' },
  { name: 'mobile', width: 390, height: 844, scale: 'device' },
];
for (const s of shots) {
  await page.setViewportSize({ width: s.width, height: s.height });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(outDir, `${s.name}.png`), scale: s.scale });
  console.log(`wrote ${join(outDir, s.name)}.png`);
}

// 主题预览图：1600×900、DPR 1，控制体积
await page.setViewportSize({ width: 1280, height: 720 });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
// 仓库里的 preview.png 是同一张图经外部工具压缩过的；这里只保证内容一致
await page.screenshot({ path: join(root, 'theme/preview.png'), scale: 'css' });
console.log('wrote theme/preview.png');

if (errors.length) {
  console.error('page errors:', errors.join(' | '));
  process.exitCode = 1;
}
await browser.close();
server.close();
