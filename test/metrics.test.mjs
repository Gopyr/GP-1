import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize } from '../src/metrics.mjs';

test('percentile interpolates sorted samples', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 48);
  assert.equal(percentile([], 95), null);
});

test('summarize reports totals, rates, latency, status codes, and errors', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 10, error: null },
    { ok: true, status: 204, latencyMs: 20, error: null },
    { ok: false, status: 503, latencyMs: 40, error: null },
    { ok: false, status: null, latencyMs: 50, error: 'TimeoutError' }
  ], 1000, { concurrency: 2 });
  assert.equal(report.totals.requests, 4);
  assert.equal(report.totals.successful, 2);
  assert.equal(report.totals.failed, 2);
  assert.equal(report.statusCodes['200'], 1);
  assert.equal(report.errors.TimeoutError, 1);
  assert.equal(report.latencyMs.p95, 48.5);
});
