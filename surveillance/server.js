import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CpuSampler, readHostSnapshot } from './metrics.js';

const port = Number(process.env.PORT || 8090);
const listingHealthUrl = process.env.LISTING_WORKSTATION_HEALTH_URL || 'http://listing-workstation:8080/api/health';
const publicDirectory = fileURLToPath(new URL('./public', import.meta.url));
const cpuSampler = new CpuSampler();
const startedAt = Date.now();
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

cpuSampler.sample();
const sampleTimer = setInterval(() => cpuSampler.sample(), 5_000);
sampleTimer.unref();

function commonHeaders() {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  };
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { ...commonHeaders(), 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

async function checkService(name, url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000), headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    const healthy = response.ok && payload.ok !== false;
    return {
      name,
      state: healthy ? 'healthy' : 'critical',
      latencyMs: Math.round(performance.now() - started),
      message: healthy ? '健康检查通过' : `健康检查返回 HTTP ${response.status}`,
      configured: typeof payload.dataSuiteConfigured === 'boolean' ? payload.dataSuiteConfigured : undefined
    };
  } catch (error) {
    return {
      name,
      state: 'critical',
      latencyMs: Math.round(performance.now() - started),
      message: error.name === 'TimeoutError' ? '健康检查超时' : '无法连接服务'
    };
  }
}

function worstState(states) {
  if (states.includes('critical')) return 'critical';
  if (states.includes('warning')) return 'warning';
  return 'healthy';
}

async function buildStatus() {
  const [host, listingService] = await Promise.all([
    readHostSnapshot(cpuSampler.sample()),
    checkService('Listing Workstation', listingHealthUrl)
  ]);
  const monitorService = {
    name: 'Server Surveillance',
    state: 'healthy',
    latencyMs: 0,
    message: '监控接口正常'
  };
  const services = [listingService, monitorService];
  return {
    overallState: worstState([host.loadState, host.cpuState, host.memory.state, ...services.map((service) => service.state)]),
    generatedAt: new Date().toISOString(),
    host,
    services,
    monitorUptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    refreshAfterSeconds: 10
  };
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDirectory, safePath);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return false;
  const content = await readFile(filePath);
  response.writeHead(200, { ...commonHeaders(), 'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream', 'content-length': content.length });
  response.end(content);
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, service: 'server-surveillance' });
    }
    if (request.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(response, 200, await buildStatus());
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      try {
        if (await serveStatic(url.pathname, response)) return;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(`${request.method} ${url.pathname}: ${error.message}`);
    return sendJson(response, 500, { error: 'Unable to collect server status' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`server-surveillance listening on 0.0.0.0:${port}`));

function shutdown() {
  clearInterval(sampleTimer);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

