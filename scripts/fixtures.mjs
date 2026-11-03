// 演示数据：给截图 / README / 本地预览用，全部是合成值，不含任何真实机器信息。
// 结构与 Komari 公开接口一致：/api/nodes、/api/public、/api/task/ping、/api/rpc2。

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export const TASKS = [
  { id: 1, weight: 0, name: '北京移动', clients: [] },
  { id: 2, weight: 1, name: '北京电信', clients: [] },
  { id: 3, weight: 2, name: '北京联通', clients: [] },
];

export const THEME_SETTINGS = {
  refreshInterval: 3,
  historyHours: 2,
  showTrace: true,
  warnThreshold: 85,
  colorMode: 'auto',
  hiddenNodes: '',
  showAdmin: true,
  showFinance: true,
  usdCny: 7.1,
  eurCny: 8.0,
};

const day = 86400_000;
const fromNow = (days) => new Date(Date.now() + days * day).toISOString();

export const NODES = [
  {
    uuid: 'd0e0a1b2-0001-4a11-9f01-000000000001', name: 'tokyo-01', region: '🇯🇵',
    cpu_name: 'AMD EPYC 7B13 64-Core Processor', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 8, cpu_physical_cores: 4, os: 'Debian 13', kernel_version: '6.12.9-amd64',
    gpu_name: 'None', public_remark: '主站与 API', mem_total: 8 * GB, swap_total: 2 * GB,
    disk_total: 160 * GB, weight: 0, price: 890, billing_cycle: 90, auto_renewal: true,
    currency: '$', expired_at: fromNow(71), group: 'edge', tags: 'web, api',
    hidden: false, traffic_limit: 3 * TB, traffic_limit_type: 'sum',
    created_at: fromNow(-420), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0002-4a11-9f01-000000000002', name: 'osaka-02', region: '🇯🇵',
    cpu_name: 'Intel Xeon E5-2699 v4 @ 2.20GHz', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 4, cpu_physical_cores: 4, os: 'Ubuntu 24.04', kernel_version: '6.8.0-45-generic',
    gpu_name: 'None', public_remark: '', mem_total: 4 * GB, swap_total: 2 * GB,
    disk_total: 80 * GB, weight: 1, price: 42, billing_cycle: 30, auto_renewal: false,
    currency: '€', expired_at: fromNow(12), group: '', tags: 'backup',
    hidden: false, traffic_limit: 2 * TB, traffic_limit_type: 'max',
    created_at: fromNow(-260), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0003-4a11-9f01-000000000003', name: 'frankfurt-03', region: '🇩🇪',
    cpu_name: 'AMD EPYC 7443P 24-Core Processor', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 6, cpu_physical_cores: 3, os: 'Debian 12', kernel_version: '6.1.0-26-amd64',
    gpu_name: 'None', public_remark: '数据库从库', mem_total: 16 * GB, swap_total: 0,
    disk_total: 320 * GB, weight: 2, price: -1, billing_cycle: 0, auto_renewal: false,
    currency: '¥', expired_at: null, group: 'db', tags: 'db, 开源机',
    hidden: false, traffic_limit: 0, traffic_limit_type: 'sum',
    created_at: fromNow(-700), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0004-4a11-9f01-000000000004', name: 'singapore-04', region: '🇸🇬',
    cpu_name: 'Intel Xeon Platinum 8470Q', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 4, cpu_physical_cores: 2, os: 'Alpine Linux 3.21', kernel_version: '6.12.4-lts',
    gpu_name: 'None', public_remark: '', mem_total: 6 * GB, swap_total: 1 * GB,
    disk_total: 96 * GB, weight: 3, price: 129, billing_cycle: 30, auto_renewal: true,
    currency: '¥', expired_at: fromNow(48), group: 'edge', tags: 'web',
    hidden: false, traffic_limit: 1.5 * TB, traffic_limit_type: 'sum',
    created_at: fromNow(-180), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0005-4a11-9f01-000000000005', name: 'sydney-05', region: '🇦🇺',
    cpu_name: 'Ampere Altra Q80-30', virtualization: 'kvm', arch: 'arm64',
    cpu_cores: 4, cpu_physical_cores: 4, os: 'Ubuntu 24.04', kernel_version: '6.8.0-45-generic',
    gpu_name: 'None', public_remark: 'ARM 跑构建', mem_total: 12 * GB, swap_total: 2 * GB,
    disk_total: 64 * GB, weight: 4, price: 64.34, billing_cycle: 1095, auto_renewal: false,
    currency: '$', expired_at: fromNow(923), group: 'ci', tags: 'ci, arm',
    hidden: false, traffic_limit: 4 * TB, traffic_limit_type: 'sum',
    created_at: fromNow(-520), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0006-4a11-9f01-000000000006', name: 'london-06', region: '🇬🇧',
    cpu_name: 'AMD Ryzen 9 7950X 16-Core Processor', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 6, cpu_physical_cores: 6, os: 'Debian 12', kernel_version: '6.1.0-26-amd64',
    gpu_name: 'None', public_remark: '', mem_total: 32 * GB, swap_total: 8 * GB,
    disk_total: 1 * TB, weight: 5, price: 34.5, billing_cycle: 30, auto_renewal: false,
    currency: '£', expired_at: fromNow(5), group: 'edge', tags: 'web, cdn',
    hidden: false, traffic_limit: 8 * TB, traffic_limit_type: 'up',
    created_at: fromNow(-95), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0007-4a11-9f01-000000000007', name: 'new-york-07', region: '🇺🇸',
    cpu_name: 'Intel Xeon Gold 6338 @ 2.00GHz', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 8, cpu_physical_cores: 4, os: 'Rocky Linux 9', kernel_version: '5.14.0-427.el9',
    gpu_name: 'None', public_remark: '对象存储网关', mem_total: 16 * GB, swap_total: 4 * GB,
    disk_total: 2 * TB, weight: 6, price: 999, billing_cycle: 365, auto_renewal: false,
    currency: '$', expired_at: fromNow(287), group: 'storage', tags: 'storage',
    hidden: false, traffic_limit: 10 * TB, traffic_limit_type: 'sum',
    created_at: fromNow(-600), updated_at: new Date().toISOString(),
  },
  {
    uuid: 'd0e0a1b2-0008-4a11-9f01-000000000008', name: 'toronto-08', region: '🇨🇦',
    cpu_name: 'Intel Xeon E-2288G @ 3.70GHz', virtualization: 'kvm', arch: 'amd64',
    cpu_cores: 4, cpu_physical_cores: 4, os: 'Windows Server 2022', kernel_version: '10.0.20348',
    gpu_name: 'None', public_remark: '', mem_total: 8 * GB, swap_total: 0,
    disk_total: 500 * GB, weight: 7, price: 79, billing_cycle: 365, auto_renewal: true,
    currency: '¥', expired_at: fromNow(118), group: '', tags: '',
    hidden: false, traffic_limit: 0, traffic_limit_type: 'sum',
    created_at: fromNow(-340), updated_at: new Date().toISOString(),
  },
];

/* 每台机器的"当前状态"，数值是合成的，形状与 common:getNodesLatestStatus 一致 */
const LIVE = {
  1: { cpu: 27.7, ram: 0.42, disk: 0.65, up: 340e3, down: 1.2e6, proc: 186, tcp: 142, udp: 21, upT: 722 * GB, downT: 341 * GB, load: 8.9 },
  2: { cpu: 1.4, ram: 0.75, disk: 0.405, up: 12e3, down: 40e3, proc: 92, tcp: 31, udp: 4, upT: 60.8 * GB, downT: 455 * GB, load: 0.19 },
  3: { cpu: 3.1, ram: 0.069, disk: 0.252, up: 90e3, down: 210e3, proc: 210, tcp: 190, udp: 12, upT: 1.63 * TB, downT: 50 * TB, load: 1.05 },
  4: { cpu: 8.0, ram: 0.353, disk: 0.819, up: 1.1e6, down: 2.4e6, proc: 240, tcp: 260, udp: 33, upT: 372 * GB, downT: 373 * GB, load: 0.35 },
  5: { cpu: 18.5, ram: 0.62, disk: 0.44, up: 220e3, down: 900e3, proc: 168, tcp: 120, udp: 9, upT: 1.1 * TB, downT: 4.2 * TB, load: 1.8 },
  6: { cpu: 55.2, ram: 0.78, disk: 0.71, up: 1.8e6, down: 5.4e6, proc: 402, tcp: 512, udp: 61, upT: 2.4 * TB, downT: 8.1 * TB, load: 4.4 },
  7: { cpu: 12.4, ram: 0.48, disk: 0.36, up: 640e3, down: 2.8e6, proc: 320, tcp: 240, udp: 18, upT: 4.6 * TB, downT: 12.4 * TB, load: 0.9 },
  8: { cpu: 22.9, ram: 0.58, disk: 0.52, up: 90e3, down: 260e3, proc: 140, tcp: 88, udp: 6, upT: 1.6 * TB, downT: 2.2 * TB, load: 1.2 },
};

const pingOf = (i) => {
  const table = [
    [[284, 14.8], [230, 14.8], [229, 0]],
    [[0, 100], [312, 0], [0, 100]],
    [[149, 4.9], [172, 16.4], [239, 1.6]],
    [[207, 9.8], [156, 11.5], [177, 0]],
    [[96, 0.8], [188, 2.1], [142, 1.2]],
    [[61, 2.4], [88, 6.1], [102, 0.4]],
    [[118, 6.6], [131, 3.2], [154, 2.8]],
    [[190, 85.2], [169, 16.4], [254, 0]],
  ][i];
  return table.map(([latest, loss], n) => ({
    latest, avg: Math.round(latest * 1.08), loss,
    min: Math.max(1, Math.round(latest * 0.82)), max: Math.round(latest * 1.6),
    name: TASKS[n].name,
  }));
};

export function latestStatus() {
  const now = new Date().toISOString();
  const result = { online: NODES.map(n => n.uuid) };
  NODES.forEach((n, i) => {
    const v = LIVE[i + 1];
    const ram = Math.round(n.mem_total * (0.45 + v.cpu / 400));
    const disk = Math.round(n.disk_total * (0.3 + (i % 5) * 0.09));
    result[n.uuid] = {
      cpu: v.cpu, ram, ram_total: n.mem_total, swap: 0, swap_total: n.swap_total,
      load: v.load, load5: v.load * 0.9, load15: v.load * 0.8,
      disk, disk_total: n.disk_total,
      net_in: v.down, net_out: v.up, net_total_up: v.upT, net_total_down: v.downT,
      connections: v.tcp, connections_udp: v.udp, process: v.proc,
      uptime: 86400 * (20 + i * 3) + 3600 * (i + 1),
      msg: '', message: '', temp: 40 + i,
      online: true, time: now, updated_at: now,
      ping: i === 1 ? {} : Object.fromEntries([1, 2, 3].map(k => [String(k),
        { latest: 120 + k * 30 + i * 12, avg: 140 + k * 30 + i * 12, loss: k === 1 && i === 7 ? 85 : (i + k) % 5, min: 90 + i, max: 300 + i }])),
    };
    if (i === 1) result[n.uuid].online = false;
  });
  return result;
}

/* 两小时、每分钟一个点 */
const point = (i) => 0.5 + 0.5 * Math.sin(i / 9 + Math.PI / 3);

export function historyRecords(hours = 2) {
  const now = Date.now();
  const step = 60_000;
  const count = Math.round(hours * 60);
  const out = [];
  NODES.forEach((n, i) => {
    const v = LIVE[i + 1];
    for (let k = 0; k < count; k += 1) {
      const t = new Date(now - (count - 1 - k) * step).toISOString();
      const w = point(k + i * 7);
      out.push({
        client: n.uuid, time: t,
        cpu: Math.max(0, Math.min(100, v.cpu * (0.6 + 0.8 * w))),
        ram: Math.round(n.mem_total * (0.40 + 0.35 * w)),
        disk: Math.round(n.disk_total * (0.30 + (i % 5) * 0.09)),
        net_in: Math.round(v.down * (0.4 + 1.1 * w)),
        net_out: Math.round(v.up * (0.4 + 1.1 * w)),
        process: Math.round(v.proc * (0.9 + 0.2 * w)),
        connections: Math.round(v.tcp * (0.9 + 0.25 * w)),
        connections_udp: Math.round(v.udp * (0.9 + 0.2 * w)),
      });
    }
  });
  return out;
}

export function pingRecords(hours = 2) {
  const now = Date.now();
  const step = 60_000;
  const count = Math.round(hours * 60);
  const out = [];
  NODES.forEach((n, i) => {
    if (i === 1) return; // osaka-02 离线：没有三网数据
    const rows = pingOf(i);
    for (let k = 0; k < count; k += 1) {
      const t = new Date(now - (count - 1 - k) * step).toISOString();
      rows.forEach((row, j) => {
        const ms = Math.round(row.latest * (0.75 + 0.5 * point(k + i + j * 3)));
        out.push({ client: n.uuid, task_id: j + 1, time: t, value: ms, loss: row.loss });
      });
    }
  });
  return out;
}

export function snapshot() {
  const data = {};
  const live = latestStatus();
  for (const n of NODES) {
    const st = live[n.uuid];
    data[n.uuid] = {
      cpu: { usage: st.cpu },
      ram: { used: st.ram, total: n.mem_total },
      swap: { used: 0, total: n.swap_total },
      load: { load1: st.load, load5: st.load5, load15: st.load15 },
      disk: { used: st.disk, total: n.disk_total },
      network: { up: st.net_out, down: st.net_in, totalUp: st.net_total_up, totalDown: st.net_total_down },
      connections: { tcp: st.connections, udp: st.connections_udp },
      process: st.process, uptime: st.uptime, message: '', temp: st.temp,
      updated_at: new Date().toISOString(),
    };
  }
  return { jsonrpc: '2.0', status: 'success', data: { online: NODES.filter((_, i) => i !== 1).map(n => n.uuid), data } };
}

export const PUBLIC = {
  data: {
    sitename: 'Demo Fleet',
    theme_settings: THEME_SETTINGS,
    cors_origin_check_enabled: false,
  },
};
