import os from 'node:os';
import { readFile } from 'node:fs/promises';

const hostProcRoot = process.env.HOST_PROC_ROOT || '/host/proc';

async function readProcFile(name) {
  try {
    return await readFile(`${hostProcRoot}/${name}`, 'utf8');
  } catch {
    return readFile(`/proc/${name}`, 'utf8');
  }
}

export function parseLoadAverage(text) {
  const values = String(text || '').trim().split(/\s+/).slice(0, 3).map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Unable to parse load average');
  }
  return { one: values[0], five: values[1], fifteen: values[2] };
}

export function parseMemoryInfo(text) {
  const values = {};
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
    if (match) values[match[1]] = Number(match[2]) * 1024;
  }
  const totalBytes = values.MemTotal || 0;
  const availableBytes = values.MemAvailable || values.MemFree || 0;
  if (!totalBytes) throw new Error('Unable to parse memory information');
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  return {
    totalBytes,
    availableBytes,
    usedBytes,
    usedPercent: Number(((usedBytes / totalBytes) * 100).toFixed(1))
  };
}

export function parseUptime(text) {
  const value = Number(String(text || '').trim().split(/\s+/)[0]);
  if (!Number.isFinite(value)) throw new Error('Unable to parse uptime');
  return Math.max(0, Math.floor(value));
}

export function loadState(loadOne, cpuCores) {
  const normalizedPercent = cpuCores > 0 ? (loadOne / cpuCores) * 100 : 0;
  return {
    normalizedPercent: Number(normalizedPercent.toFixed(1)),
    state: normalizedPercent >= 100 ? 'critical' : normalizedPercent >= 70 ? 'warning' : 'healthy'
  };
}

export function memoryState(usedPercent) {
  return usedPercent >= 90 ? 'critical' : usedPercent >= 80 ? 'warning' : 'healthy';
}

function cpuTimes() {
  return os.cpus().reduce((totals, cpu) => {
    const idle = cpu.times.idle;
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: totals.idle + idle, total: totals.total + total };
  }, { idle: 0, total: 0 });
}

export class CpuSampler {
  constructor() {
    this.previous = cpuTimes();
    this.currentPercent = 0;
  }

  sample() {
    const next = cpuTimes();
    const idleDelta = next.idle - this.previous.idle;
    const totalDelta = next.total - this.previous.total;
    this.previous = next;
    if (totalDelta > 0) {
      this.currentPercent = Number((Math.max(0, Math.min(1, 1 - idleDelta / totalDelta)) * 100).toFixed(1));
    }
    return this.currentPercent;
  }
}

export async function readHostSnapshot(cpuPercent = 0) {
  const [loadText, memoryText, uptimeText] = await Promise.all([
    readProcFile('loadavg').catch(() => ''),
    readProcFile('meminfo').catch(() => ''),
    readProcFile('uptime').catch(() => '')
  ]);
  const cpuCores = os.cpus().length || 1;
  const osLoad = os.loadavg();
  const load = loadText ? parseLoadAverage(loadText) : { one: osLoad[0] || 0, five: osLoad[1] || 0, fifteen: osLoad[2] || 0 };
  const memory = memoryText ? parseMemoryInfo(memoryText) : (() => {
    const totalBytes = os.totalmem();
    const availableBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    return { totalBytes, availableBytes, usedBytes, usedPercent: Number(((usedBytes / totalBytes) * 100).toFixed(1)) };
  })();
  const loadAssessment = loadState(load.one, cpuCores);
  return {
    cpuCores,
    cpuPercent,
    cpuState: cpuPercent >= 90 ? 'critical' : cpuPercent >= 75 ? 'warning' : 'healthy',
    load,
    normalizedLoadPercent: loadAssessment.normalizedPercent,
    loadState: loadAssessment.state,
    memory: { ...memory, state: memoryState(memory.usedPercent) },
    uptimeSeconds: uptimeText ? parseUptime(uptimeText) : Math.floor(os.uptime())
  };
}
