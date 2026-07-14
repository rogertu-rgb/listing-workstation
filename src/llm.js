const zonePrompt = `你是一名跨境电商商品策略分析师。请根据一个卖家 zone 的分类、区域、价格带、标签和 Top Listing，输出简洁、保守、可执行的中文分析。不得编造输入中没有的事实或指标。只输出严格 JSON：{"zone_summary":"","zone_feature_summary":"","action_recommendation":"","risk_note":""}`;

const sellerPrompt = `你是一名跨境电商商品策略总结分析师。请仅依据各 zone 已生成的分析，总结卖家的总体增长机会、优先方向和执行策略。不得引入新的事实、指标或类目。只输出严格 JSON：{"seller_overall_summary":"","seller_priority_direction":"","seller_strategy_overview":""}`;

function compactZone(zone) {
  return {
    zone: {
      l1: zone.l1,
      l2: zone.l2,
      l3: zone.l3,
      price_band: zone.price_band,
      region: zone.region,
      strategy_type: zone.strategy_type,
      market_type: zone.market_type,
      api1_tags: zone.api1_tags
    },
    top_listings: zone.top_listings.slice(0, 20).map((item) => ({
      title: item.item,
      price: item.asp || item.dim_item_price_usd,
      ado: item.ado,
      adg: item.adg,
      ado_mom_mtd: item.ado_mom_mtd,
      ado_wow_wtd: item.ado_wow_wtd,
      is_official_shop: item.is_official_shop,
      is_brand: item.is_brand,
      ado_rnk: item.ado_rnk
    }))
  };
}

function normalizeOutput(output, type) {
  if (type === 'zone') return {
    zone_summary: String(output?.zone_summary || ''),
    zone_feature_summary: String(output?.zone_feature_summary || ''),
    action_recommendation: String(output?.action_recommendation || ''),
    risk_note: String(output?.risk_note || '')
  };
  return {
    seller_overall_summary: String(output?.seller_overall_summary || ''),
    seller_priority_direction: String(output?.seller_priority_direction || ''),
    seller_strategy_overview: String(output?.seller_strategy_overview || '')
  };
}

async function callLlm(config, prompt, input, maxTokens) {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(input) }],
      temperature: 0.3,
      stream: false,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LLM request failed: HTTP ${response.status}`);
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('LLM response is not valid JSON'); }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM response is missing message content');
  try { return JSON.parse(content); } catch { throw new Error('LLM message content is not valid JSON'); }
}

export async function enrichGrowthResult(result, config) {
  if (!config.apiKey) return result;
  const errors = [];
  for (let index = 0; index < Math.min(result.zones.length, config.zoneSummaryLimit); index += 1) {
    try {
      result.zones[index].llm_summary = normalizeOutput(await callLlm(config, zonePrompt, {
        seller_name: result.seller_name,
        ...compactZone(result.zones[index])
      }, 1200), 'zone');
    } catch (error) {
      errors.push(`zone ${index + 1}: ${error.message}`);
    }
  }
  try {
    result.seller_summary = normalizeOutput(await callLlm(config, sellerPrompt, {
      seller_name: result.seller_name,
      zone_llm_results: result.zones.map((zone) => ({ zone: `${zone.region} / ${zone.l3} / ${zone.price_band}`, ...zone.llm_summary }))
    }, 2200), 'seller');
  } catch (error) {
    errors.push(`seller: ${error.message}`);
  }
  result.meta.llm_mode = errors.length ? 'llm_with_deterministic_fallback' : 'llm_live';
  result.meta.llm_errors = errors;
  return result;
}
