const toNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const toBoolean = (value) => value === true || value === 1 || ['true', '1', 'yes', 'y'].includes(String(value || '').toLowerCase());
const average = (values) => values.length ? values.reduce((sum, value) => sum + toNumber(value), 0) / values.length : 0;
const formatPercent = (value) => `${value >= 0 ? '+' : ''}${(toNumber(value) * 100).toFixed(1)}%`;

export function normalizeRow(raw = {}) {
  return {
    ...raw,
    ggp_account_name: raw.ggp_account_name || raw.GGP_name || raw.ggp_name || raw.seller || raw.seller_name || '',
    l1: raw.l1 || raw.L1 || '',
    l2: raw.l2 || raw.L2 || '',
    l3: raw.l3 || raw.L3 || '',
    l4: raw.l4 || raw.L4 || '',
    l5: raw.l5 || raw.L5 || '',
    price_band: raw.price_band || raw.Price_band || raw.priceBand || '',
    grass_region: raw.grass_region || raw.region || raw.site || '',
    region: raw.region || raw.grass_region || raw.site || '',
    market_tag: raw.market_tag || raw.market_type || raw.ocean_type || '',
    is_defending_tag: raw.is_defending_tag || raw.defending_tag || raw.is_advantage_zone || '',
    is_deepen_tag: raw.is_deepen_tag || raw.deepen_tag || raw.is_potential_zone || '',
    is_diversify_tag: raw.is_diversify_tag || raw.is_broaden_tag || raw.diversify_tag || '',
    item: raw.item || raw.title || raw.item_title || raw.product_title || raw.product_name || '',
    item_image: raw.item_image || raw.top_listing_image || raw.image_url || raw.image || '',
    item_link: raw.item_link || raw.product_url || raw.url || ''
  };
}

function strategyType(row) {
  if (toBoolean(row.is_defending_tag)) return '优势增长带';
  if (toBoolean(row.is_deepen_tag)) return '价格带补强机会';
  if (toBoolean(row.is_diversify_tag)) return '关联拓展机会';
  return '观察机会';
}

function normalizeListing(row, index) {
  return {
    item: row.item,
    item_link: row.item_link,
    item_image: row.item_image,
    l1: row.l1, l2: row.l2, l3: row.l3, l4: row.l4, l5: row.l5,
    L1: row.l1, L2: row.l2, L3: row.l3,
    shop_id: row.shop_id || row.shopId || '',
    region: row.region,
    dim_item_price_usd: toNumber(row.dim_item_price_usd),
    asp: toNumber(row.asp),
    price_band: row.price_band,
    ado: toNumber(row.ado), adg: toNumber(row.adg),
    ado_mom_mtd: toNumber(row.ado_mom_mtd), adg_mom_mtd: toNumber(row.adg_mom_mtd),
    ado_mom_m1: toNumber(row.ado_mom_m1), adg_mom_m1: toNumber(row.adg_mom_m1),
    ado_wow_wtd: toNumber(row.ado_wow_wtd), adg_wow_wtd: toNumber(row.adg_wow_wtd),
    ado_wow_w1: toNumber(row.ado_wow_w1), adg_wow_w1: toNumber(row.adg_wow_w1),
    item_create_date: row.item_create_date || '',
    is_official_shop: toBoolean(row.is_official_shop),
    is_brand: toBoolean(row.is_brand),
    ado_rnk: toNumber(row.ado_rnk) || index + 1
  };
}

function mockZoneSummary(zone) {
  const topItems = zone.top_listings.slice(0, 3).map((item) => item.item).join('、') || '当前返回商品';
  return {
    zone_summary: `${zone.region} / ${zone.l3} / ${zone.price_band} 属于“${zone.strategy_type}”，市场标签为${zone.market_type || '待观察'}。`,
    zone_feature_summary: `Top listing 集中在 ${topItems}，平均日均出单约 ${average(zone.top_listings.map((item) => item.ado)).toFixed(0)}，本月出单环比约 ${formatPercent(average(zone.top_listings.map((item) => item.ado_mom_mtd)))}。`,
    action_recommendation: zone.strategy_type === '优势增长带' ? '优先补强当前优势 zone，围绕 Top listing 的版型、价格带和主图表达扩充相邻款。' : zone.strategy_type === '价格带补强机会' ? '在已覆盖 L3 下测试相邻价格带，验证不同客单价的承接效率。' : '以小批量 SKU 切入关联 L3，根据 ADO 增长决定是否扩量。',
    risk_note: zone.market_type === '红海' ? '竞争较强，建议小批量测款并通过主图和价格差异化切入。' : '仍需持续观察周度增速和转化稳定性。'
  };
}

export function buildGrowthResult(sellerName, rawRows) {
  const groups = new Map();
  for (const raw of rawRows || []) {
    const row = normalizeRow(raw);
    if (!row.ggp_account_name) row.ggp_account_name = sellerName;
    if (!row.l1 || !row.l2 || !row.l3 || !row.price_band || !row.grass_region) continue;
    const key = [row.l1, row.l2, row.l3, row.price_band, row.grass_region].join('|');
    if (!groups.has(key)) groups.set(key, { row, listings: [] });
    if (row.item) groups.get(key).listings.push(row);
  }
  const order = { '优势增长带': 1, '价格带补强机会': 2, '关联拓展机会': 3, '观察机会': 4 };
  const zones = [...groups.entries()].map(([zoneKey, group]) => {
    const row = group.row;
    const type = strategyType(row);
    const zone = {
      zone_key: zoneKey,
      ggp_account_name: sellerName,
      GGP_name: sellerName,
      l1: row.l1, l2: row.l2, l3: row.l3,
      L1: row.l1, L2: row.l2, L3: row.l3,
      price_band: row.price_band, Price_band: row.price_band,
      grass_region: row.grass_region, region: row.region || row.grass_region,
      strategy_type: type,
      market_type: row.market_tag,
      seller_status_summary: [type, row.market_tag || '市场标签待观察', row.grass_region].filter(Boolean).join(' · '),
      api1_tags: {
        market_tag: row.market_tag,
        is_defending_tag: toBoolean(row.is_defending_tag),
        is_deepen_tag: toBoolean(row.is_deepen_tag),
        is_diversify_tag: toBoolean(row.is_diversify_tag)
      },
      top_listings: group.listings.map(normalizeListing).sort((a, b) => a.ado_rnk - b.ado_rnk).slice(0, 50)
    };
    zone.llm_summary = mockZoneSummary(zone);
    return zone;
  }).sort((a, b) => (order[a.strategy_type] || 99) - (order[b.strategy_type] || 99));

  const counts = Object.fromEntries(Object.keys(order).map((key) => [key, zones.filter((zone) => zone.strategy_type === key).length]));
  const priority = zones[0];
  return {
    seller_name: sellerName,
    ggp_account_name: sellerName,
    generated_at: new Date().toISOString(),
    seller_summary: {
      seller_overall_summary: `${sellerName} 建议采用“优势 zone 补强 + 潜力 zone 小批量试款”的组合策略。优势增长带 ${counts['优势增长带']} 个，价格带补强机会 ${counts['价格带补强机会']} 个，关联拓展机会 ${counts['关联拓展机会']} 个。`,
      seller_priority_direction: priority ? `优先推进 ${priority.region} / ${priority.l3} / ${priority.price_band}。` : '当前 API 未返回可用于生成推荐的 zone。',
      seller_strategy_overview: '先补强已验证 zone 的款式深度，再拓展相邻品类或价格带，并持续用 ADO、ADG 及环比指标复盘。'
    },
    zones,
    meta: {
      data_mode: 'direct_datasuite_api',
      source_rows: rawRows.length,
      zone_count: zones.length,
      api3_listing_rows: zones.reduce((sum, zone) => sum + zone.top_listings.length, 0),
      llm_mode: 'deterministic_summary',
      errors: []
    }
  };
}

export function extractSellerOptions(rows, fieldNames) {
  const seen = new Set();
  for (const raw of rows || []) {
    const normalized = normalizeRow(raw);
    const seller = fieldNames.map((field) => raw?.[field]).find((value) => String(value || '').trim()) || normalized.ggp_account_name;
    const name = String(seller || '').trim();
    if (name) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((name) => ({ ggp_account_name: name, GGP_name: name, short_name: name }));
}
