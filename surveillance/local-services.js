import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const hostProcRoot = process.env.HOST_PROC_ROOT || '/host/proc';
const registryPath = process.env.PROJECT_REGISTRY_PATH || fileURLToPath(new URL('./projects.json', import.meta.url));

function decodeIpv4(hex) {
  if (!/^[0-9A-F]{8}$/i.test(hex)) return 'unknown';
  const bytes = hex.match(/../g).reverse().map((value) => Number.parseInt(value, 16));
  return bytes.join('.');
}

function decodeIpv6Scope(hex) {
  if (/^0{32}$/i.test(hex)) return '::';
  if (/^0{30}01$/i.test(hex) || /^0{24}01000000$/i.test(hex)) return '::1';
  return 'ipv6';
}

export function parseProcNetListeners(text, family = 'ipv4') {
  const listeners = [];
  for (const line of String(text || '').trim().split('\n').slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 4 || columns[3] !== '0A') continue;
    const [addressHex, portHex] = columns[1].split(':');
    const port = Number.parseInt(portHex, 16);
    if (!Number.isInteger(port)) continue;
    listeners.push({
      address: family === 'ipv6' ? decodeIpv6Scope(addressHex) : decodeIpv4(addressHex),
      port,
      family
    });
  }
  return listeners;
}

async function readProcNetFile(name) {
  try {
    return await readFile(`${hostProcRoot}/net/${name}`, 'utf8');
  } catch {
    try {
      return await readFile(`/proc/net/${name}`, 'utf8');
    } catch {
      return '';
    }
  }
}

export async function readHostListeners() {
  const [tcp, tcp6] = await Promise.all([readProcNetFile('tcp'), readProcNetFile('tcp6')]);
  return [...parseProcNetListeners(tcp, 'ipv4'), ...parseProcNetListeners(tcp6, 'ipv6')];
}

export function listenerMatches(project, listener) {
  if (Number(project.port) !== listener.port) return false;
  if (project.bindAddress === '0.0.0.0') return listener.address === '0.0.0.0' || listener.address === '::';
  if (project.bindAddress === '127.0.0.1') return listener.address.startsWith('127.') || listener.address === '::1';
  return project.bindAddress === listener.address;
}

export async function readProjectRegistry() {
  const parsed = JSON.parse(await readFile(registryPath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Project registry must be an array');
  return parsed.filter((project) => project && project.projectName && Number.isInteger(Number(project.port))).map((project) => ({
    projectId: String(project.projectId || project.projectName),
    projectName: String(project.projectName),
    bindAddress: String(project.bindAddress || '127.0.0.1'),
    port: Number(project.port),
    protocol: String(project.protocol || 'TCP'),
    checkUrl: project.checkUrl ? String(project.checkUrl) : '',
    purpose: String(project.purpose || ''),
    routes: Array.isArray(project.routes) ? project.routes.map(String) : []
  }));
}

export async function buildLocalProjectInventory() {
  const [projects, listeners] = await Promise.all([readProjectRegistry(), readHostListeners()]);
  const items = await Promise.all(projects.map(async (project) => {
    const listener = listeners.find((candidate) => listenerMatches(project, candidate));
    let reachable = false;
    if (!listener && project.checkUrl) {
      try {
        const response = await fetch(project.checkUrl, { signal: AbortSignal.timeout(2_000) });
        reachable = response.status < 500;
      } catch {
        reachable = false;
      }
    }
    const { checkUrl, ...safeProject } = project;
    return {
      ...safeProject,
      endpoint: `${project.bindAddress}:${project.port}`,
      state: listener || reachable ? 'active' : 'inactive',
      detectionSource: listener ? 'kernel-listener' : reachable ? 'service-health' : 'unavailable',
      listenerFamily: listener?.family
    };
  }));
  return {
    registeredCount: items.length,
    activeCount: items.filter((item) => item.state === 'active').length,
    projects: items,
    note: '状态来自主机内核监听或已登记服务健康探测；不展示进程、PID 或未登记系统端口。'
  };
}
