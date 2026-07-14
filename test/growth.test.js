import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrowthResult, extractSellerOptions } from '../src/growth.js';

const rows = [
  { ggp_account_name: 'Seller A', l1: 'Fashion', l2: 'Women', l3: 'Dresses', price_band: '10-20', region: 'SG', is_defending_tag: 1, item: 'Dress 1', ado: 12, ado_rnk: 1 },
  { ggp_account_name: 'Seller A', l1: 'Fashion', l2: 'Women', l3: 'Dresses', price_band: '10-20', region: 'SG', is_defending_tag: 1, item: 'Dress 2', ado: 8, ado_rnk: 2 },
  { GGP_name: 'Seller B', l1: 'Home', l2: 'Decor', l3: 'Lighting', Price_band: '20-30', grass_region: 'MY', item: 'Lamp' }
];

test('extractSellerOptions returns unique sorted sellers', () => {
  assert.deepEqual(extractSellerOptions(rows, ['ggp_account_name', 'GGP_name']), [
    { ggp_account_name: 'Seller A', GGP_name: 'Seller A', short_name: 'Seller A' },
    { ggp_account_name: 'Seller B', GGP_name: 'Seller B', short_name: 'Seller B' }
  ]);
});

test('buildGrowthResult groups listings by zone', () => {
  const result = buildGrowthResult('Seller A', rows.slice(0, 2));
  assert.equal(result.meta.data_mode, 'direct_datasuite_api');
  assert.equal(result.zones.length, 1);
  assert.equal(result.zones[0].strategy_type, '优势增长带');
  assert.equal(result.zones[0].top_listings.length, 2);
});
