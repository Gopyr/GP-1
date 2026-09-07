import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, formatSummaryLine } from '../src/metrics.mjs';
import { histogram, renderHistogram } from '../src/histogram.mjs';
import { parseRamp, parseDuration, totalRampDuration, concurrencyAt } from '../src/ramp.mjs';
import { parseAssertions, parseThresholds, checkSample, checkThresholds } from '../src/assertions.mjs';

// --- metrics.mjs ---

test('percentile interpolates sorted samples', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 48);
  assert.equal(percentile([], 95), null);
});

test('summarize reports totals, rates, latency, status codes, and errors', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 10, bytesReceived: 1024, error: null },
    { ok: true, status: 204, latencyMs: 20, bytesReceived: 2048, error: null },
    { ok: false, status: 503, latencyMs: 40, bytesReceived: 512, error: null },
    { ok: false, status: null, latencyMs: 50, bytesReceived: 0, error: 'TimeoutError' }
  ], 1000, { concurrency: 2 });
  assert.equal(report.totals.requests, 4);
  assert.equal(report.totals.successful, 2);
  assert.equal(report.totals.failed, 2);
  assert.equal(report.totals.bytesReceived, 3584);
  assert.equal(report.totals.bytesPerSecond, 3584);
  assert.equal(report.totals.mebibytesPerSecond, 3584 / (1024 * 1024));
  assert.equal(report.statusCodes['200'], 1);
  assert.equal(report.errors.TimeoutError, 1);
  assert.equal(report.latencyMs.p95, 48.5);
  assert.equal(report.schemaVersion, 3);
});

test('summarize includes stddev, errorRate, and extended percentiles', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 100, bytesReceived: 100, error: null },
    { ok: true, status: 200, latencyMs: 200, bytesReceived: 100, error: null },
    { ok: false, status: 500, latencyMs: 300, bytesReceived: 0, error: 'Error' },
  ], 1000);
  assert.equal(typeof report.totals.errorRate, 'number');
  assert.ok(report.totals.errorRate > 0);
  assert.equal(typeof report.latencyMs.stddev, 'number');
  assert.ok(report.latencyMs.stddev > 0);
  assert.equal(typeof report.latencyMs.p5, 'number');
  assert.equal(typeof report.latencyMs.p10, 'number');
  assert.equal(typeof report.latencyMs.p75, 'number');
  assert.equal(typeof report.latencyMs.p90, 'number');
});

test('summarize includes latencyBuckets', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 5, bytesReceived: 0, error: null },
    { ok: true, status: 200, latencyMs: 75, bytesReceived: 0, error: null },
    { ok: true, status: 200, latencyMs: 250, bytesReceived: 0, error: null },
    { ok: true, status: 200, latencyMs: 600, bytesReceived: 0, error: null },
    { ok: true, status: 200, latencyMs: 3000, bytesReceived: 0, error: null },
  ], 5000);
  assert.equal(report.latencyBuckets['0-50'], 1);
  assert.equal(report.latencyBuckets['50-100'], 1);
  assert.equal(report.latencyBuckets['200-500'], 1);
  assert.equal(report.latencyBuckets['500-1000'], 1);
  assert.equal(report.latencyBuckets['1000-5000'], 1);
});

test('summarize includes connectionStats', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 50, bytesReceived: 100, error: null },
    { ok: false, status: null, latencyMs: 100, bytesReceived: 0, error: 'Error' },
  ], 1000);
  assert.equal(report.connectionStats.totalConnections, 1);
  assert.equal(report.connectionStats.failedConnections, 1);
});

test('formatSummaryLine produces compact string', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 10, bytesReceived: 1024, error: null },
  ], 1000, { mode: 0, profile: 'safe-observation' });
  const line = formatSummaryLine(report);
  assert.ok(line.includes('GP-1'));
  assert.ok(line.includes('safe-observation'));
  assert.ok(line.includes('req'));
});

// --- histogram.mjs ---

test('histogram produces buckets from samples', () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({
    latencyMs: Math.random() * 1000,
    ok: true, status: 200, bytesReceived: 100, error: null
  }));
  const hist = histogram(samples);
  assert.ok(hist.buckets.length > 0);
  assert.ok(hist.maxCount > 0);
  assert.ok(hist.count === 100);
  assert.ok(typeof hist.percentiles.p50 === 'number');
});

test('histogram handles empty samples', () => {
  const hist = histogram([]);
  assert.equal(hist.buckets.length, 0);
  assert.equal(hist.maxCount, 0);
});

test('renderHistogram produces ASCII chart', () => {
  const hist = histogram(Array.from({ length: 50 }, () => ({ latencyMs: Math.random() * 500 })));
  const chart = renderHistogram(hist);
  assert.ok(chart.includes('█'));
  assert.ok(chart.includes('ms'));
});

// --- ramp.mjs ---

test('parseRamp parses valid ramp spec', () => {
  const stages = parseRamp('5:10s,20:30s,5:10s');
  assert.equal(stages.length, 3);
  assert.equal(stages[0].concurrency, 5);
  assert.equal(stages[0].durationMs, 10000);
  assert.equal(stages[1].concurrency, 20);
  assert.equal(stages[1].durationMs, 30000);
  assert.equal(stages[2].concurrency, 5);
  assert.equal(stages[2].durationMs, 10000);
});

test('parseRamp rejects invalid specs', () => {
  assert.throws(() => parseRamp('invalid'));
  assert.throws(() => parseRamp('0:10s'));
  assert.throws(() => parseRamp('5:50ms'));
});

test('parseRamp handles empty input', () => {
  assert.deepEqual(parseRamp(''), []);
  assert.deepEqual(parseRamp(null), []);
});

test('parseDuration handles ms, s, m, h', () => {
  assert.equal(parseDuration('100ms'), 100);
  assert.equal(parseDuration('5s'), 5000);
  assert.equal(parseDuration('1.5m'), 90000);
  assert.equal(parseDuration('1h'), 3600000);
  assert.equal(parseDuration('10'), 10000); // bare number = seconds
});

test('totalRampDuration sums stages', () => {
  const stages = parseRamp('5:10s,20:30s');
  assert.equal(totalRampDuration(stages), 40000);
});

test('concurrencyAt returns correct stage', () => {
  const stages = parseRamp('5:10s,20:30s,5:10s');
  assert.equal(concurrencyAt(stages, 0).concurrency, 5);
  assert.equal(concurrencyAt(stages, 5000).concurrency, 5);
  assert.equal(concurrencyAt(stages, 15000).concurrency, 20);
  assert.equal(concurrencyAt(stages, 39000).concurrency, 20); // just before stage 3
  assert.equal(concurrencyAt(stages, 40000).concurrency, 5); // stage 3 starts at 40s
  assert.equal(concurrencyAt(stages, 45000).concurrency, 5);
  assert.equal(concurrencyAt(stages, 60000).concurrency, 5); // past end = last stage
});

// --- assertions.mjs ---

test('parseAssertions parses status assertions', () => {
  const a = parseAssertions(['--assert-status=200']);
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'status');
  assert.equal(a[0].op, '=');
  assert.equal(a[0].value, '200');
});

test('parseAssertions parses latency assertions', () => {
  const a = parseAssertions(['--assert-latency<500']);
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'latency');
  assert.equal(a[0].op, '<');
  assert.equal(a[0].value, 500);
});

test('parseAssertions parses body assertions', () => {
  const a = parseAssertions(['--assert-body=ok']);
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'body');
  assert.equal(a[0].op, 'contains');
  assert.equal(a[0].value, 'ok');
});

test('parseThresholds parses threshold expressions', () => {
  const t = parseThresholds(['--threshold p95<500', '--threshold success>99']);
  assert.equal(t.length, 2);
  assert.equal(t[0].metric, 'p95');
  assert.equal(t[0].op, '<');
  assert.equal(t[0].value, 500);
  assert.equal(t[1].metric, 'success');
  assert.equal(t[1].op, '>');
  assert.equal(t[1].value, 99);
});

test('checkSample validates status codes', () => {
  const sample = { ok: true, status: 200, latencyMs: 50, bytesReceived: 100, error: null };
  const r1 = checkSample(sample, [{ type: 'status', op: '=', value: '200' }]);
  assert.ok(r1.passed);
  const r2 = checkSample(sample, [{ type: 'status', op: '=', value: '404' }]);
  assert.ok(!r2.passed);
  assert.ok(r2.failures[0].includes('200'));
});

test('checkSample validates latency', () => {
  const sample = { ok: true, status: 200, latencyMs: 150, bytesReceived: 100, error: null };
  const r1 = checkSample(sample, [{ type: 'latency', op: '<', value: 200 }]);
  assert.ok(r1.passed);
  const r2 = checkSample(sample, [{ type: 'latency', op: '<', value: 100 }]);
  assert.ok(!r2.passed);
});

test('checkThresholds validates against report', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 10, bytesReceived: 100, error: null },
    { ok: true, status: 200, latencyMs: 20, bytesReceived: 100, error: null },
  ], 1000);
  const r1 = checkThresholds(report, [{ metric: 'p95', op: '<', value: 100, raw: 'p95<100' }]);
  assert.ok(r1.passed);
  const r2 = checkThresholds(report, [{ metric: 'p95', op: '>', value: 100, raw: 'p95>100' }]);
  assert.ok(!r2.passed);
});

test('checkThresholds validates success rate', () => {
  const report = summarize([
    { ok: true, status: 200, latencyMs: 10, bytesReceived: 100, error: null },
    { ok: true, status: 200, latencyMs: 20, bytesReceived: 100, error: null },
  ], 1000);
  const r = checkThresholds(report, [{ metric: 'success', op: '>', value: 99, raw: 'success>99' }]);
  assert.ok(r.passed); // 100% success
});
