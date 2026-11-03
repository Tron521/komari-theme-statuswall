/* Komari StatusWall — 状态墙
 * 8 通道实时信号墙：数字 + 60 分钟镜像双轴波形 + 三网信号条。
 * 只使用 Komari 公开只读接口。 */

const DEFAULTS = {
  refreshInterval: 3,
  historyHours: 2,
  usdCny: 7.1,
  eurCny: 8.0,
  showFinance: true,
  showTrace: true,
  warnThreshold: 85,
  colorMode: 'auto',
  hiddenNodes: '',
  offlineLast: false,
  showAdmin: true,
  icpText: '',
  icpUrl: '',
};

const SETTING_KEYS = Object.keys(DEFAULTS);

const POLL_PING_MS = 12000;

const LB = 24; // 三网状态条格数
const SEG = { ok: 'var(--seg-ok)', slow: 'var(--seg-slow)', bad: 'var(--seg-bad)', loss: 'var(--seg-loss)' };

/* 一格的状态。一格只有几次探测（2 小时 / 24 格 ≈ 5 分钟），丢 1 次就是 20%，
   所以按「丢了几次」分级；不丢包时看延迟比这条线路平时（中位数）高出多少。
   国内线路常年有零星丢包，这样平时是一片绿，真正断流才会成片发红。 */
function segmentLevel(bk, med) {
  if (bk.ms == null || bk.loss >= 60) return 'loss';
  const over = med > 0 ? (bk.ms - med) / med : 0;
  if (bk.loss >= 40 || over >= 0.6) return 'bad';
  if (bk.loss >= 20 || over >= 0.25) return 'slow';
  return 'ok';
}
const SEG_TEXT = { ok: '正常', slow: '偏慢', bad: '很慢或丢包', loss: '丢包严重' };
const NB = 30; // 波形桶数（历史窗口）
const CHART_W = 600;
const CHART_H = 96;
const MID = 48;

/* Solarized 色阶：green → yellow → orange → red */

const CURRENCY_BY_SYMBOL = {
  '¥': 'CNY', '￥': 'CNY', 'CNY': 'CNY', 'RMB': 'CNY',
  '$': 'USD', 'USD': 'USD', 'US$': 'USD',
  '€': 'EUR', 'EUR': 'EUR',
  '£': 'GBP', 'GBP': 'GBP',
  'HK$': 'HKD', 'HKD': 'HKD',
  '₽': 'RUB', 'RUB': 'RUB',
  '₹': 'INR', 'INR': 'INR',
  '₫': 'VND', 'VND': 'VND',
  '฿': 'THB', 'THB': 'THB',
  '₣': 'CHF', 'CHF': 'CHF',
  'CA$': 'CAD', 'C$': 'CAD', 'CAD': 'CAD',
};

const BILLING_RANGES = [
  ['monthly', 27, 32, '月'],
  ['quarterly', 87, 95, '季'],
  ['semi_annual', 175, 185, '半年'],
  ['annual', 360, 370, '年'],
  ['biennial', 720, 750, '两年'],
  ['triennial', 1080, 1150, '三年'],
  ['quinquennial', 1800, 1850, '五年'],
];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------------------------------------------------------------- 格式化

const nf = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const hmFmt = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

/* 接口里的时间可能是空串、0 或坏字符串：Intl.format(Invalid Date) 会抛 RangeError，
   把这个主题整块渲染打断。所有「来自接口的时间」都必须先过这两层。 */
function safeDate(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}
function fmtDate(v, fallback = '—') {
  const d = safeDate(v);
  return d ? dateFmt.format(d) : fallback;
}

function num(v, digits = 1) {
  if (!Number.isFinite(v)) return '—';
  if (digits === 0) return nf0.format(v);
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];

function splitBytes(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  let i = 0;
  let x = abs;
  while (x >= 1024 && i < BYTE_UNITS.length - 1) { x /= 1024; i += 1; }
  return { value: x, unit: BYTE_UNITS[i] };
}

// 短字节：「513M」「7.8G」，只在不共单位时用
function shortBytes(v) {
  const { value, unit } = splitBytes(v);
  if (unit === 'B') return `${num(value, 0)}B`;
  return `${num(value, value < 10 ? 1 : 0)}${unit[0]}`;
}

// 「已用 / 总量」：共用一个单位、尽量短，例如 4.3 / 16 GB、513M / 7.8G
function pairText(used, total) {
  if (!(Number(total) > 0)) return '';
  const u = splitBytes(used);
  const t = splitBytes(total);
  if (u.unit !== t.unit) return `${shortBytes(used)} / ${shortBytes(total)}`;
  const du = u.value < 10 ? 1 : 0;
  const dt = t.value < 10 ? 1 : 0;
  // 四列最窄的一档（1024–1279）和 360 以下的小屏去掉斜杠两侧空格，省下的宽度刚好不被省略号截断
  const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const sep = (w >= 1024 && w < 1280) || w < 360 ? '/' : ' / ';
  return `${num(u.value, du)}${sep}${num(t.value, dt)} ${t.unit}`;
}

// CPU 用「占用核数 / 总核数」，占用核数按百分比换算
function coresText(pct, cores) {
  if (!(cores > 0)) return '';
  const used = (Number(pct) || 0) * cores / 100;
  return `${num(used, used < 1 ? 2 : 1)} / ${cores} 核`;
}

function fmtBytes(v) {
  const { value, unit } = splitBytes(v);
  return `${num(value, unit === 'B' ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0)} ${unit}`;
}

function bytesParts(v) {
  const { value, unit } = splitBytes(v);
  const digits = unit === 'B' ? 0 : value < 10 ? 1 : 0;
  return { v: num(value, digits), u: unit };
}

function fmtBps(v) {
  const { value, unit } = splitBytes(v);
  const digits = value < 10 ? 1 : value < 100 ? 1 : 0;
  return `${num(value, digits)} ${unit}/s`;
}

function pct(v, digits = 1) {
  if (!Number.isFinite(v)) return '—';
  return `${num(v, digits)}%`;
}

function fmtUptime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 时`;
  if (h > 0) return `${h} 时 ${m} 分`;
  return `${m} 分`;
}

function fmtAgo(ts) {
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 90_000) return '刚刚';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)} 小时前`;
  return `${Math.round(diff / 86400_000)} 天前`;
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function levelOf(value, warnAt, critAt) {
  if (!Number.isFinite(value)) return 'off';
  if (value >= critAt) return 'crit';
  if (value >= warnAt) return 'warn';
  return 'ok';
}

// ---------------------------------------------------------------- 财务

function currencyCodeOf(raw) {
  const key = String(raw || '').trim();
  return CURRENCY_BY_SYMBOL[key] || CURRENCY_BY_SYMBOL[key.toUpperCase()] || 'CNY';
}

function billingText(cycle) {
  const c = Number(cycle);
  if (c === -1) return '一次性';
  for (const [, min, max, label] of BILLING_RANGES) {
    if (c >= min && c <= max) return label;
  }
  if (c > 0) return `${c} 天`;
  return '—';
}

function daysUntil(expiredAt) {
  if (!expiredAt) return null;
  // 与 safeDate() 保持一致：数字时间戳也认，避免「有日期但没有剩余天数」
  const t = typeof expiredAt === 'number' ? expiredAt : Date.parse(expiredAt);
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return Math.floor(diff / 86400000);
  return Math.ceil(diff / 86400000);
}

function remainValue(price, cycle, expiredAt) {
  if (!price || price <= 0) return 0;
  const days = daysUntil(expiredAt);
  if (days === null) return 0;
  if (days <= 0) return 0;
  if (days > 36500) return price;
  const c = Number(cycle);
  if (!Number.isFinite(c) || c <= 0) return price;
  return price * (days / c);
}

// 一次性付费（周期 -1）或没填周期的机器不产生月成本
function monthlyCost(price, cycle) {
  if (!price || price <= 0) return 0;
  const c = Number(cycle);
  if (!Number.isFinite(c) || c <= 0) return 0;
  return price / c * 30;
}

// Komari 约定：价格 -1 表示免费，0 表示没填
function priceText(price) {
  if (price === -1) return '免费';
  return price > 0 ? '' : '未填价格';
}

// ---------------------------------------------------------------- 状态

const state = {
  settings: { ...DEFAULTS },
  hiddenTokens: [],       // 设置里要隐藏的机器（名字 / UUID 前缀）
  hiddenCount: 0,
  nodes: [],
  nodeByUuid: new Map(),
  order: [],
  live: new Map(),        // uuid -> 最新上报
  onlineAt: new Map(),    // uuid -> 本地时间戳，用于推算在线时长
  history: new Map(),     // uuid -> { cpu:[], ram:[], disk:[], net:[], proc:[], conn:[] }
  ping: new Map(),        // uuid -> { taskId: [{ t, value }] }
  pingTasks: new Map(),   // id -> { name, short, type, weight }
  pingBuckets: new Map(), // uuid -> Map(taskId -> [{ ms, loss }])
  pingStats: new Map(),   // uuid -> { taskId: { latest, avg, loss, min, max } }
  buckets: new Map(),     // uuid -> { cpu:[], ram:[], disk:[], net:[] }
  lastHistoryAt: 0,
  lastPingAt: 0,
  lastLatestAt: 0,
  linkKind: 'boot',
  transport: 'pending',
  wsOk: false,
  everLoaded: false,
  expanded: new Set(),
  refs: new Map(),
  taskSignature: '',
  stripLanesDirty: true,
  sort: 'default',
  pins: new Set(),
  privacy: false,
  hashApplied: false,
};

const PREFS_KEY = 'komari-signal-prefs';
const SORTS = [
  { key: 'default', label: '默认', what: '站点权重' },
  { key: 'cpu', label: 'CPU', what: '当前 CPU 占用，高的在前' },
  { key: 'mem', label: '内存', what: '当前内存占用，高的在前' },
  { key: 'net', label: '延迟', what: '三网最新延迟均值，慢的在前' },
];

function applyPrivacy() {
  for (const n of state.nodes) n._name = state.privacy ? n._alias : n._realName;
  const on = state.privacy ? '1' : '0';
  document.documentElement.dataset.privacy = on;
  const btn = $('#privacyBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', state.privacy ? 'true' : 'false');
    btn.dataset.on = on;
    btn.textContent = state.privacy ? '隐私开' : '隐私';
  }
}

function togglePrivacy() {
  state.privacy = !state.privacy;
  savePrefs();
  applyPrivacy();
  buildRows();
  if (state.everLoaded) renderLive();
  toast(state.privacy ? '隐私模式开：机器名已换成代号' : '隐私模式关：恢复真实名称');
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    if (SORTS.some(s => s.key === j.sort)) state.sort = j.sort;
    if (Array.isArray(j.pins)) state.pins = new Set(j.pins.filter(x => typeof x === 'string'));
    if (j.privacy === true) state.privacy = true;
  } catch { /* 隐私模式忽略 */ }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: state.sort, pins: [...state.pins], privacy: state.privacy })); } catch { /* 忽略 */ }
}

// ---------------------------------------------------------------- 请求

async function getJSON(url, timeout = 9000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(method, params, timeout = 12000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch('/api/rpc2', {
      method: 'POST',
      signal: ac.signal,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params: params || {}, id: method }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || 'RPC error');
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- 载入

async function loadMeta() {
  const [pub, nodes] = await Promise.all([getJSON('/api/public'), getJSON('/api/nodes')]);
  const pubData = pub && pub.data ? pub.data : {};
  applySettings(pubData.theme_settings);
  const site = String(pubData.sitename || '').trim();
  const siteEl = $('#siteName');
  if (siteEl && site) {
    siteEl.textContent = site;
    siteEl.setAttribute('translate', 'no');
  }
  const list = Array.isArray(nodes && nodes.data) ? nodes.data : [];
  // 后台已停用的节点先去掉，再按设置里的「隐藏的机器」过滤
  const enabled = list.filter(n => n && n.uuid && !n.hidden);
  const visible = enabled.filter(n => !isHiddenNode(n));
  state.hiddenCount = enabled.length - visible.length;
  // 按后台「排序」字段 weight 升序，与 Komari 管理端显示的顺序一致
  visible.sort((a, b) => {
    const wa = Number(a.weight); const wb = Number(b.weight);
    const va = Number.isFinite(wa) ? wa : Number.MAX_SAFE_INTEGER;
    const vb = Number.isFinite(wb) ? wb : Number.MAX_SAFE_INTEGER;
    return va - vb;
  });
  state.nodes = visible;
  state.order = state.nodes.map(n => n.uuid);
  state.nodeByUuid = new Map(state.nodes.map(n => [n.uuid, n]));

  /* 置顶状态是按 uuid 存本地的：机器删了/被隐藏后要把死 uuid 清掉，
     否则 localStorage 里的集合只增不减。 */
  let pinsChanged = false;
  for (const u of Array.from(state.pins)) {
    if (!state.nodeByUuid.has(u)) { state.pins.delete(u); pinsChanged = true; }
  }
  if (pinsChanged) savePrefs();

  state.nodes.forEach((n, i) => {
    n._name = cleanName(n.name);
    n._realName = n._name;
    n._alias = `Node-${String(i + 1).padStart(2, '0')}`;
  });
  applyPrivacy();

  try {
    const tasks = await getJSON('/api/task/ping');
    const list2 = Array.isArray(tasks && tasks.data) ? tasks.data : [];
    registerTasks(list2);
  } catch {
    /* ping 任务拿不到时，用记录里出现的任务兜底 */
  }
  applyAdminButton();
  $('#footRates').textContent = state.settings.showFinance
    ? `汇率 $1=¥${num(state.settings.usdCny, 2)} · €1=¥${num(state.settings.eurCny, 2)}`
    : '';
}

/* 后台入口：按设置显示；已登录时叫「后台」，否则叫「登录」 */
function applyAdminButton() {
  const btn = $('#adminBtn');
  if (!btn) return;
  btn.hidden = !state.settings.showAdmin;
  if (btn.hidden) return;
  const setLabel = (loggedIn) => {
    const text = loggedIn ? '后台' : '登录';
    $('#adminLabel').textContent = text;
    btn.setAttribute('aria-label', loggedIn ? '进入管理后台' : '登录管理后台');
    btn.dataset.tip = loggedIn ? '进入管理后台' : '登录管理后台';
  };
  setLabel(false);
  // 判断登录态要带上 Cookie；拿不到就保持「登录」
  fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.data && j.data.logged_in) setLabel(true); })
    .catch(() => {});
}

function cleanName(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

/* 设置项「隐藏的机器」：逗号/空格/分号分隔，认机器名，也认 UUID（可只写前 4 位） */
function parseHiddenNodes(raw) {
  const s = String(raw == null ? '' : raw);
  const out = [];
  const push = (tok) => {
    const t = String(tok).replace(/\s+/g, ' ').trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const tok of s.split(/[\s,，;；|]+/)) push(tok);
  /* 名字本身可能带空格（如 "my server"）：逗号/分号分段整体再当一次候选 */
  if (/[,，;；|]/.test(s)) for (const seg of s.split(/[,，;；|]+/)) push(seg);
  return out;
}

function isHiddenNode(n) {
  const tokens = state.hiddenTokens;
  if (!tokens || !tokens.length || !n) return false;
  const uuid = String(n.uuid || '').toLowerCase();
  const name = cleanName(n.name).toLowerCase();
  for (const t of tokens) {
    if (t === uuid || t === name) return true;
    if (t.length >= 4 && uuid.startsWith(t)) return true;
  }
  return false;
}

function applySettings(raw) {
  const s = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const key of SETTING_KEYS) {
      const v = raw[key];
      if (v === undefined || v === null || v === '') continue;
      if (typeof DEFAULTS[key] === 'number') {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) s[key] = n;
      } else if (typeof DEFAULTS[key] === 'boolean') {
        s[key] = !(v === false || v === 0 || v === 'false' || v === '0' || v === 'off' || v === 'no');
      } else {
        s[key] = v;
      }
    }
  }
  if (!['auto', 'light', 'dark'].includes(s.colorMode)) s.colorMode = 'auto';
  s.historyHours = clamp(s.historyHours, 1, 12);
  s.refreshInterval = clamp(s.refreshInterval, 2, 30);
  s.warnThreshold = clamp(s.warnThreshold, 50, 99);
  s.hiddenNodes = String(s.hiddenNodes == null ? '' : s.hiddenNodes);
  // 备案信息只允许 http(s)，其余当纯文本处理，避免把 javascript: 塞进页脚
  s.icpText = String(s.icpText == null ? '' : s.icpText).trim().slice(0, 80);
  const icpUrl = String(s.icpUrl == null ? '' : s.icpUrl).trim().slice(0, 200);
  s.icpUrl = /^https?:\/\//i.test(icpUrl) ? icpUrl : '';
  state.settings = s;
  state.hiddenTokens = parseHiddenNodes(s.hiddenNodes);
  if (typeof document !== 'undefined') applyScheme();
}

function registerTasks(list) {
  for (const t of list) {
    if (!t || t.id === undefined) continue;
    state.pingTasks.set(Number(t.id), {
      name: cleanName(t.name) || `任务 ${t.id}`,
      short: shortTaskName(t.name),
      type: t.type || 'tcp',
      weight: Number.isFinite(Number(t.weight)) ? Number(t.weight) : 99,
    });
  }
}

function shortTaskName(name) {
  const s = cleanName(name);
  if (!s) return '网';
  const tail = s.slice(-2);
  if (['移动', '电信', '联通'].includes(tail)) return tail[0];
  if (['移动', '电信', '联通'].includes(s)) return s[0];
  return s.slice(0, 1);
}

async function loadHistory() {
  const hours = state.settings.historyHours;
  const res = await rpc('common:getRecords', { type: 'load', load_type: 'all', hours, maxCount: -1 });
  const records = res && res.records;
  const now = Date.now();
  state.history.clear();
  const push = (uuid, rec) => {
    if (!rec) return;
    let h = state.history.get(uuid);
    if (!h) {
      h = { cpu: [], ram: [], disk: [], net: [], proc: [], conn: [] };
      state.history.set(uuid, h);
    }
    const t = Date.parse(rec.time);
    if (!Number.isFinite(t)) return;
    h.cpu.push([t, Number(rec.cpu) || 0]);
    h.ram.push([t, Number(rec.ram) || 0]);
    h.disk.push([t, Number(rec.disk) || 0]);
    h.net.push([t, (Number(rec.net_in) || 0) + (Number(rec.net_out) || 0)]);
    h.proc.push([t, Number(rec.process) || 0]);
    h.conn.push([t, (Number(rec.connections) || 0) + (Number(rec.connections_udp) || 0)]);
  };
  if (Array.isArray(records)) {
    for (const rec of records) push(rec.client, rec);
  } else if (records && typeof records === 'object') {
    for (const [uuid, arr] of Object.entries(records)) {
      if (!Array.isArray(arr)) continue;
      for (const rec of arr) push(uuid, rec);
    }
  }
  for (const h of state.history.values()) {
    for (const key of Object.keys(h)) h[key].sort((a, b) => a[0] - b[0]);
  }
  state.lastHistoryAt = now;
  state.windowStart = now - hours * 3600_000;
  buildBuckets();
  buildPingBuckets();
  state.stripLanesDirty = true;
}

async function loadPingHistory() {
  const hours = state.settings.historyHours;
  const res = await rpc('common:getRecords', { type: 'ping', hours, maxCount: -1 });
  const records = res && res.records;
  if (Array.isArray(res && res.tasks) && res.tasks.length) {
    for (const t of res.tasks) {
      if (t && t.id !== undefined && !state.pingTasks.has(Number(t.id))) {
        state.pingTasks.set(Number(t.id), {
          name: cleanName(t.name) || `任务 ${t.id}`,
          short: shortTaskName(t.name),
          type: t.type || 'tcp',
          weight: 99,
        });
      }
    }
  }
  state.ping.clear();
  if (Array.isArray(records)) {
    for (const rec of records) {
      if (!rec) continue;
      const uuid = rec.client;
      const taskId = Number(rec.task_id);
      let node = state.ping.get(uuid);
      if (!node) { node = new Map(); state.ping.set(uuid, node); }
      let arr = node.get(taskId);
      if (!arr) { arr = []; node.set(taskId, arr); }
      const t = Date.parse(rec.time);
      if (!Number.isFinite(t)) continue;
      arr.push([t, Number(rec.value)]);
    }
  }
  for (const node of state.ping.values()) {
    for (const arr of node.values()) arr.sort((a, b) => a[0] - b[0]);
  }
  state.lastPingAt = Date.now();
  /* 三网信号条读的是 pingBuckets，不是 state.ping：之前只在 loadHistory 里构建，
     一旦 load 记录那条 RPC 失败，条带会一直空着而卡片看起来一切正常。 */
  buildPingBuckets();
  state.stripLanesDirty = true;
}

async function loadLatestStatus() {
  const res = await rpc('common:getNodesLatestStatus', {});
  if (!res || typeof res !== 'object') return;
  const entries = res.client ? { [res.client]: res } : res;
  for (const [uuid, st] of Object.entries(entries)) {
    if (!st || typeof st !== 'object') continue;
    const prev = state.live.get(uuid) || {};
    state.live.set(uuid, {
      ...prev,
      cpu: st.cpu,
      ram: st.ram,
      ram_total: st.ram_total,
      swap: st.swap,
      swap_total: st.swap_total,
      load: st.load,
      load5: st.load5,
      load15: st.load15,
      disk: st.disk,
      disk_total: st.disk_total,
      net_in: st.net_in,
      net_out: st.net_out,
      net_total_up: st.net_total_up,
      net_total_down: st.net_total_down,
      connections: st.connections,
      connections_udp: st.connections_udp,
      process: st.process,
      uptime: st.uptime,
      temp: st.temp,
      online: st.online !== false,
      status_updated_at: st.time,
      _source: 'rpc',
    });
    if (st.ping && typeof st.ping === 'object') {
      const stats = new Map();
      for (const [id, p] of Object.entries(st.ping)) {
        const latest = Number(p.latest);
        const avg = Number(p.avg);
        stats.set(Number(id), {
          latest, avg, loss: Number(p.loss),
          min: Number(p.min), max: Number(p.max),
          valid: latest > 0 || avg > 0,
        });
        if (p.name && !state.pingTasks.has(Number(id))) {
          state.pingTasks.set(Number(id), { name: cleanName(p.name), short: shortTaskName(p.name), type: 'tcp', weight: 99 });
        }
      }
      state.pingStats.set(uuid, stats);
    }
  }
  if (Array.isArray(res.online)) {
    for (const uuid of res.online) markOnline(uuid);
  }
  state.lastLatestAt = Date.now();
}

function markOnline(uuid) {
  const prev = state.live.get(uuid);
  if (!prev || !prev.online) state.onlineAt.set(uuid, Date.now());
}

// ---------------------------------------------------------------- WebSocket

let ws = null;
let wsTimer = null;
let wsRetry = 0;
let rtStopped = false; // pagehide / 主动停止后不再重连
let pollTimer = null;

function startRealtime() {
  if (rtStopped || ws) return;
  if (!('WebSocket' in window)) { startPolling('轮询'); return; }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/api/clients`;
  try {
    ws = new WebSocket(url);
  } catch {
    startPolling('轮询');
    return;
  }
  const openTimeout = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      try { ws.close(); } catch { /* noop */ }
    }
  }, 6000);

  ws.onopen = () => {
    clearTimeout(openTimeout);
    if (rtStopped) { try { ws.close(); } catch { /* noop */ } return; }
    wsRetry = 0;
    state.wsOk = true;
    stopPolling();
    setLink('live', '实时');
    ws.send('get');
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    applySnapshot(msg);
  };
  ws.onerror = () => { /* onclose 处理 */ };
  ws.onclose = () => {
    clearTimeout(openTimeout);
    state.wsOk = false;
    if (ws) { ws = null; }
    /* 页面已经卸载 / 主动 stop：close() 的回调是异步的，这里必须认「已停」，
       否则 1.5–30 s 后还会偷偷拨一条新连接。 */
    if (rtStopped) return;
    if (!pollTimer) startPolling('轮询');
    const delay = Math.min(30000, 1500 * (2 ** wsRetry));
    wsRetry = Math.min(wsRetry + 1, 5);
    wsTimer = setTimeout(startRealtime, delay);
  };
}

function stopRealtime() {
  rtStopped = true;
  if (wsTimer) { clearTimeout(wsTimer); wsTimer = null; }
  if (ws) { try { ws.close(); } catch { /* noop */ } ws = null; }
}

function startPolling(label) {
  if (pollTimer) return;
  setLink('poll', label || '轮询');
  const tick = async () => {
    try {
      await loadLatestStatus();
      renderLive();
    } catch {
      setLink('down', '数据中断');
    }
  };
  tick();
  pollTimer = setInterval(tick, Math.max(state.settings.refreshInterval, 5) * 1000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function applySnapshot(msg) {
  if (!msg || msg.status !== 'success' || !msg.data) return;
  const { online, data } = msg.data;
  const now = Date.now();
  if (Array.isArray(online)) {
    for (const uuid of online) markOnline(uuid);
  }
  if (data && typeof data === 'object') {
    for (const [uuid, st] of Object.entries(data)) {
      if (!st || typeof st !== 'object') continue;
      const ramTotal = (st.ram && st.ram.total) || 0;
      const diskTotal = (st.disk && st.disk.total) || 0;
      const net = st.network || {};
      state.live.set(uuid, {
        cpu: st.cpu ? st.cpu.usage : 0,
        ram: st.ram ? st.ram.used : 0,
        ram_total: ramTotal,
        swap: st.swap ? st.swap.used : 0,
        swap_total: st.swap ? st.swap.total : 0,
        load: st.load ? st.load.load1 : 0,
        load5: st.load ? st.load.load5 : 0,
        load15: st.load ? st.load.load15 : 0,
        disk: st.disk ? st.disk.used : 0,
        disk_total: diskTotal,
        net_in: Number(net.down) || 0,
        net_out: Number(net.up) || 0,
        net_total_up: Number(net.totalUp) || 0,
        net_total_down: Number(net.totalDown) || 0,
        connections: st.connections ? st.connections.tcp : 0,
        connections_udp: st.connections ? st.connections.udp : 0,
        process: Number(st.process) || 0,
        uptime: Number(st.uptime) || 0,
        message: st.message || '',
        online: true,
        status_updated_at: st.updated_at || new Date(now).toISOString(),
        _source: 'ws',
      });
    }
  }
  // online 列表是权威的：不在其中的可见节点视为离线
  const onlineSet = new Set(Array.isArray(online) ? online : []);
  for (const uuid of state.order) {
    const live = state.live.get(uuid);
    if (live && !onlineSet.has(uuid)) live.online = false;
  }
  state.everLoaded = true;
  setLink('live', '实时');
  renderLive();
  schedulePulse();
}

// ---------------------------------------------------------------- 分桶

function bucketRange() {
  const hours = state.settings.historyHours;
  const end = Date.now();
  const start = state.windowStart || end - hours * 3600_000;
  return { start, end, span: Math.max(1, end - start) };
}

function buildBuckets() {
  const { start, span } = bucketRange();
  state.buckets.clear();
  for (const uuid of state.order) {
    const h = state.history.get(uuid);
    const out = { cpu: new Array(NB).fill(null), ram: new Array(NB).fill(null), disk: new Array(NB).fill(null), net: new Array(NB).fill(null) };
    if (h) {
      const node = state.nodeByUuid.get(uuid) || {};
      const memTotal = node.mem_total || 0;
      const diskTotal = node.disk_total || 0;
      const acc = {
        cpu: Array.from({ length: NB }, () => [0, 0]),
        ram: Array.from({ length: NB }, () => [0, 0]),
        disk: Array.from({ length: NB }, () => [0, 0]),
        net: Array.from({ length: NB }, () => [0, 0]),
      };
      const add = (key, t, value) => {
        const i = clamp(Math.floor((t - start) / span * NB), 0, NB - 1);
        acc[key][i][0] += value;
        acc[key][i][1] += 1;
      };
      for (const [t, v] of h.cpu) add('cpu', t, clamp(v, 0, 100));
      for (const [t, v] of h.ram) add('ram', t, memTotal > 0 ? clamp(v / memTotal * 100, 0, 100) : 0);
      for (const [t, v] of h.disk) add('disk', t, diskTotal > 0 ? clamp(v / diskTotal * 100, 0, 100) : 0);
      for (const [t, v] of h.net) add('net', t, v);
      for (const key of Object.keys(acc)) {
        out[key] = acc[key].map(([sum, count]) => (count ? sum / count : null));
      }
    }
    state.buckets.set(uuid, out);
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round((arr.length - 1) * p), 0, arr.length - 1);
  return arr[idx];
}

/* 三网窗口以最新一条探测记录为终点：当前这几分钟的记录往往还没写进库，
   用「现在」当终点会让每条状态条最右边永远空着一格 */
function pingRange() {
  const hours = state.settings.historyHours;
  const end = state.pingEnd || Date.now();
  const span = hours * 3600_000;
  return { start: end - span, end, span };
}

function bucketStartFor(index) {
  const { start, span } = pingRange();
  return start + span * (index + 0.5) / LB;
}

function buildPingBuckets() {
  let latest = 0;
  for (const map of state.ping.values()) for (const arr of map.values()) if (arr.length) latest = Math.max(latest, arr[arr.length - 1][0]);
  state.pingEnd = latest && latest > Date.now() - 30 * 60_000 ? latest + 1 : 0;
  const { start, span } = pingRange();
  state.pingBuckets.clear();
  for (const uuid of state.order) {
    const map = state.ping.get(uuid);
    const out = new Map();
    if (map) {
      for (const [taskId, arr] of map) {
        const acc = Array.from({ length: LB }, () => ({ sum: 0, ok: 0, lost: 0 }));
        for (const [t, value] of arr) {
          if (t < start) continue;
          const i = clamp(Math.floor((t - start) / span * LB), 0, LB - 1);
          if (value < 0) acc[i].lost += 1;
          else if (value > 0) { acc[i].sum += value; acc[i].ok += 1; }
        }
        out.set(taskId, acc.map((b) => {
          const total = b.ok + b.lost;
          if (!total) return null;
          return { ms: b.ok ? b.sum / b.ok : null, loss: b.lost / total * 100 };
        }));
      }
    }
    state.pingBuckets.set(uuid, out);
  }
}

// ---------------------------------------------------------------- 汇总计算

function computeNodeView(node) {
  const live = state.live.get(node.uuid) || {};
  const online = live.online !== false && (live.cpu !== undefined);
  const memTotal = live.ram_total || node.mem_total || 0;
  const diskTotal = live.disk_total || node.disk_total || 0;
  const cpu = Number(live.cpu) || 0;
  const ram = Number(live.ram) || 0;
  const disk = Number(live.disk) || 0;
  const memPct = memTotal > 0 ? clamp(live.ram != null ? ram / memTotal * 100 : 0, 0, 100) : 0;
  const diskPct = diskTotal > 0 ? clamp(live.disk != null ? disk / diskTotal * 100 : 0, 0, 100) : 0;
  const up = Number(live.net_out) || 0;
  const down = Number(live.net_in) || 0;
  const totalUp = Number(live.net_total_up) || 0;
  const totalDown = Number(live.net_total_down) || 0;
  const limit = Number(node.traffic_limit) || 0;
  const limitType = node.traffic_limit_type || 'sum';
  let used = totalUp + totalDown;
  if (limitType === 'up') used = totalUp;
  else if (limitType === 'down') used = totalDown;
  else if (limitType === 'max') used = Math.max(totalUp, totalDown);
  else if (limitType === 'min') used = Math.min(totalUp, totalDown);
  const trafficPct = limit > 0 ? clamp(used / limit * 100, 0, 100) : null;
  const remain = limit > 0 ? Math.max(0, limit - used) : null;
  const uptimeBase = Number(live.uptime) || 0;
  const updatedMs = Date.parse(live.status_updated_at || '');
  const elapsed = online && Number.isFinite(updatedMs) ? Math.max(0, (Date.now() - updatedMs) / 1000) : 0;
  const uptime = uptimeBase + elapsed;
  const days = daysUntil(node.expired_at);
  const price = Number(node.price) || 0;
  const priceNote = priceText(price);
  const code = currencyCodeOf(node.currency);
  const rate = code === 'USD' ? state.settings.usdCny : code === 'EUR' ? state.settings.eurCny : 1;
  const priceCny = price * rate;
  const monthlyCny = monthlyCost(priceCny, node.billing_cycle);
  const remainCny = remainValue(priceCny, node.billing_cycle, node.expired_at);

  const warnAt = state.settings.warnThreshold;
  let alert = 0;
  if (!online) alert = 1;
  const resourcePct = Math.max(cpu, memPct, diskPct);
  if (resourcePct >= 95 || (trafficPct !== null && trafficPct >= 95)) alert = Math.max(alert, 2);
  else if (resourcePct >= warnAt || (trafficPct !== null && trafficPct >= warnAt) || (days !== null && days >= 0 && days <= 10)) {
    alert = Math.max(alert, 1);
  }
  if (days !== null && days <= 3) alert = 2;

  const load1 = Number(live.load) || 0;
  const cores = Number(node.cpu_cores) || 0;
  const perCore = cores > 0 ? load1 / cores : load1;

  return {
    node, live, online, cpu, ram, disk, memTotal, diskTotal, memPct, diskPct,
    up, down, totalUp, totalDown, limit, limitType, used, trafficPct, remain,
    uptime, days, price, priceNote, code, priceCny, monthlyCny, remainCny,
    load1, load5: Number(live.load5) || 0, load15: Number(live.load15) || 0,
    cores, perCore, alert, message: cleanName(live.message),
  };
}

function computeSummary(views) {
  const s = {
    memUsed: 0, memTotal: 0, diskUsed: 0, diskTotal: 0,
    traffic: 0, quota: 0, quotaUsed: 0, metered: 0,
    up: 0, down: 0, monthly: 0, remain: 0,
    proc: 0, conn: 0, online: 0, offline: 0, load: 0, cores: 0, alerts: 0,
  };
  for (const v of views) {
    s.memUsed += v.ram;
    s.memTotal += v.memTotal;
    s.diskUsed += v.disk;
    s.diskTotal += v.diskTotal;
    s.traffic += v.totalUp + v.totalDown;
    if (v.limit > 0) { s.quota += v.limit; s.quotaUsed += v.used; s.metered += 1; }
    s.up += v.up;
    s.down += v.down;
    s.monthly += v.monthlyCny;
    s.remain += v.remainCny;
    s.proc += Number(v.live.process) || 0;
    s.conn += (Number(v.live.connections) || 0) + (Number(v.live.connections_udp) || 0);
    s.load += v.load1;
    s.cores += v.cores;
    if (v.online) s.online += 1; else s.offline += 1;
    if (v.alert > 0) s.alerts += 1;
  }
  return s;
}

// ---------------------------------------------------------------- 渲染：汇总

function summaryCells(s) {
  const memPct = s.memTotal > 0 ? s.memUsed / s.memTotal * 100 : 0;
  const diskPct = s.diskTotal > 0 ? s.diskUsed / s.diskTotal * 100 : 0;
  const quotaPct = s.quota > 0 ? s.quotaUsed / s.quota * 100 : 0;
  const warnAt = state.settings.warnThreshold;
  const mem = bytesParts(s.memTotal);
  const disk = bytesParts(s.diskTotal);
  const traffic = bytesParts(s.traffic);
  const up = bytesParts(s.up);
  const down = bytesParts(s.down);
  /* 390px 下流量副行会截断成「· 6 …」；窄屏只留配额，计费台数放回 tooltip */
  const narrow = typeof window !== 'undefined' && window.innerWidth < 480;
  return [
    {
      key: 'mem', label: '总内存', v: mem.v, u: mem.u, tone: '',
      sub: `已用 ${fmtBytes(s.memUsed)}`,
      bar: { p: memPct, level: levelOf(memPct, warnAt, 95) },
      tip: ['!总内存（全部机器）', `合计|${fmtBytes(s.memTotal)}`, `已用|${fmtBytes(s.memUsed)}`, `占用|${num(memPct, 1)}%`].join('\n'),
    },
    {
      key: 'disk', label: '总硬盘', v: disk.v, u: disk.u, tone: '',
      sub: `已用 ${fmtBytes(s.diskUsed)}`,
      bar: { p: diskPct, level: levelOf(diskPct, warnAt, 95) },
      tip: ['!总硬盘（全部机器）', `合计|${fmtBytes(s.diskTotal)}`, `已用|${fmtBytes(s.diskUsed)}`, `占用|${num(diskPct, 1)}%`].join('\n'),
    },
    {
      key: 'traffic', label: '累计流量', v: traffic.v, u: traffic.u, tone: '',
      sub: s.quota > 0 ? (narrow ? `配额 ${fmtBytes(s.quota)}` : `配额 ${fmtBytes(s.quota)} · ${s.metered} 台计费`) : '全部机器无配额',
      bar: s.quota > 0 ? { p: quotaPct, level: levelOf(quotaPct, warnAt, 95) } : null,
      tip: s.quota > 0
        ? ['!累计流量（自 agent 安装起）', `已用|${fmtBytes(s.traffic)}`, `配额|${fmtBytes(s.quota)}`, `剩余|${fmtBytes(Math.max(0, s.quota - s.quotaUsed))}`, `计费机器|${s.metered} 台`].join('\n')
        : ['!累计流量（自 agent 安装起）', `上行|${fmtBytes(s.up)}`, `下行|${fmtBytes(s.down)}`, '无配额限制'].join('\n'),
    },
    {
      key: 'net', label: '实时上行', v: up.v, u: `${up.u}/s`, tone: 'up',
      sub: `下行 ${down.v} ${down.u}/s`, bar: null,
      tip: ['!实时带宽（全部机器合计）', `上行|${fmtBps(s.up)}`, `下行|${fmtBps(s.down)}`, `合计|${fmtBps(s.up + s.down)}`].join('\n'),
    },
    /* 关闭「显示价格」后页面上不能出现任何金额：两格换成进程与连接 */
    ...(state.settings.showFinance ? [] : [
      {
        key: 'proc', label: '进程', v: nf0.format(s.proc), u: '', tone: '',
        sub: '全部在线机器', bar: null,
        tip: ['!进程（全部机器）', `合计|${nf0.format(s.proc)}`].join('\n'),
      },
      {
        key: 'conn', label: '连接', v: nf0.format(s.conn), u: '', tone: '',
        sub: 'TCP + UDP', bar: null,
        tip: ['!连接（全部机器）', `合计|${nf0.format(s.conn)}`, '口径|TCP + UDP'].join('\n'),
      },
    ]),
    ...(!state.settings.showFinance ? [] : [{
      key: 'monthly', label: '月成本', v: `¥${num(s.monthly, s.monthly >= 1000 ? 0 : 2)}`, u: '', tone: '',
      sub: `按计费周期折算`, bar: null,
      tip: ['!月成本', `合计|¥${num(s.monthly, 2)}`, '口径|价格 ÷ 周期天数 × 30', '汇率|手动设定'].join('\n'),
    },
    {
      key: 'remain', label: '剩余价值', v: `¥${num(s.remain, s.remain >= 1000 ? 0 : 2)}`, u: '', tone: '',
      sub: `按剩余天数折算`, bar: null,
      tip: ['!剩余价值', `合计|¥${num(s.remain, 2)}`, '口径|价格 × 剩余天数 ÷ 周期天数', '汇率|手动设定'].join('\n'),
    }]),
  ];
}

function summaryHTML() {
  const s = {
    memUsed: 0, memTotal: 0, diskUsed: 0, diskTotal: 0, traffic: 0, quota: 0, quotaUsed: 0,
    metered: 0, up: 0, down: 0, monthly: 0, remain: 0, proc: 0, conn: 0, online: 0, offline: 0, load: 0, cores: 0, alerts: 0,
  };
  return summaryCells(s).map(c => `
    <div class="tile" data-sum="${c.key}" data-tip="${c.tip}">
      <span class="tk">${c.label}</span>
      <b class="tv" data-f="tv"><span data-f="v">${c.v}</span><span class="u" data-f="u">${c.u}</span></b>
      <div class="track" data-level="off" data-f="trackWrap" hidden><i data-f="bar"></i></div>
      <span class="ts" data-f="sub">${c.sub}</span>
    </div>`).join('');
}

function buildSummary() {
  const wrap = $('#summary');
  if (wrap) wrap.innerHTML = summaryHTML();
}

function updateSummary(s) {
  const cells = summaryCells(s);
  for (const c of cells) {
    const root = $(`.tile[data-sum="${c.key}"]`);
    if (!root) continue;
    const v = $('[data-f="v"]', root);
    const u = $('[data-f="u"]', root);
    const sub = $('[data-f="sub"]', root);
    const bar = $('[data-f="bar"]', root);
    const tv = $('[data-f="tv"]', root);
    if (root.dataset.tip !== c.tip) root.dataset.tip = c.tip;
    if (v && v.textContent !== c.v) v.textContent = c.v;
    if (u && u.textContent !== c.u) u.textContent = c.u;
    if (sub && sub.textContent !== c.sub) sub.textContent = c.sub;
    if (tv) tv.dataset.tone = c.tone || '';
    const wrapEl = bar ? bar.parentElement : null;
    if (!wrapEl) continue;
    if (c.bar) {
      wrapEl.hidden = false;
      wrapEl.dataset.level = c.bar.level;
      bar.style.setProperty('--p', String(clamp(c.bar.p / 100, 0, 1)));
    } else {
      wrapEl.hidden = true;
    }
  }
}

// ---------------------------------------------------------------- 渲染：卡片

function cardHTML(node) {
  const uuid = node.uuid;
  /* uuid 正常是 v4，但导入/迁移过来的库不一定：进 HTML 前一律转义，
     否则一个引号就能把属性拆开，并在 renderRow 里抛 DOMException。 */
  const uid = escapeHTML(uuid);
  const name = escapeHTML(node._name || node.uuid.slice(0, 8));
  const flag = escapeHTML(String(node.region || '').trim());
  // 隐私模式下卡面不露标签（详情里的分组/标签同样被遮住）
  const allTags = state.privacy ? [] : parseTags(node.tags);
  const tags = allTags.slice(0, 2);
  const tasks = orderedTasks();
  const lanes = tasks.slice(0, 3).map(t => `
      <div class="lane" data-task="${t.id}" data-level="off" data-net="${escapeHTML(t.name)}">
        <span class="lane-head"><span class="lk">${escapeHTML(t.short)}</span><b class="lms" data-f="pv">—</b><span class="lu">ms</span><i class="lloss" data-f="pl"></i></span>
        <span class="lbars" data-f="lane-${t.id}">${Array.from({ length: LB }, () => '<i></i>').join('')}</span>
      </div>`).join('');

  return `
  <article class="card" id="card-${uid}" data-uuid="${uid}" data-status="online" data-alert="0" aria-label="">
    <header class="card-head">
      <span class="led" aria-hidden="true"></span>
      <div class="card-id">
        <div class="card-name">
          ${flag ? `<span class="flag" aria-hidden="true">${flag}</span>` : ''}
          <span class="nm" data-f="name" translate="no">${name}</span>
          <span class="st-chip" data-f="st" hidden></span>
          ${tags.map((t, i) => `<span class="chip tag${i === 1 ? ' t2' : ''}" data-tip="${allTags.length > 1 ? `!标签\n${allTags.map(escapeHTML).join(' · ')}` : `!标签\n${escapeHTML(t)}`}">${escapeHTML(t)}</span>`).join('')}
        </div>
        <div class="card-sub">${tags.length ? `<span class="sub-tag" translate="no">${escapeHTML(tags.join(' · '))}</span>` : ''}<span data-f="subOS">—</span><span data-f="subCore"></span><span data-f="subLoad"></span><span data-f="upT"></span></div>
      </div>
      <button class="pin" type="button" data-f="pin" aria-pressed="${state.pins.has(uuid) ? 'true' : 'false'}" aria-label="置顶 ${name}" data-tip="置顶这台机器">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" /></svg>
      </button>
      <button class="more" type="button" aria-expanded="false" aria-controls="detail-${uid}" data-f="toggle" aria-label="展开 ${name} 的详细数据">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
      </button>
    </header>

    <div class="vitals">
      <div class="vital">
        <span class="vl"><span>CPU</span><span class="vv"><b data-f="cpuV">—</b><i>%</i></span></span>
        <div class="track" data-level="off"><i data-f="cpuBar"></i></div>
        <em class="vd" data-f="cpuD"></em>
      </div>
      <div class="vital">
        <span class="vl"><span>内存</span><span class="vv"><b data-f="memV">—</b><i>%</i></span></span>
        <div class="track" data-level="off"><i data-f="memBar"></i></div>
        <em class="vd" data-f="memD"></em>
      </div>
      <div class="vital">
        <span class="vl"><span>硬盘</span><span class="vv"><b data-f="diskV">—</b><i>%</i></span></span>
        <div class="track" data-level="off"><i data-f="diskBar"></i></div>
        <em class="vd" data-f="diskD"></em>
      </div>
    </div>

    <div class="net">
      <div class="net-sub" data-f="netSub">—</div>
      <div class="track" data-level="off" data-f="netBarWrap" hidden><i data-f="netBar"></i></div>
    </div>

    <div class="pings" aria-label="三网延迟与丢包" data-tip="${pingsTip()}"><span class="xhair" aria-hidden="true"></span>${lanes}</div>

    <div class="fin">
      <div class="fin-main">
        <b class="fp" data-f="price">—</b><i class="u" data-f="cycle"></i>
        <span class="fdays" data-f="finDays"></span>
      </div>
      <div class="fin-sub" data-f="finSub">—</div>
    </div>

    <div class="card-detail" id="detail-${uid}" hidden></div>
  </article>`;
}

function shortOS(raw) {
  let t = cleanName(raw);
  if (!t) return '';
  t = t.replace(/\s*GNU\/Linux\s*/i, ' ');
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ');
  t = t.replace(/\s*LTS\s*/i, ' ');
  t = t.replace(/(\d+)\.(\d+)\.\d+/, '$1.$2');
  return t.replace(/\s+/g, ' ').trim();
}

function orderedTasks() {
  return Array.from(state.pingTasks.entries())
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => (a.weight - b.weight) || (a.id - b.id));
}

function parseTags(raw) {
  const s = String(raw == null ? '' : raw).replace(/<\w+>/g, '');
  return s.split(/[,，;；|]/).map(x => x.trim()).filter(Boolean);
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildStrip() {
  const strip = $('#strip');
  if (!strip) return;
  strip.innerHTML = sortedNodes().map(n => `
    <a class="schip" href="#card-${escapeHTML(n.uuid)}" data-uuid="${escapeHTML(n.uuid)}" data-status="online">
      <i class="led" aria-hidden="true"></i>
      <span class="snm" translate="no">${escapeHTML(n._name || n.uuid.slice(0, 6))}</span>
      <b data-f="scpu">—</b>
    </a>`).join('');
}

/* 不要用属性选择器拼 uuid：引号会破坏选择器。按 dataset 找，天然安全。 */
function schipOf(uuid) {
  const strip = $('#strip');
  if (!strip) return null;
  return Array.from(strip.children).find(el => el.dataset.uuid === uuid) || null;
}

function sortKeyOf(node) {
  if (state.sort === 'default') return 0;
  const view = computeNodeView(node);
  if (state.sort === 'cpu') return view.cpu;
  if (state.sort === 'mem') return view.memPct;
  if (state.sort === 'net') {
    const st = state.pingStats.get(node.uuid);
    if (!st) return -1;
    const vals = [];
    for (const s of st.values()) if (Number.isFinite(s.latest) && s.latest > 0) vals.push(s.latest);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -1;
  }
  return 0;
}

function isOnlineNode(node) {
  const live = state.live.get(node.uuid);
  // 还没拿到实时数据时按在线处理，避免开机瞬间整墙跳动
  return live ? live.online !== false : true;
}

function sortedNodes() {
  const list = state.nodes.slice();
  if (!state.pins.size && state.sort === 'default' && !state.settings.offlineLast) return list;
  return list.sort((a, b) => {
    const pa = state.pins.has(a.uuid) ? 0 : 1;
    const pb = state.pins.has(b.uuid) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (state.settings.offlineLast) {
      const oa = isOnlineNode(a) ? 0 : 1;
      const ob = isOnlineNode(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
    }
    if (state.sort === 'default') return 0;
    return sortKeyOf(b) - sortKeyOf(a);
  });
}

function applyOrder() {
  const grid = $('#grid');
  if (!grid) return;
  const list = sortedNodes();
  state.order = list.map(n => n.uuid);
  for (const n of list) {
    const el = state.refs.get(n.uuid) && state.refs.get(n.uuid).root;
    if (el) grid.appendChild(el);
  }
  buildStrip();
  state.stripLanesDirty = true;
  if (state.everLoaded) renderLive();
}

function togglePin(uuid) {
  if (state.pins.has(uuid)) state.pins.delete(uuid);
  else state.pins.add(uuid);
  savePrefs();
  const refs = state.refs.get(uuid);
  if (refs && refs.pin) refs.pin.setAttribute('aria-pressed', String(state.pins.has(uuid)));
  applyOrder();
  announce(state.pins.has(uuid) ? `已置顶 ${cardLabel(uuid)}` : `已取消置顶 ${cardLabel(uuid)}`);
}

function applySortUI() {
  const cur = SORTS.find(s => s.key === state.sort) || SORTS[0];
  const label = $('#sortLabel');
  if (label) label.textContent = cur.label;
  const btn = $('#sortBtn');
  if (!btn) return;
  btn.dataset.on = state.sort === 'default' ? '0' : '1';
  btn.dataset.tip = ['!排序', `当前|${cur.label}`, `依据|${cur.what}`, '点击换下一种，置顶的机器永远在最前'].join('\n');
  btn.setAttribute('aria-label', `排序：${cur.label}，点击切换`);
}

function cycleSort() {
  const i = SORTS.findIndex(s => s.key === state.sort);
  state.sort = SORTS[(i + 1) % SORTS.length].key;
  savePrefs();
  applySortUI();
  applyOrder();
  toast(`排序：${(SORTS.find(s => s.key === state.sort) || SORTS[0]).label}`);
}

// 卡片列数：按断点封顶
function maxCols() {
  // 与 style.css 里 .grid 的断点严格对齐：≥1024 → 4 列，≤1023 → 2，≤767 → 1
  const w = window.innerWidth || 1920;
  if (w >= 1024) return 4;
  if (w >= 768) return 2;
  return 1;
}

// 列数只看屏幕宽度（5 台就是 4 + 1），机器少时留空位，卡片大小不随机器数变化
function fitCols() {
  return maxCols();
}

function applyCols() {
  const grid = $('#grid');
  if (!grid) return;
  const cols = String(fitCols());
  if (grid.dataset.cols !== cols) grid.dataset.cols = cols;
}

function buildRows() {
  const grid = $('#grid');
  if (!grid) return;
  applyCols();
  const openUuids = new Set(state.expanded);
  const list = sortedNodes();
  state.order = list.map(n => n.uuid);
  grid.innerHTML = list.map(cardHTML).join('');
  state.refs.clear();
  state.expanded.clear();
  for (const el of $$('.card', grid)) {
    const uuid = el.dataset.uuid;
    const refs = { root: el };
    for (const f of $$('[data-f]', el)) if (!refs[f.dataset.f]) refs[f.dataset.f] = f;
    state.refs.set(uuid, refs);
    el.querySelector('[data-f="toggle"]').addEventListener('click', () => toggleDetail(uuid));
    const pin = el.querySelector('[data-f="pin"]');
    if (pin) pin.addEventListener('click', () => togglePin(uuid));
    // 整张卡片都能点开/收起（键盘仍走上面的按钮）；选中文字时不误触
    el.addEventListener('click', (ev) => {
      // 状态条是用来按住看某一刻的，点它不展开卡片
      if (ev.target.closest('a, button, input, select, textarea, label, .lbars')) return;
      const picked = window.getSelection ? String(window.getSelection()) : '';
      if (picked.length > 1) return;
      toggleDetail(uuid);
    });
    const panel = el.querySelector('.card-detail');
    if (panel) { panel.hidden = true; delete panel.dataset.filled; }
  }
  state.taskSignature = orderedTasks().map(t => t.id).join(',');
  buildStrip();
  for (const uuid of openUuids) {
    if (state.refs.has(uuid)) toggleDetail(uuid, true);
  }
}

// 核心指标右上角的「已用 / 总量」
function setFrac(el, text, title) {
  if (!el) return;
  const t = String(text || '');
  if (el.textContent !== t) el.textContent = t;
  el.hidden = !t;
  if (title) el.title = title;
}

function setBar(barEl, level, p) {
  if (!barEl) return;
  const wrap = barEl.parentElement;
  if (wrap.dataset.level !== level) wrap.dataset.level = level;
  if (wrap.hidden) wrap.hidden = false;
  const val = String(clamp(p / 100, 0, 1));
  if (barEl.style.getPropertyValue('--p') !== val) barEl.style.setProperty('--p', val);
}

function renderRow(view, withLanes) {
  const refs = state.refs.get(view.node.uuid);
  if (!refs) return;
  const { node } = view;
  const root = refs.root;
  root.dataset.status = view.online ? 'online' : 'offline';
  root.dataset.alert = String(view.alert);

  const chip = schipOf(view.node.uuid);
  if (chip) {
    if (chip.dataset.status !== root.dataset.status) chip.dataset.status = root.dataset.status;
    const scpu = $('[data-f="scpu"]', chip);
    const st = `${num(view.cpu, view.cpu < 10 ? 1 : 0)}%`;
    if (scpu && scpu.textContent !== st) scpu.textContent = st;
    const tipText = [
      `!${cleanName(node._name) || node.uuid.slice(0, 8)}`,
      `状态|${view.online ? '在线' : '离线'}`,
      `CPU|${num(view.cpu, 1)}% · 内存 ${num(view.memPct, 1)}%`,
      `在线|${view.online ? fmtUptime(view.uptime) : fmtAgo(Date.parse(view.live.status_updated_at || ''))}`,
      '点击跳到这张卡片',
    ].join('\n');
    if (chip.dataset.tip !== tipText) chip.dataset.tip = tipText;
  }

  // 副行：系统 · 核心数 · 负载 · 在线时长。
  // 系统名可以省略号收尾（详情里有全称），核心数/负载/在线时长永远完整显示。
  const os = shortOS(node.os);
  const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const setTip = (el, t) => { if (el && el.dataset.tip !== t) el.dataset.tip = t; };
  setText(refs.subOS, os || '');
  setText(refs.subCore, view.cores ? `${view.cores} 核` : '');
  setText(refs.subLoad, `负载 ${num(view.load1, 2)}`);
  const upT = view.online ? `在线 ${fmtUptime(view.uptime)}` : `离线 ${fmtAgo(Date.parse(view.live.status_updated_at || ''))}`;
  if (refs.upT && refs.upT.textContent !== upT) refs.upT.textContent = upT;

  /* 离线/告警不再只靠颜色：名字旁给一枚文字胶囊，扫视层直接可读 */
  if (refs.st) {
    const kind = view.online ? (view.alert >= 2 ? 'crit' : view.alert ? 'warn' : '') : 'offline';
    const label = kind === 'offline' ? '离线' : kind === 'crit' ? '严重' : kind ? '告警' : '';
    if (refs.st.hidden !== !kind) refs.st.hidden = !kind;
    if (refs.st.textContent !== label) refs.st.textContent = label;
    if (refs.st.dataset.kind !== kind) refs.st.dataset.kind = kind;
  }

  // CPU / 内存 / 硬盘
  const cpuLevel = levelOf(view.cpu, state.settings.warnThreshold, 95);
  setFrac(refs.cpuD, `${coresText(view.cpu, view.cores)}`, `CPU 占用 ${num(view.cpu, 1)}%${view.cores ? ` · 共 ${view.cores} 核` : ''}`);
  if (refs.cpuV.textContent !== num(view.cpu, 1)) refs.cpuV.textContent = num(view.cpu, 1);
  refs.cpuV.dataset.level = cpuLevel;
  setBar(refs.cpuBar, cpuLevel, view.cpu);
  setTip(refs.cpuD.closest('.vital'), [
    '!CPU 使用率',
    `当前|${num(view.cpu, 1)}%`,
    `用量|${coresText(view.cpu, view.cores) || '—'}`,
    `告警线|${state.settings.warnThreshold}%`,
  ].join('\n'));

  const memLevel = levelOf(view.memPct, state.settings.warnThreshold, 95);
  setFrac(refs.memD, `${pairText(view.ram, view.memTotal)}`, `内存 ${fmtBytes(view.ram)} / ${fmtBytes(view.memTotal)}`);
  if (refs.memV.textContent !== num(view.memPct, 1)) refs.memV.textContent = num(view.memPct, 1);
  refs.memV.dataset.level = memLevel;
  setBar(refs.memBar, memLevel, view.memPct);
  setTip(refs.memD.closest('.vital'), [
    '!内存',
    `占用|${num(view.memPct, 1)}%`,
    `已用|${fmtBytes(view.ram)}`,
    `总量|${fmtBytes(view.memTotal)}`,
  ].join('\n'));

  const diskLevel = levelOf(view.diskPct, state.settings.warnThreshold, 95);
  setFrac(refs.diskD, `${pairText(view.disk, view.diskTotal)}`, `硬盘 ${fmtBytes(view.disk)} / ${fmtBytes(view.diskTotal)}`);
  if (refs.diskV.textContent !== num(view.diskPct, 1)) refs.diskV.textContent = num(view.diskPct, 1);
  refs.diskV.dataset.level = diskLevel;
  setBar(refs.diskBar, diskLevel, view.diskPct);
  setTip(refs.diskD.closest('.vital'), [
    '!硬盘',
    `占用|${num(view.diskPct, 1)}%`,
    `已用|${fmtBytes(view.disk)}`,
    `总量|${fmtBytes(view.diskTotal)}`,
  ].join('\n'));

  // 网络：累计流量 / 计费配额
  if (view.limit > 0) {
    const lv = levelOf(view.trafficPct, state.settings.warnThreshold, 95);
    setBar(refs.netBar, lv, view.trafficPct);
    const t = `计费 ${fmtBytes(view.used)} / ${fmtBytes(view.limit)} · 剩 ${fmtBytes(view.remain)}`;
    if (refs.netSub.textContent !== t) refs.netSub.textContent = t;
    setTip(refs.netSub.parentElement, [
      '!流量（本机）',
      `计费用量|${fmtBytes(view.used)}`,
      `配额|${fmtBytes(view.limit)}`,
      `剩余|${fmtBytes(view.remain)}`,
      `占比|${num(view.trafficPct, 1)}%`,
    ].join('\n'));
  } else {
    if (refs.netBarWrap) refs.netBarWrap.hidden = true;
    const t = `累计 ↑${fmtBytes(view.totalUp)} ↓${fmtBytes(view.totalDown)}`;
    if (refs.netSub.textContent !== t) refs.netSub.textContent = t;
    setTip(refs.netSub.parentElement, [
      '!累计流量（自 agent 安装起）',
      `上行|${fmtBytes(view.totalUp)}`,
      `下行|${fmtBytes(view.totalDown)}`,
      `合计|${fmtBytes(view.totalUp + view.totalDown)}`,
      '本机无配额',
    ].join('\n'));
  }

  // 财务
  if (state.settings.showFinance) {
    const sym = node.currency || '¥';
    const has = view.price > 0;
    const price = has ? `${sym}${num(view.price, view.price % 1 ? 2 : 0)}` : view.priceNote;
    if (refs.price.textContent !== price) refs.price.textContent = price;
    const cycle = has ? `/ ${billingText(node.billing_cycle)}` : '';
    if (refs.cycle.textContent !== cycle) refs.cycle.textContent = cycle;
    let days = '无到期';
    let dayLevel = '';
    if (view.days !== null) {
      if (view.days < 0) { days = `已过期 ${-view.days} 天`; dayLevel = 'crit'; }
      else if (view.days > 36500) { days = '长期有效'; }
      else { days = `剩 ${view.days} 天`; dayLevel = view.days <= 10 ? 'warn' : ''; }
    }
    if (refs.finDays.textContent !== days) refs.finDays.textContent = days;
    refs.finDays.dataset.level = dayLevel;
    const subBits = [];
    if (has) {
      subBits.push(`残值 ¥${num(view.remainCny, view.remainCny >= 1000 ? 0 : 1)}`);
      subBits.push(`月 ¥${num(view.monthlyCny, view.monthlyCny >= 100 ? 0 : 1)}`);
    }
    const finSub = subBits.join(' · ');
    if (refs.finSub.textContent !== finSub) refs.finSub.textContent = finSub;
    const finLines = ['!费用'];
    if (has) {
      finLines.push(`价格|${sym}${num(view.price, view.price % 1 ? 2 : 0)} / ${billingText(node.billing_cycle)}`);
      finLines.push(`剩余|${view.days === null ? '无到期' : `${view.days} 天`}`);
      finLines.push(`残值|¥${num(view.remainCny, 2)}`);
    } else {
      finLines.push(`价格|${view.priceNote}`);
      finLines.push(`到期|${fmtDate(node.expired_at, '无到期时间')}`);
    }
    finLines.push(`月成本|¥${num(view.monthlyCny, 2)}`);
    setTip(refs.finSub.closest('.fin'), finLines.join('\n'));
  } else {
    if (refs.price.textContent !== '—') refs.price.textContent = '—';
    refs.cycle.textContent = '';
    if (refs.finDays.textContent !== '') refs.finDays.textContent = '';
    if (refs.finSub.textContent !== '价格已隐藏') refs.finSub.textContent = '价格已隐藏';
  }

  // 三网
  const stats = state.pingStats.get(node.uuid);
  for (const lane of $$('.lane', refs.root)) {
    const taskId = Number(lane.dataset.task);
    const st = stats ? stats.get(taskId) : null;
    const task = state.pingTasks.get(taskId);
    const pv = $('[data-f="pv"]', lane);
    const pl = $('[data-f="pl"]', lane);
    if (st && st.valid) {
      lane.dataset.level = st.loss >= 5 ? 'crit' : st.loss >= 1 ? 'warn' : 'ok';
      pv.textContent = String(Math.round(st.latest));
      pl.textContent = Number.isFinite(st.loss) && st.loss > 0.05 ? `${num(st.loss, 1)}%` : '';
      pl.dataset.lv = st.loss >= 5 ? 'crit' : st.loss >= 1 ? 'warn' : '';
      lane.title = `${task ? task.name : taskId}（${task ? task.type : 'tcp'}）· 最新 ${Math.round(st.latest)} ms · 均值 ${Math.round(st.avg)} ms · 丢包 ${num(st.loss, 2)}% · 范围 ${Math.round(st.min)}–${Math.round(st.max)} ms`;
    } else {
      lane.dataset.level = 'off';
      pv.textContent = '—';
      pl.textContent = '';
      pl.dataset.lv = '';
      lane.title = `${task ? task.name : taskId} · 暂无数据`;
    }
  }

  renderLanes(view, withLanes);
  updateRowLabel(view);
}

function updateRowLabel(view) {
  const { node } = view;
  const pingStats = state.pingStats.get(node.uuid);
  const pingBits = orderedTasks().slice(0, 3).map((t) => {
    const st = pingStats && pingStats.get(t.id);
    if (!st || !st.valid) return `${t.short} 无数据`;
    return `${t.short} ${Math.round(st.latest)}ms 丢包${num(st.loss, 1)}%`;
  });
  const bits = [
    `${node._name}：${view.online ? '在线' : '离线'}`,
    `CPU ${num(view.cpu, 1)}%`,
    `内存 ${num(view.memPct, 1)}%`,
    `硬盘 ${num(view.diskPct, 1)}%`,
    `上行 ${fmtBps(view.up)}`,
    `下行 ${fmtBps(view.down)}`,
    `负载 ${num(view.load1, 2)}`,
    `在线 ${fmtUptime(view.uptime)}`,
  ];
  if (view.limit > 0) bits.push(`流量 ${num(view.trafficPct, 1)}%`);
  if (view.days !== null) bits.push(view.days < 0 ? '已过期' : `剩 ${view.days} 天`);
  bits.push(...pingBits);
  view._label = bits.join('，');
  const refs = state.refs.get(node.uuid);
  if (refs) refs.root.setAttribute('aria-label', view._label);
}

function renderLanes(view, withLanes) {
  const refs = state.refs.get(view.node.uuid);
  if (!refs) return;
  if (!withLanes) return;
  const pb = state.pingBuckets.get(view.node.uuid);
  for (const lane of $$('.lane', refs.root)) {
    const taskId = Number(lane.dataset.task);
    const buckets = pb ? pb.get(taskId) : null;
    const bars = $$('.lbars i', lane);
    if (!buckets || !buckets.some(Boolean)) {
      lane.dataset.empty = '1';
      for (const bar of bars) {
        bar.style.removeProperty('--c');
        delete bar.dataset.lv;
        delete bar.dataset.ms;
        delete bar.dataset.loss;
        delete bar.dataset.t;
      }
      continue;
    }
    lane.dataset.empty = '0';
    const valid = buckets.filter((x) => x && x.ms != null).map((x) => x.ms);
    const med = valid.length ? percentile(valid, 0.5) : 0;
    for (let i = 0; i < bars.length; i += 1) {
      const bk = buckets[i];
      const bar = bars[i];
      if (!bk || (bk.ms == null && bk.loss <= 0)) {
        bar.style.removeProperty('--c');
        bar.dataset.none = '1';
        delete bar.dataset.ms;
        delete bar.dataset.loss;
        delete bar.dataset.t;
        delete bar.dataset.lv;
        continue;
      }
      delete bar.dataset.none;
      const lv = segmentLevel(bk, med);
      bar.style.setProperty('--c', SEG[lv]);
      bar.dataset.lv = lv;
      bar.dataset.t = String(bucketStartFor(i));
      bar.dataset.ms = bk.ms == null ? '' : String(Math.round(bk.ms));
      bar.dataset.loss = num(bk.loss, 1);
    }
  }
}

function seriesPoints(series, scaleFn) {
  if (!series) return [];
  const pts = [];
  for (let i = 0; i < series.length; i += 1) {
    const v = series[i];
    const x = series.length > 1 ? i / (series.length - 1) * CHART_W : 0;
    if (v == null || !Number.isFinite(v)) { pts.push([x, null]); continue; }
    pts.push([x, scaleFn(v)]);
  }
  return pts;
}

function linePath(points, up) {
  let d = '';
  let pen = false;
  for (const [x, y] of points) {
    if (y == null) { pen = false; continue; }
    const py = up ? MID - y : MID + y;
    d += `${pen ? 'L' : 'M'}${x.toFixed(2)} ${py.toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

function areaPath(points, base, up) {
  const seg = points.filter(([, y]) => y != null);
  if (!seg.length) return '';
  const first = seg[0][0];
  const last = seg[seg.length - 1][0];
  const top = linePath(points, up);
  return `${top} L${last.toFixed(2)} ${base} L${first.toFixed(2)} ${base} Z`;
}

// ---------------------------------------------------------------- 展开详情

function cardLabel(uuid) {
  const node = state.nodeByUuid.get(uuid);
  return (node && node._name) || uuid.slice(0, 8);
}

function announce(text) {
  const el = $('#srLive');
  if (el) el.textContent = text;
}

function setChipCurrent(uuid, on) {
  const chip = schipOf(uuid);
  if (!chip) return;
  if (on) chip.setAttribute('aria-current', 'true');
  else chip.removeAttribute('aria-current');
}

function closeCard(uuid) {
  const refs = state.refs.get(uuid);
  if (!refs) return;
  const panel = refs.root.querySelector('.card-detail');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  /* 收起时把缓存标记清掉：下次展开重建，明细不会停在几分钟前 */
  delete panel.dataset.filled;
  refs.root.dataset.expanded = 'false';
  if (refs.toggle) {
    refs.toggle.setAttribute('aria-expanded', 'false');
    refs.toggle.setAttribute('aria-label', `展开 ${cardLabel(uuid)} 的详细数据`);
    refs.toggle.title = '展开明细';
  }
  state.expanded.delete(uuid);
  setChipCurrent(uuid, false);
  syncHash('');
}

function collapseAll() {
  for (const uuid of Array.from(state.expanded)) closeCard(uuid);
  const grid = $('#grid');
  if (grid) {
    grid.dataset.open = '0';
    grid.style.removeProperty('--card-min');
  }
  announce('已收起全部节点明细');
}

// 展开后把新增的明细滚进视野，只滚必要的那一段
function revealExpanded(card) {
  requestAnimationFrame(() => {
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const behavior = reduce ? 'auto' : 'smooth';
    const wall = $('#wall');
    const scroller = wall && wall.scrollHeight > wall.clientHeight + 4 ? wall : null;
    const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const box = card.getBoundingClientRect();
    const below = Math.round(box.bottom - view.bottom + 10);
    const above = Math.round(view.top - box.top + 10);
    if (below > 0) {
      if (scroller) scroller.scrollBy({ top: below, behavior });
      else window.scrollBy({ top: below, behavior });
    } else if (above > 0) {
      if (scroller) scroller.scrollBy({ top: -above, behavior });
      else window.scrollBy({ top: -above, behavior });
    }
  });
}

function syncHash(nodeUuid) {
  const next = nodeUuid ? `#node-${nodeUuid}` : `${location.pathname}${location.search}`;
  if (nodeUuid && location.hash === `#node-${nodeUuid}`) return;
  if (!nodeUuid && !location.hash) return;
  try { history.replaceState(null, '', next); } catch { /* 忽略 */ }
}

function toggleDetail(uuid, silent) {
  const refs = state.refs.get(uuid);
  if (!refs) return;
  const panel = refs.root.querySelector('.card-detail');
  if (!panel) return;
  const btn = refs.toggle;
  const willOpen = panel.hidden;
  const grid = $('#grid');

  // 展开前记住收起状态下的卡片高度，其它卡片因此不会被压扁
  if (willOpen && grid && !state.expanded.size) {
    const h = Math.round(refs.root.getBoundingClientRect().height);
    if (h > 0) grid.style.setProperty('--card-min', `${h}px`);
  }
  // 同一时间只展开一张卡片（展开后它占满整行）
  for (const other of Array.from(state.expanded)) if (other !== uuid) closeCard(other);

  if (!willOpen) {
    closeCard(uuid);
    if (grid && !state.expanded.size) {
      grid.dataset.open = '0';
      grid.style.removeProperty('--card-min');
    }
    if (!silent) announce(`已收起 ${cardLabel(uuid)} 的明细`);
    return;
  }

  panel.hidden = false;
  refs.root.dataset.expanded = 'true';
  if (grid) grid.dataset.open = '1';
  if (btn) {
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', `收起 ${cardLabel(uuid)} 的详细数据`);
    btn.title = '收起明细';
  }
  state.expanded.add(uuid);
  setChipCurrent(uuid, true);
  if (!panel.dataset.filled) {
    buildDetail(uuid, panel);
    panel.dataset.filled = '1';
  }
  if (!silent) {
    syncHash(uuid);
    revealExpanded(refs.root);
    announce(`已展开 ${cardLabel(uuid)} 的详细数据`);
  }
}

// 用已有小时分桶算硬盘增长斜率，给出「还要多久写满」的粗估
function diskForecast(uuid) {
  const b = state.buckets.get(uuid);
  const pts = ((b && b.disk) || []).filter((v) => Number.isFinite(v) && v > 0);
  if (pts.length < 4) return null;
  const last = pts[pts.length - 1];
  if (last >= 99.5) return { full: true, last };
  const first = pts[0];
  const perHour = (last - first) / (pts.length - 1);
  if (!Number.isFinite(perHour) || perHour <= 0.02) return { full: false, stable: true, last, perHour };
  const days = (100 - last) / perHour / 24;
  return { full: false, stable: false, last, perHour, days };
}

function diskForecastHTML(uuid) {
  const f = diskForecast(uuid);
  if (!f) return '数据太少';
  if (f.full) return `已写满（${num(f.last, 1)}%）`;
  if (f.stable) return `看不出增长（${num(f.last, 1)}%）`;
  if (f.days > 365) return `一年内不会满（${num(f.last, 1)}%，${num(f.perHour, 2)} %/时）`;
  return `约 ${Math.max(1, Math.round(f.days))} 天后写满（${num(f.last, 1)}%，${num(f.perHour, 2)} %/时）`;
}

function pingStatsHTML(uuid) {
  const pb = state.pingBuckets.get(uuid);
  if (!pb) return '';
  const rows = orderedTasks().slice(0, 3).map((t) => {
    const arr = pb.get(t.id);
    const vals = arr ? arr.filter((b) => b && b.ms != null).map((b) => b.ms) : [];
    if (!vals.length) {
      return `<div class="pst"><span class="pst-k">${escapeHTML(t.short)}</span><span class="pst-v">—</span><span class="pst-n">没有数据</span></div>`;
    }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const p95 = percentile(vals, 0.95);
    const best = Math.min(...vals);
    const lossAll = arr.filter((b) => b).map((b) => b.loss || 0);
    const lossAvg = lossAll.length ? lossAll.reduce((a, b) => a + b, 0) / lossAll.length : 0;
    return `<div class="pst"><span class="pst-k">${escapeHTML(t.short)}</span><span class="pst-v">${Math.round(avg)} / ${Math.round(p95)} ms</span><span class="pst-n">最好 ${Math.round(best)} · 平均丢包 ${num(lossAvg, 1)}%</span></div>`;
  }).join('');
  return `<div class="pstats"><span class="pstats-cap">三网延迟：均值 / P95（近 ${state.settings.historyHours} 小时）</span>${rows}</div>`;
}

function buildDetail(uuid, panel) {
  const node = state.nodeByUuid.get(uuid);
  const view = computeNodeView(node);
  const b = state.buckets.get(uuid) || { cpu: [], ram: [], disk: [], net: [] };
  const rows = [
    ['CPU', node.cpu_name || '—', true],
    ['核心', `${node.cpu_cores || '—'} 逻辑 / ${node.cpu_physical_cores || '—'} 物理`],
    ['架构', `${node.arch || '—'} · ${node.virtualization || '—'}`],
    ['系统', node.os || '—', true],
    ['内核', node.kernel_version || '—', true],
    ['负载', `${num(view.load1, 2)} / ${num(view.load5, 2)} / ${num(view.load15, 2)}`],
    ['硬盘趋势', diskForecastHTML(uuid)],
    ['交换分区', (Number(node.swap_total) || 0) > 0 ? `${fmtBytes(Number(view.live.swap) || 0)} / ${fmtBytes(node.swap_total)}` : '未启用'],
    ['进程', nf0.format(Number(view.live.process) || 0)],
    ['连接', `${nf0.format(Number(view.live.connections) || 0)} TCP · ${nf0.format(Number(view.live.connections_udp) || 0)} UDP`],
    ['上行累计', fmtBytes(view.totalUp)],
    ['下行累计', fmtBytes(view.totalDown)],
    ['流量配额', view.limit > 0 ? `${fmtBytes(view.limit)}（${trafficTypeText(view.limitType)}）` : '无'],
    ['计费周期', billingText(node.billing_cycle)],
    ['到期', `${fmtDate(node.expired_at, '无到期时间')}${safeDate(node.expired_at) && view.days !== null ? `（剩 ${view.days} 天）` : ''}`],
    ...(state.settings.showFinance ? [
      ['剩余价值', view.price > 0 ? `原币 ${node.currency || '¥'}${num(remainValue(view.price, node.billing_cycle, node.expired_at), 2)} · 折合 ¥${num(view.remainCny, 2)}` : view.priceNote],
      ['月成本', `¥${num(view.monthlyCny, 2)}`],
    ] : []),
    ['自动续费', node.auto_renewal ? '是' : '否'],
    ['纳管时间', fmtDate(node.created_at)],
    ['在线时长', view.online ? fmtUptime(view.uptime) : '离线'],
    ['最近上报', safeDate(view.live.status_updated_at) ? `${fmtAgo(Date.parse(view.live.status_updated_at))}（${timeFmt.format(safeDate(view.live.status_updated_at))}）` : '—'],
    ['分组 / 标签', state.privacy ? '—（隐私模式）' : ([node.group, node.tags].filter(Boolean).join(' · ') || '—')],
  ];
  const gpu = cleanName(node.gpu_name);
  if (gpu && gpu !== 'None') rows.splice(3, 0, ['GPU', gpu, true]);
  const msg = cleanName(view.live.message);
  panel.innerHTML = `
    <div class="dkv">
      ${rows.map(([k, v]) => `<div class="dl"${String(v).length > 20 ? ' data-long="1"' : ''}><span class="dk">${escapeHTML(k)}</span><span class="dv" title="${escapeHTML(v)}">${escapeHTML(v)}</span></div>`).join('')}
    </div>
    ${pingStatsHTML(uuid)}
    ${state.settings.showTrace ? `<div class="minis">
      <div class="minis-cap"><span data-f="win">近 ${state.settings.historyHours} 小时</span><span>逐小时趋势</span></div>
      ${miniChart('CPU 使用率', b.cpu, 'var(--cpu)', '%', 0, 100)}
      ${miniChart('内存使用率', b.ram, 'var(--violet)', '%', 0, 100)}
      ${miniChart('硬盘使用率', b.disk, 'var(--blue)', '%', 0, 100)}
      ${miniChart('吞吐（上下行合计）', b.net, 'var(--net)', 'B/s', 0, null, true)}
    </div>` : ''}
    ${node.public_remark
      ? `<div class="detail-note">备注：${state.privacy ? '—（隐私模式）' : escapeHTML(cleanName(node.public_remark))}</div>`
      : ''}
    ${msg ? `<div class="detail-note warn">节点消息：${escapeHTML(msg)}</div>` : ''}
  `;
}

function trafficTypeText(t) {
  return ({ sum: '上下行合计', up: '仅上行', down: '仅下行', max: '较大方向', min: '较小方向' })[t] || '合计';
}

function miniChart(label, series, color, unit, min, max, isBytes = false) {
  const arr = (series || []).map((p) => (Array.isArray(p) ? p[1] : p));
  const vals = arr.filter(v => v != null && Number.isFinite(v));
  const nowV = vals.length ? vals[vals.length - 1] : 0;
  const peak = vals.length ? Math.max(...vals) : 0;
  const fmt = (v) => (isBytes ? fmtBps(v) : `${num(v, 1)}${unit}`);
  const W = 240;
  const H = 34;
  const scale = (max == null ? Math.max(peak, 1) : max) - min;
  let d = '';
  let pen = false;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (v == null || !Number.isFinite(v)) { pen = false; continue; }
    const y = H - 3 - clamp((v - min) / (scale || 1), 0, 1) * (H - 6);
    const x = arr.length > 1 ? i / (arr.length - 1) * W : 0;
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    pen = true;
  }
  const area = d ? `${d} L${W} ${H} L0 ${H} Z` : '';
  return `
    <div class="mini">
      <div class="mini-h"><span>${escapeHTML(label)}</span><span class="mini-v">现 ${fmt(nowV)} · 峰 ${fmt(peak)}</span></div>
      <div class="mini-plot">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <path class="mini-area" d="${area}" fill="${color}" fill-opacity="0.14"></path>
          <path class="mini-line" d="${d}" stroke="${color}"></path>
        </svg>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- 主渲染

function renderAll(views) {
  for (const v of views) renderRow(v, state.stripLanesDirty);
  state.stripLanesDirty = false;
  const s = computeSummary(views);
  updateSummary(s);
  updateHead(s, views.length);
  updateFoot(s);
}

function renderLive() {
  if (!state.everLoaded && !state.lastLatestAt) return;
  state.lastLiveAt = Date.now();
  // 三网任务列表可能在首次渲染之后才拿到，签名变化时重建行结构
  const signature = orderedTasks().map(t => t.id).join(',');
  if (signature !== state.taskSignature) {
    buildRows();
    state.stripLanesDirty = true;
  }
  if (state.settings.offlineLast) {
    const sig = state.nodes.map(n => (isOnlineNode(n) ? '1' : '0')).join('');
    if (sig !== state.offlineSig) {
      state.offlineSig = sig;
      applyOrder();
    }
  }
  const views = state.order.map(uuid => computeNodeView(state.nodeByUuid.get(uuid)));
  renderAll(views);
  state.everLoaded = true;
  const deck = $('#app');
  if (deck.dataset.state !== 'ready') {
    deck.dataset.state = 'ready';
    // 首次进入：三网条带从基线往上长一次，之后不再重播
    const grid = $('#grid');
    if (grid) {
      grid.dataset.grow = '';
      setTimeout(() => { delete grid.dataset.grow; }, 1400);
    }
  }
  if (!state.hashApplied) {
    state.hashApplied = true;
    const m = /^#node-([0-9a-zA-Z-]+)$/.exec(location.hash || '');
    if (m && state.refs.has(m[1]) && !state.expanded.has(m[1])) toggleDetail(m[1], true);
  }
}

function jumpToAttention() {
  const uuid = state.order.find((u) => {
    const v = computeNodeView(state.nodeByUuid.get(u));
    return !v.online || v.alert;
  });
  if (!uuid) return;
  const el = state.refs.get(uuid) && state.refs.get(uuid).root;
  if (!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

function updateHead(s, total) {
  const online = $('#headOnline');
  const txt = `${s.online} / ${total}`;
  if (online.textContent !== txt) online.textContent = txt;
  const up = fmtBps(s.up);
  const down = fmtBps(s.down);
  if ($('#headUp').textContent !== up) $('#headUp').textContent = up;
  if ($('#headDown').textContent !== down) $('#headDown').textContent = down;
  const pill = $('#onlinePill');
  /* 圆点 = 是否全员在线；告警严重度由旁边的“N 台需关注”表达，不重复上色 */
  const level = s.offline > 0 ? 'warn' : 'ok';
  if (pill.dataset.level !== level) pill.dataset.level = level;
  const setTip = (sel, text) => { const el = $(sel); if (el && el.dataset.tip !== text) el.dataset.tip = text; };
  const onlineTip = ['!在线状态', `在线|${s.online} 台`, `离线|${s.offline} 台`, `显示|${total} 台`];
  if (state.hiddenCount) onlineTip.push(`隐藏|${state.hiddenCount} 台（设置里排除）`);
  setTip('#onlinePill', onlineTip.join('\n'));
  setTip('.pill.up', ['!实时上行合计', `当前|${up}/s`, '口径|全部在线机器此刻的上传速率'].join('\n'));
  setTip('.pill.down', ['!实时下行合计', `当前|${down}/s`, '口径|全部在线机器此刻的下载速率'].join('\n'));
  const alertWrap = $('#headAlertWrap');
  if (s.alerts > 0) {
    alertWrap.hidden = false;
    const t = `${s.alerts}`;
    if ($('#headAlert').textContent !== t) $('#headAlert').textContent = t;
    const label = `跳转到需要关注的机器（${s.alerts} 台）`;
    if (alertWrap.getAttribute('aria-label') !== label) alertWrap.setAttribute('aria-label', label);
  } else {
    alertWrap.hidden = true;
  }
}

function updateFoot(s) {
  const parts = [`在线 ${s.online} / ${s.online + s.offline}`];
  if (state.hiddenCount) parts.push(`隐藏 ${state.hiddenCount} 台`);
  if (s.proc) parts.push(`进程 ${nf0.format(s.proc)}`);
  if (s.conn) parts.push(`连接 ${nf0.format(s.conn)}`);
  parts.push(`平均负载 ${num(s.cores > 0 ? s.load / s.cores : s.load, 2)}/核`);
  parts.push(`更新 ${timeFmt.format(new Date())}`);
  if (state.lastHistoryAt) parts.push(`历史 ${timeFmt.format(new Date(state.lastHistoryAt))}`);
  const t = parts.join(' · ');
  const el = $('#footMeta');
  const html = `${escapeHTML(t)}<i class="ago" data-f="ago"> · ${escapeHTML(agoText(state.lastLiveAt))}</i>`;
  if (el.dataset.v !== html) { el.innerHTML = html; el.dataset.v = html; }
  const rates = state.settings.showFinance
    ? `汇率 $1=¥${num(state.settings.usdCny, 2)} · €1=¥${num(state.settings.eurCny, 2)}`
    : '';
  const r = $('#footRates');
  if (r.textContent !== rates) r.textContent = rates;

  /* 备案信息：名字必填、链接可选；只接受 http(s) */
  const icp = $('#footIcp');
  if (icp) {
    const text = state.settings.icpText;
    if (text) {
      if (icp.textContent !== text) icp.textContent = text;
      if (state.settings.icpUrl) {
        if (icp.getAttribute('href') !== state.settings.icpUrl) {
          icp.setAttribute('href', state.settings.icpUrl);
          icp.setAttribute('target', '_blank');
          icp.setAttribute('rel', 'noopener noreferrer');
        }
      } else if (icp.hasAttribute('href')) {
        icp.removeAttribute('href');
        icp.removeAttribute('target');
        icp.removeAttribute('rel');
      }
      icp.hidden = false;
    } else {
      icp.hidden = true;
    }
  }
}

function setLink(kind, text) {
  const el = $('#linkState');
  if (!el) return;
  if (state.linkKind !== kind) {
    state.linkKind = kind;
    el.dataset.kind = kind;
  }
  if (el.textContent !== text) el.textContent = text;
}

let pulseTimer = null;
function schedulePulse() {
  const deck = $('#app');
  deck.dataset.pulse = '1';
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => { deck.dataset.pulse = '0'; }, 180);
}

// ---------------------------------------------------------------- 时钟与循环

function tickClock() {
  const now = new Date();
  const ago = $('#footMeta [data-f="ago"]');
  if (ago) {
    const s = ` · ${agoText(state.lastLiveAt)}`;
    if (ago.textContent !== s) ago.textContent = s;
  }
  const clock = $('#clock');
  const text = hmFmt.format(now);
  if (clock.textContent !== text) {
    clock.textContent = text;
    clock.setAttribute('datetime', now.toISOString());
  }
  // 在线时长本地推算，不必每秒都问服务器
  for (const uuid of state.order) {
    const refs = state.refs.get(uuid);
    if (!refs) continue;
    const live = state.live.get(uuid);
    if (!live || live.online === false) continue;
    const updated = Date.parse(live.status_updated_at || '');
    if (!Number.isFinite(updated)) continue;
    const seconds = (Number(live.uptime) || 0) + Math.max(0, (Date.now() - updated) / 1000);
    const t = `在线 ${fmtUptime(seconds)}`;
    if (refs.upT && refs.upT.textContent !== t) refs.upT.textContent = t;
  }
}

async function refreshHistory(force) {
  const now = Date.now();
  if (!force && now - state.lastHistoryAt < 55_000) return;
  try {
    await loadHistory();
    if (state.expanded.size) refreshDetails();
    renderLive();
  } catch {
    /* 历史失败不影响实时数字 */
  }
}

async function refreshPing(force) {
  const now = Date.now();
  if (!force && now - state.lastPingAt < 55_000) return;
  try {
    await loadPingHistory();
    renderLive();
  } catch {
    /* ignore */
  }
}

async function refreshLatest(force) {
  const now = Date.now();
  if (!force && now - state.lastLatestAt < POLL_PING_MS) return;
  try {
    await loadLatestStatus();
    renderLive();
  } catch {
    /* ignore */
  }
}

function refreshDetails() {
  for (const uuid of state.expanded) {
    const refs = state.refs.get(uuid);
    if (!refs) continue;
    const panel = refs.root.querySelector('.card-detail');
    if (panel && !panel.hidden) {
      buildDetail(uuid, panel);
      panel.dataset.filled = '1';
    }
  }
}

function askRealtime() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send('get');
  } else if (!pollTimer) {
    startPolling('轮询');
  }
}

async function manualRefresh() {
  const btn = $('#refreshBtn');
  if (!btn || btn.disabled) return; // 键盘按住 R 时 repeat 会每秒调 30 次
  btn.disabled = true;
  btn.classList.add('busy');
  try {
    askRealtime();
    await Promise.all([refreshLatest(true), refreshHistory(true), refreshPing(true)]);
  } finally {
    setTimeout(() => { btn.disabled = false; btn.classList.remove('busy'); }, 400);
  }
}

// ---------------------------------------------------------------- 启动

let booting = false;
const lifeTimers = []; // bootOnce 起的定时器，pagehide 时统一清掉

/* 防重入：错误页上的「重试」和首屏都会调 boot()，双击不能起两份
   WebSocket / 两套定时器。真正的初始化在 bootOnce()。 */
async function boot() {
  if (booting) return;
  booting = true;
  try {
    await bootOnce();
  } catch (err) {
    showBootError(err);
  } finally {
    booting = false;
  }
}

function showBootError(err) {
  const box = document.getElementById('wallError');
  const txt = document.getElementById('wallErrorText');
  const grid = document.getElementById('grid');
  const btn = document.getElementById('retryBtn');
  if (box) { box.hidden = false; box.dataset.kind = 'error'; }
  if (txt) txt.textContent = `加载失败（${err && err.message ? err.message : err}）。点「重试」再试一次。`;
  if (grid) grid.hidden = true;
  if (btn) btn.hidden = false;
  const deck = document.getElementById('app');
  if (deck) deck.dataset.state = 'ready';
  setLink('down', '连接失败');
}

async function bootOnce() {
  loadPrefs();
  applySortUI();
  applyPrivacy();
  buildSummary();
  try {
    await loadMeta();
  } catch (err) {
    $('#wallError').dataset.kind = 'error';
    $('#wallError').hidden = false;
    $('#grid').hidden = true;
    $('#wallErrorText').textContent = `无法读取 Komari 公开 API（${err.message}）。请确认站点可访问后重试。`;
    $('#retryBtn').hidden = false;
    $('#app').dataset.state = 'ready';
    setLink('down', '连接失败');
    return;
  }
  $('#wallError').hidden = true;
  $('#grid').hidden = false;
  buildSummary(); // 汇总格子取决于刚读到的设置（showFinance）
  if (!state.nodes.length) {
    $('#wallError').hidden = false;
    $('#grid').hidden = true;
    $('#wallErrorText').textContent = state.hiddenCount
      ? `设置里隐藏了全部 ${state.hiddenCount} 台机器。清空「隐藏的机器」后卡片会回来。`
      : '站点还没有已启用的节点。在 Komari 后台添加节点后，这里会自动出现卡片。';
    $('#retryBtn').hidden = true;
    $('#wallError').dataset.kind = 'empty';
    setLink('poll', '等待节点');
    // 账本和顶栏照常亮：一路 0，比一片空白更像「这里本来就没事」
    $('#app').dataset.state = 'ready';
    buildRows();
    renderAll([]);
    return;
  }
  buildRows();
  setLink('poll', '载入中…');

  try { await loadLatestStatus(); } catch { /* 等 WS */ }
  renderLive();

  startRealtime();
  $('#app').dataset.state = 'ready';

  refreshHistory(true);
  refreshPing(true);
  refreshLatest(true);

  lifeTimers.push(setInterval(() => {
    if (document.hidden) return;
    askRealtime();
  }, state.settings.refreshInterval * 1000));

  lifeTimers.push(setInterval(() => { if (!document.hidden) refreshLatest(); }, POLL_PING_MS));
  lifeTimers.push(setInterval(() => { if (!document.hidden) refreshHistory(false); }, 60_000));
  lifeTimers.push(setInterval(() => { if (!document.hidden) refreshPing(false); }, 60_000));
  lifeTimers.push(setInterval(tickClock, 1000));
  tickClock();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      askRealtime();
      refreshHistory(false);
      refreshPing(false);
    }
  });
  window.addEventListener('resize', debounce(() => { applyCols(); renderLive(); }, 200));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (state.expanded.size) collapseAll();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (ev.key === 'r' || ev.key === 'R') {
      ev.preventDefault();
      manualRefresh();
      toast('正在刷新…');
    } else if (ev.key === 'p' || ev.key === 'P') {
      ev.preventDefault();
      togglePrivacy();
    } else if (ev.key === '?') {
      ev.preventDefault();
      toast('方向键换卡片 · Enter 展开 · Esc 收起 · R 刷新 · P 隐私');
    }
  });
  window.addEventListener('hashchange', () => {
    const m = /^#node-([0-9a-zA-Z-]+)$/.exec(location.hash || '');
    if (m) {
      if (state.refs.has(m[1]) && !state.expanded.has(m[1])) toggleDetail(m[1], true);
    } else if (state.expanded.size) {
      collapseAll();
    }
  });
  $('#sortBtn').addEventListener('click', cycleSort);
  const pv = $('#privacyBtn');
  if (pv) pv.addEventListener('click', togglePrivacy);
  $('#refreshBtn').addEventListener('click', manualRefresh);
  $('#schemeBtn').addEventListener('click', toggleScheme);
  initUX();
}

// ---------------------------------------------------------------- 交互层

function pingsTip() {
  const h = Number(state.settings.historyHours) || 2;
  const min = Math.max(1, Math.round(h * 60 / LB));
  return [
    `!三网延迟 · 近 ${h} 小时 / ${LB} 格`,
    `每格 ${min} 分钟，从左到右是时间`,
    '绿=正常 · 黄=偏慢 · 橙=很慢或丢包 · 红=丢包严重',
    '悬停看某一刻的三网对比',
  ].join('\n');
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.dataset.show = '0'; }, 2400);
}
const tip = { el: null, target: null, timer: 0, open: false };

function agoText(ts) {
  if (!ts) return '等待数据';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return '刚刚';
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  return `${Math.round(m / 60)} 小时前`;
}

function tipEl() {
  if (!tip.el) tip.el = $('#tip');
  return tip.el;
}

function tipMarkup(text) {
  return String(text).split('\n').filter((l) => l.trim()).map((line) => {
    if (line.startsWith('!')) return `<span class="tip-h">${escapeHTML(line.slice(1))}</span>`;
    const i = line.indexOf('|');
    if (i < 0) return `<span class="tip-r"><span class="tip-k">${escapeHTML(line)}</span></span>`;
    return `<span class="tip-r"><span class="tip-k">${escapeHTML(line.slice(0, i))}</span><span class="tip-v">${escapeHTML(line.slice(i + 1))}</span></span>`;
  }).join('');
}

function tipPlace(anchor) {
  const el = tipEl();
  if (!el || el.dataset.show !== '1') return;
  const r = el.getBoundingClientRect();
  let x;
  let y;
  if (anchor && anchor.clientX != null) {
    x = anchor.clientX + 14;
    y = anchor.clientY + 16;
    if (y + r.height > window.innerHeight - 8) y = anchor.clientY - r.height - 12;
  } else if (anchor) {
    const t = anchor.getBoundingClientRect();
    x = t.left + t.width / 2 - r.width / 2;
    y = t.top - r.height - 10;
    if (y < 8) y = t.bottom + 10;
  } else {
    return;
  }
  x = Math.min(Math.max(8, x), window.innerWidth - r.width - 8);
  y = Math.min(Math.max(8, y), window.innerHeight - r.height - 8);
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

function tipShow(text, anchor) {
  const el = tipEl();
  if (!el || !text) return;
  const html = tipMarkup(text);
  if (el.dataset.v !== html) { el.innerHTML = html; el.dataset.v = html; }
  el.dataset.show = '1';
  el.setAttribute('aria-hidden', 'false');
  tip.open = true;
  requestAnimationFrame(() => tipPlace(anchor));
}

function tipHide() {
  const el = tipEl();
  clearTimeout(tip.timer);
  tip.timer = 0;
  tip.target = null;
  tip.open = false;
  if (el) {
    el.dataset.show = '0';
    el.setAttribute('aria-hidden', 'true');
  }
}

function initTip() {
  document.addEventListener('pointerover', (ev) => {
    const target = ev.target.closest && ev.target.closest('[data-tip]');
    if (!target) return;
    if (target === tip.target) {
      if (tip.open) tipPlace({ clientX: ev.clientX, clientY: ev.clientY });
      return;
    }
    clearTimeout(tip.timer);
    tip.target = target;
    const at = { clientX: ev.clientX, clientY: ev.clientY };
    tip.timer = setTimeout(() => {
      const text = target.getAttribute('data-tip');
      if (text && target === tip.target) tipShow(text, at);
    }, 90);
  });
  document.addEventListener('pointerout', (ev) => {
    const target = ev.target.closest && ev.target.closest('[data-tip]');
    if (!target || target !== tip.target) return;
    if (ev.relatedTarget && target.contains(ev.relatedTarget)) return;
    // 触屏抬手后三网对比再留 2.5 秒，轻点一下也来得及看清
    if (ev.pointerType !== 'mouse' && target.classList.contains('pings')) {
      clearTimeout(tip.timer);
      tip.timer = setTimeout(() => { tipHide(); clearXhair(target); target.setAttribute('data-tip', pingsTip()); }, 2500);
      return;
    }
    tipHide();
  });
  document.addEventListener('pointerdown', tipHide, true);
  /* 键盘 / 读屏：焦点落在带 data-tip 的元素上时，用元素中心当锚点显示同一份提示 */
  document.addEventListener('focusin', (ev) => {
    const target = ev.target.closest && ev.target.closest('[data-tip]');
    if (!target) return;
    const r = target.getBoundingClientRect();
    const text = target.getAttribute('data-tip');
    if (!text) return;
    tip.target = target;
    tipShow(text, { clientX: r.left + r.width / 2, clientY: r.bottom });
  });
  document.addEventListener('focusout', tipHide, true);
  window.addEventListener('scroll', () => { if (tip.open) tipHide(); }, true);
}

// 三网信号条：横着指向某一刻，三条线同时高亮并给出那一刻的对比
function clearXhair(root) {
  if (!root) return;
  if (!root.dataset.x) return;
  delete root.dataset.x;
  for (const bar of $$('.lbars i.cur', root)) bar.classList.remove('cur');
}

/* 指向（鼠标悬停或手指按住）某一格：三条线同时高亮，提示给出那一刻的三网对比。
   force 为真时即使提示还没打开也立刻显示（触屏没有悬停，只能按住拖） */
function xhairAt(pings, target, clientX, clientY, force) {
  // 左边文字列不是数据列：停在标签上时显示「这是什么」的说明，而不是某一刻的对比
  if (target.closest('.lane-head')) {
    if (pings.dataset.x) clearXhair(pings);
    return;
  }
  const bars = pings.querySelector('.lbars');
  if (!bars || !bars.children.length) return;
  const r = bars.getBoundingClientRect();
  if (!r.width) return;
  const n = bars.children.length;
  const idx = Math.min(n - 1, Math.max(0, Math.floor((clientX - r.left) / (r.width / n))));
  // 触屏时提示放在状态条上方，不被手指挡住；鼠标时跟着指针
  const anchor = force ? pings : { clientX, clientY };
  if (pings.dataset.x === String(idx)) {
    if (tip.open) tipPlace(anchor);
    else if (force) tipShow(pings.getAttribute('data-tip'), anchor);
    return;
  }
  pings.dataset.x = String(idx);
  const lanes = $$('.lane', pings);
  for (const lane of lanes) {
    const bs = lane.querySelectorAll('.lbars i');
    for (let i = 0; i < bs.length; i += 1) bs[i].classList.toggle('cur', i === idx);
  }
  const xh = $('.xhair', pings);
  if (xh) {
    const pr = pings.getBoundingClientRect();
    xh.style.left = `${Math.round(r.left - pr.left + (idx + 0.5) * (r.width / n))}px`;
  }
  const rows = lanes.map((lane) => {
    const key = ($('.lk', lane) || {}).textContent || '';
    const laneBars = lane.querySelector('.lbars');
    const b = laneBars && laneBars.children[idx];
    const ms = b && b.dataset ? b.dataset.ms : '';
    const loss = b && b.dataset ? b.dataset.loss : '';
    const lv = b && b.dataset ? b.dataset.lv : '';
    if (!lv) return `${key}|—`;
    return `${key}|${ms ? `${ms} ms` : '全部超时'} · 丢 ${loss}% · ${SEG_TEXT[lv]}`;
  });
  const first = lanes[0] && lanes[0].querySelector('.lbars');
  const t0 = first && first.children[idx] ? first.children[idx].dataset.t : '';
  const t0d = t0 ? safeDate(Number(t0)) : null;
  const head = t0d ? `!${hmFmt.format(t0d)} 前后` : '!三网延迟';
  const text = `${head}\n${rows.join('\n')}`;
  pings.setAttribute('data-tip', text);
  if (tip.open || force) {
    tip.target = pings;
    tipShow(text, anchor);
  }
}

function initCrosshair() {
  document.addEventListener('pointermove', (ev) => {
    const pings = ev.target.closest && ev.target.closest('.pings');
    if (!pings) return;
    xhairAt(pings, ev.target, ev.clientX, ev.clientY, ev.pointerType !== 'mouse');
  });

  /* 触屏：手指按在状态条上就显示那一刻。全局的 pointerdown（捕获阶段）会先收起提示，
     这里在它之后注册，所以能立刻重新打开 */
  document.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const pings = ev.target.closest && ev.target.closest('.pings');
    if (!pings || !ev.target.closest('.lbars')) return;
    delete pings.dataset.x;
    xhairAt(pings, ev.target, ev.clientX, ev.clientY, true);
  }, true);

  document.addEventListener('pointerout', (ev) => {
    const pings = ev.target.closest && ev.target.closest('.pings');
    if (!pings) return;
    if (ev.pointerType !== 'mouse') return; // 触屏由上面的延时收起
    if (ev.relatedTarget && pings.contains(ev.relatedTarget)) return;
    clearXhair(pings);
    pings.setAttribute('data-tip', pingsTip());
  });
}

// 键盘：方向键在卡片之间移动焦点，Tab 仍是逐卡
function initKeyboard() {
  const grid = $('#grid');
  if (!grid) return;
  grid.addEventListener('keydown', (ev) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(ev.key)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const cards = $$('.card', grid);
    const from = ev.target.closest && ev.target.closest('.card');
    const idx = cards.indexOf(from);
    if (idx < 0) return;
    let cols = 1;
    const top0 = Math.round(cards[0].getBoundingClientRect().top);
    for (let i = 1; i < cards.length; i += 1) {
      if (Math.round(cards[i].getBoundingClientRect().top) === top0) cols += 1;
      else break;
    }
    let next = idx;
    if (ev.key === 'ArrowRight') next = idx + 1;
    else if (ev.key === 'ArrowLeft') next = idx - 1;
    else if (ev.key === 'ArrowDown') next = idx + cols;
    else if (ev.key === 'ArrowUp') next = idx - cols;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = cards.length - 1;
    if (next === idx || next < 0 || next >= cards.length) { ev.preventDefault(); return; }
    ev.preventDefault();
    const target = cards[next].querySelector('.more') || cards[next];
    target.focus({ preventScroll: true });
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cards[next].scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  });
}

function initBackToTop() {
  const btn = $('#toTop');
  if (!btn) return;
  const wall = $('#wall');
  const sync = () => {
    const doc = document.scrollingElement || document.documentElement;
    const wallTop = wall ? wall.scrollTop : 0;
    const top = Math.max(wallTop, window.scrollY || 0);
    const maxWall = wall ? wall.scrollHeight - wall.clientHeight : 0;
    const maxDoc = doc ? doc.scrollHeight - doc.clientHeight : 0;
    const max = Math.max(maxWall, maxDoc);
    const want = max > 120 && top > Math.min(320, max * 0.2);
    if (!want !== btn.hidden) btn.hidden = !want;
  };
  if (wall) wall.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('scroll', sync, { passive: true });
  btn.addEventListener('click', () => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduce ? 'auto' : 'smooth';
    if (wall && wall.scrollTop > 0) wall.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  });
  sync();
}

function initUX() {
  initTip();
  const alertWrap = $('#headAlertWrap');
  if (alertWrap) alertWrap.addEventListener('click', jumpToAttention);
  initCrosshair();
  initKeyboard();
  initBackToTop();
}

const SCHEME_KEY = 'komari-signal-scheme';

function resolveScheme() {
  /* 存储被禁用时（Safari「阻止所有 Cookie」、第三方 iframe）读 localStorage 会抛，
     不能让一次配色查询把整个 boot 拖进「API 不可用」分支。 */
  let forced = null;
  try { forced = localStorage.getItem(SCHEME_KEY); } catch { /* 无存储权限 */ }
  const mode = forced || state.settings.colorMode || 'auto';
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyScheme() {
  const scheme = resolveScheme();
  document.documentElement.dataset.scheme = scheme;
  // 首屏在 <head> 里用两条 media 版 theme-color 防闪白；这里按已解析的结果统一覆盖
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', scheme === 'dark' ? '#002b36' : '#fdf6e3');
  }
  const btn = $('#schemeBtn');
  if (btn) btn.setAttribute('aria-label', scheme === 'dark' ? '切换到浅色外观' : '切换到深色外观');
}

function toggleScheme() {
  const next = document.documentElement.dataset.scheme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(SCHEME_KEY, next); } catch { /* 隐私模式忽略 */ }
  applyScheme();
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* 「重试」必须在第一次渲染之前就绑好：错误页出现时，成功路径上的监听器根本还没执行到。 */
const retryBtn = document.getElementById('retryBtn');
if (retryBtn) {
  retryBtn.addEventListener('click', () => {
    const box = document.getElementById('wallError');
    if (box) { box.hidden = true; box.dataset.kind = 'error'; }
    const grid = document.getElementById('grid');
    if (grid) grid.hidden = false;
    boot();
  });
}

window.addEventListener('pagehide', () => {
  stopRealtime();
  stopPolling();
  for (const t of lifeTimers.splice(0)) clearInterval(t);
});

// 从往返缓存恢复时连接和定时器都已停掉，重新载入，免得页面停在旧数据上
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) location.reload();
});

boot();
