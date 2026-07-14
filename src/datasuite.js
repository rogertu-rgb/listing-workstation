const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function errorPreview(text) {
  return String(text || '').replace(/(client_secret|access_token|authorization)[=:]\s*[^&\s,}]+/gi, '$1=<redacted>').slice(0, 500);
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status} ${errorPreview(text)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON: ${errorPreview(text)}`);
  }
}

function extractJobId(payload) {
  return payload?.jobId || payload?.job_id || payload?.data?.jobId || payload?.data?.job_id || '';
}

export function flattenRows(rows) {
  return (rows || []).map((row) => row?.values || row).filter(Boolean);
}

export class DataSuiteClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.token = '';
    this.tokenExpiresAt = 0;
  }

  async getAccessToken(forceRefresh = false) {
    if (!forceRefresh && this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const body = new URLSearchParams({
      client_id: this.config.appKey,
      client_secret: this.config.appSecret,
      grant_type: 'client_credentials',
      scope: this.config.scope.join(' ')
    });
    const response = await this.fetch(`${this.config.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const payload = await parseJsonResponse(response, 'DataSuite token request');
    if (!payload.access_token) throw new Error('DataSuite token response is missing access_token');
    this.token = payload.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 120) * 1000;
    return this.token;
  }

  async querySeller(sellerName) {
    const token = await this.getAccessToken();
    const olapPayload = {
      expressions: [{ parameterName: 'request_param_1', value: String(sellerName || '') }]
    };
    if (this.config.prestoQueue) olapPayload.prestoQueueName = this.config.prestoQueue;
    const response = await this.fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'dataservice-enable-cache': 'true',
        'x-system-name': this.config.systemName,
        'x-end-user': this.config.endUser
      },
      body: JSON.stringify({ olapPayload })
    });
    const payload = await parseJsonResponse(response, 'DataSuite query submit');
    const jobId = extractJobId(payload);
    if (!jobId) return flattenRows(payload.rows || payload.items || payload.data || payload.result || []);
    return this.fetchJobRows(jobId, token);
  }

  async fetchJobRows(jobId, token) {
    const startedAt = Date.now();
    let metadata;
    while (Date.now() - startedAt < this.config.timeoutMs) {
      const response = await this.fetch(`${this.config.baseUrl}/dataservice/result/${encodeURIComponent(jobId)}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      metadata = await parseJsonResponse(response, 'DataSuite job status');
      if (metadata.status === 'FAILED' || metadata.contentType === 'ERROR_MESSAGE') {
        throw new Error(`DataSuite job failed: ${errorPreview(metadata.message || JSON.stringify(metadata))}`);
      }
      if (metadata.status === 'FINISH') break;
      await sleep(this.config.pollIntervalMs);
    }
    if (!metadata || metadata.status !== 'FINISH') throw new Error(`DataSuite job timed out after ${this.config.timeoutMs}ms`);
    if (metadata.contentType === 'QUERY_DATA' && Array.isArray(metadata.rows)) return flattenRows(metadata.rows);

    const maxShard = Math.max(0, Number(metadata.maxShard || 0));
    const shardRequests = Array.from({ length: maxShard + 1 }, async (_, shard) => {
      const response = await this.fetch(`${this.config.baseUrl}/dataservice/result/${encodeURIComponent(jobId)}/${shard}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = await parseJsonResponse(response, `DataSuite result shard ${shard}`);
      if (payload.contentType === 'ERROR_MESSAGE') throw new Error(`DataSuite result shard ${shard} failed: ${errorPreview(payload.message)}`);
      return flattenRows(payload.rows || []);
    });
    return (await Promise.all(shardRequests)).flat();
  }
}
