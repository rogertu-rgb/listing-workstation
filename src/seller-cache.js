import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { extractSellerOptions } from './growth.js';

export class SellerCache {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.sellers = [];
    this.updatedAt = '';
    this.refreshPromise = null;
    this.timer = null;
    this.lastError = '';
  }

  async load() {
    try {
      const payload = JSON.parse(await readFile(this.config.cacheFile, 'utf8'));
      this.sellers = Array.isArray(payload.sellers) ? payload.sellers : [];
      this.updatedAt = payload.updatedAt || '';
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`Seller cache load failed: ${error.message}`);
    }
  }

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const rows = await this.client.querySeller(this.config.refreshQueryValue);
        const sellers = extractSellerOptions(rows, this.config.fieldNames);
        if (!sellers.length) throw new Error('DataSuite returned no seller names for an empty request_param_1');
        const payload = { updatedAt: new Date().toISOString(), sellers };
        await mkdir(dirname(this.config.cacheFile), { recursive: true });
        const temporaryFile = `${this.config.cacheFile}.tmp`;
        await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
        await rename(temporaryFile, this.config.cacheFile);
        this.sellers = sellers;
        this.updatedAt = payload.updatedAt;
        this.lastError = '';
        return payload;
      } catch (error) {
        this.lastError = error.message;
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  start() {
    this.timer = setInterval(() => this.refresh().catch((error) => console.error(`Scheduled seller refresh failed: ${error.message}`)), this.config.refreshIntervalMs);
    this.timer.unref();
  }

  status() {
    return { sellers: this.sellers, updatedAt: this.updatedAt, lastError: this.lastError };
  }
}
