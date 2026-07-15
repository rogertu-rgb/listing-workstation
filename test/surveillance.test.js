import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, memoryState, parseLoadAverage, parseMemoryInfo, parseUptime } from '../surveillance/metrics.js';
import { listenerMatches, parseProcNetListeners } from '../surveillance/local-services.js';

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

test('server surveillance parses host TCP listeners and maps registered projects', () => {
  const procNet = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 00000000:0050 00000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 1',
    '   1: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 2',
    '   2: 0100007F:2382 00000000:0000 01 00000000:00000000 00:00000000 00000000 0 0 3'
  ].join('\n');
  const listeners = parseProcNetListeners(procNet);
  assert.deepEqual(listeners, [
    { address: '0.0.0.0', port: 80, family: 'ipv4' },
    { address: '127.0.0.1', port: 8080, family: 'ipv4' }
  ]);
  assert.equal(listenerMatches({ bindAddress: '0.0.0.0', port: 80 }, listeners[0]), true);
  assert.equal(listenerMatches({ bindAddress: '127.0.0.1', port: 8080 }, listeners[1]), true);
  assert.equal(listenerMatches({ bindAddress: '127.0.0.1', port: 8090 }, listeners[1]), false);
});
