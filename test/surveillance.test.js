import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, memoryState, parseLoadAverage, parseMemoryInfo, parseUptime } from '../surveillance/metrics.js';

test('server surveillance parses Linux proc metrics', () => {
  assert.deepEqual(parseLoadAverage('1.25 0.80 0.40 1/100 42\n'), { one: 1.25, five: 0.8, fifteen: 0.4 });
  assert.equal(parseUptime('86461.42 100.00\n'), 86461);
  assert.deepEqual(parseMemoryInfo('MemTotal:       1000000 kB\nMemAvailable:    250000 kB\n'), {
    totalBytes: 1024000000,
    availableBytes: 256000000,
    usedBytes: 768000000,
    usedPercent: 75
  });
});

test('server surveillance applies health thresholds', () => {
  assert.deepEqual(loadState(2, 4), { normalizedPercent: 50, state: 'healthy' });
  assert.equal(loadState(3, 4).state, 'warning');
  assert.equal(loadState(4, 4).state, 'critical');
  assert.equal(memoryState(79.9), 'healthy');
  assert.equal(memoryState(80), 'warning');
  assert.equal(memoryState(90), 'critical');
});

