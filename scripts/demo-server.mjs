#!/usr/bin/env node
// 演示服务：用 fixtures.mjs 的合成数据模拟 Komari 公开接口，并托管 theme/dist。
// 零依赖：REST、/api/rpc2 和 WebSocket /api/clients 都在这里。数字带轻微随机波动，看起来像在跑。
// usage: node scripts/demo-server.mjs [--port 8090] [--host 127.0.0.1] [--dist theme/dist]
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC, NODES, TASKS, latestStatus, historyRecords, pingRecords, snapshot } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };
const port = Number(opt('--port', 8090));
const host = opt('--host', '127.0.0.1');
const dist = resolve(opt('--dist', join(here, '../theme/dist')));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

// 围绕 fixtures 的基准值抖动，同一秒内各处一致
const wobble = (seed, spread) => 1 + spread * Math.sin(Date.now() / 7000 + seed * 1.7) * (0.6 + 0.4 * Math.random());

function liveStatus() {
  const res = latestStatus();
  NODES.forEach((n, i) => {
    const st = res[n.uuid];
    if (!st) return;
    st.cpu = Math.min(100, Math.max(0.1, st.cpu * wobble(i, 0.35)));
    st.net_in = Math.round(st.net_in * wobble(i + 3, 0.6));
    st.net_out = Math.round(st.net_out * wobble(i + 5, 0.6));
    st.connections = Math.round(st.connections * wobble(i + 7, 0.1));
    st.process = Math.round(st.process * wobble(i + 9, 0.04));
  });
  return res;
}

function liveSnapshot() {
  const snap = snapshot();
  const st = liveStatus();
  for (const [uuid, d] of Object.entries(snap.data.data)) {
    const s = st[uuid];
    d.cpu.usage = s.cpu;
    d.network.up = s.net_out;
    d.network.down = s.net_in;
    d.connections.tcp = s.connections;
    d.process = s.process;
  }
  return snap;
}

function rpc(body) {
  const { method, params = {}, id = null } = body || {};
  let result;
  if (method === 'common:getRecords') {
    const hours = Math.min(Number(params.hours) || 2, 6);
    result = params.type === 'ping'
      ? { records: pingRecords(hours), tasks: TASKS }
      : { records: historyRecords(hours) };
  } else if (method === 'common:getNodesLatestStatus') {
    result = liveStatus();
  } else if (method === 'common:getMe') {
    result = { logged_in: false, username: '', uuid: '' };
  } else {
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found in demo' } };
  }
  return { jsonrpc: '2.0', id, result };
}

// 演示站没有后台：「登录」按钮点进来看到的说明页
const ADMIN_PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>演示站 · 没有后台</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fdf6e3;color:#586e75;font:15px/1.7 system-ui,-apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif}
main{max-width:30em;padding:28px 30px;border-radius:18px;background:rgba(255,255,255,.55);border:1px solid #e4dcc4;box-shadow:0 10px 30px rgba(88,110,117,.12)}
h1{margin:0 0 8px;font-size:20px;color:#073642}a{color:#268bd2}
</style></head><body><main><h1>这是 StatusWall 的演示站</h1>
<p>页面上的机器和数字都是合成数据，所以这里没有真正的 Komari 后台。</p>
<p>装到你自己的 Komari 上后，这个按钮会进入你的管理后台；不想让访客看到它，可以在主题设置里关闭「显示后台入口」。</p>
<p><a href="/">← 回到演示页</a> · <a href="https://github.com/Tron521/komari-theme-statuswall">GitHub</a></p></main></body></html>`;

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
};
const json = (res, data) => send(res, 200, 'application/json', JSON.stringify(data));

async function serveFile(res, path) {
  let file = join(dist, decodeURIComponent(path));
  if (!file.startsWith(dist + sep)) file = join(dist, 'index.html');
  try {
    if (!(await stat(file)).isFile()) file = join(dist, 'index.html');
  } catch {
    file = join(dist, 'index.html');
  }
  let body = await readFile(file);
  if (file.endsWith('index.html')) {
    // 与 Komari 服务端一样替换站点名与描述
    body = Buffer.from(String(body)
      .replace('<title>Komari Monitor</title>', `<title>${PUBLIC.data.sitename}</title>`)
      .replace('A simple server monitor tool.', 'StatusWall theme demo with synthetic data'));
  }
  send(res, 200, TYPES[extname(file)] || 'application/octet-stream', body);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/api/public') return json(res, PUBLIC);
    if (pathname === '/api/nodes') return json(res, { status: 'success', data: NODES });
    if (pathname === '/api/task/ping') return json(res, { status: 'success', data: TASKS });
    if (pathname === '/api/version') return json(res, { status: 'success', data: { version: 'demo' } });
    if (pathname === '/api/me') return json(res, { status: 'success', data: { logged_in: false } });
    if (pathname === '/api/rpc2' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 65536) break; }
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, 'text/plain', 'bad json'); }
      return json(res, rpc(body));
    }
    if (pathname.startsWith('/api/')) return send(res, 404, 'text/plain', 'not available in demo');
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return send(res, 200, 'text/html; charset=utf-8', ADMIN_PAGE);
    return await serveFile(res, pathname);
  } catch (err) {
    send(res, 500, 'text/plain', String(err && err.message));
  }
});

// ---- 最小 WebSocket：只处理文本帧（客户端发 "get"，回一份快照）、ping 与 close
function frame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
      : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
  return Buffer.concat([head, payload]);
}

server.on('upgrade', (req, socket) => {
  const { pathname } = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/api/clients' || !key) { socket.destroy(); return; }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > 65536) { socket.destroy(); return; }
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { socket.destroy(); return; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
      if (mask) for (let i = 0; i < data.length; i += 1) data[i] ^= mask[i & 3];
      buf = buf.subarray(need);
      if (opcode === 0x8) { socket.end(frame(0x8, Buffer.alloc(0))); return; }
      if (opcode === 0x9) socket.write(frame(0xA, data));
      else if (opcode === 0x1) socket.write(frame(0x1, Buffer.from(JSON.stringify(liveSnapshot()))));
    }
  });
  socket.on('error', () => socket.destroy());
});

server.listen(port, host, () => console.log(`StatusWall demo on http://${host}:${port} (dist: ${dist})`));
