function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig() {
  const baseUrl = String(process.env.DATASUITE_BASE_URL || 'https://open-api.datasuite.shopee.io').replace(/\/+$/, '');
  return {
    port: numberFromEnv('PORT', 8080),
    dataSuite: {
      baseUrl,
      apiUrl: process.env.DATASUITE_API_URL || `${baseUrl}/dataservice/cncbbi_general.stat_ggp_item_traffic_ads_nd_all_site_top50_for_m1/683ese12hqr0tngq`,
      appKey: process.env.DATASUITE_APP_KEY || '',
      appSecret: process.env.DATASUITE_APP_SECRET || '',
      scope: (process.env.DATASUITE_SCOPE || 'cncbbi_general.stat_ggp_item_traffic_ads_nd_all_site_top50_for_m1').split(',').map((value) => value.trim()).filter(Boolean),
      systemName: process.env.DATASUITE_SYSTEM_NAME || 'seller-growth-api',
      endUser: process.env.DATASUITE_END_USER || '',
      prestoQueue: process.env.DATASUITE_PRESTO_QUEUE || '',
      pollIntervalMs: numberFromEnv('DATASUITE_POLL_INTERVAL_MS', 2000),
      timeoutMs: numberFromEnv('DATASUITE_TIMEOUT_MS', 600000)
    },
    sellers: {
      refreshIntervalMs: numberFromEnv('SELLER_REFRESH_INTERVAL_MS', 86_400_000),
      refreshQueryValue: process.env.SELLER_REFRESH_QUERY_VALUE || '',
      fieldNames: (process.env.SELLER_FIELD_NAMES || 'ggp_account_name,GGP_name,ggp_name,seller_name,seller').split(',').map((value) => value.trim()).filter(Boolean),
      cacheFile: process.env.SELLER_CACHE_FILE || '/app/data/sellers.json'
    },
    llm: {
      apiKey: process.env.LLM_API_KEY || '',
      apiUrl: process.env.LLM_API_BASE_URL || 'https://api.deepseek.com/chat/completions',
      model: process.env.LLM_MODEL || 'deepseek-v4-pro',
      zoneSummaryLimit: numberFromEnv('LLM_ZONE_SUMMARY_LIMIT', 6)
    },
    adminToken: process.env.ADMIN_TOKEN || ''
  };
}

export function dataSuiteConfigured(config) {
  return Boolean(config.dataSuite.appKey && config.dataSuite.appSecret && config.dataSuite.endUser);
}
