import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, dataSuiteConfigured } from './config.js';
import { DataSuiteClient } from './datasuite.js';
import { buildGrowthResult } from './growth.js';
import { enrichGrowthResult } from './llm.js';
import { SellerCache } from './seller-cache.js';

const config = loadConfig();
const client = new DataSuiteClient(config.dataSuite);
const sellerCache = new SellerCache(client, config.sellers);
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }); }
}

function requireAdmin(request) {
  if (!config.adminToken) throw Object.assign(new Error('ADMIN_TOKEN is not configured'), { statusCode: 503 });
  if (request.headers.authorization !== `Bearer ${config.adminToken}`) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDirectory, safePath);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return false;
  const content = await readFile(filePath);
  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream', 'content-length': content.length });
  response.end(content);
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, service: 'seller-growth-api', dataSuiteConfigured: dataSuiteConfigured(config), sellerCache: sellerCache.status() });
    }
    if (request.method === 'GET' && url.pathname === '/api/initial-data') {
      const cache = sellerCache.status();
      return sendJson(response, 200, {
        sellers: cache.sellers,
        updateTime: cache.updatedAt,
        integration: { data_api_mode: 'direct_datasuite_api', datasuite_credentials_configured: dataSuiteConfigured(config), seller_cache_error: cache.lastError }
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/growth-recommendation') {
      if (!dataSuiteConfigured(config)) throw Object.assign(new Error('DataSuite credentials are not fully configured'), { statusCode: 503 });
      const body = await readJson(request);
      const sellerName = String(body.sellerName || '').trim();
      if (!sellerName || sellerName.length > 300) throw Object.assign(new Error('sellerName is required and must be at most 300 characters'), { statusCode: 400 });
      const rows = await client.querySeller(sellerName);
      const result = await enrichGrowthResult(buildGrowthResult(sellerName, rows), config.llm);
      return sendJson(response, 200, result);
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/refresh-sellers') {
      requireAdmin(request);
      return sendJson(response, 200, await sellerCache.refresh());
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      try { if (await serveStatic(url.pathname, response)) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error(`${request.method} ${url.pathname}: ${error.message}`);
    sendJson(response, status, { error: status >= 500 ? 'Service request failed' : error.message, detail: process.env.NODE_ENV === 'production' ? undefined : error.message });
  }
});

await sellerCache.load();
if (dataSuiteConfigured(config)) sellerCache.refresh().catch((error) => console.error(`Initial seller refresh failed: ${error.message}`));
sellerCache.start();
server.listen(config.port, '0.0.0.0', () => console.log(`seller-growth-api listening on 0.0.0.0:${config.port}`));

function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
