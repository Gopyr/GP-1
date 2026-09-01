/**
 * GP-1 compare — diff two JSON reports (schemaVersion 2).
 * Pure logic: no I/O side effects except via caller.
 */

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function deltaFields(a, b, keys) {
  const out = {};
  for (const k of keys) {
    const av = num(a?.[k]);
    const bv = num(b?.[k]);
    if (av === null && bv === null) continue;
    const aSafe = av ?? 0;
    const bSafe = bv ?? 0;
    const d = bSafe - aSafe;
    const pct = aSafe !== 0 ? (d / Math.abs(aSafe)) * 100 : (bSafe !== 0 ? Infinity : 0);
    out[k] = { baseline: av, candidate: bv, delta: d, deltaPercent: Number.isFinite(pct) ? pct : null };
  }
  return out;
}

function dictDiff(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const k of keys) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    if (av !== bv) out[k] = { baseline: av, candidate: bv, delta: bv - av };
  }
  return out;
}

export function compareReports(baseline, candidate) {
  if (!baseline || !candidate) throw new Error('Both reports are required');
  const totalKeys = ['requests', 'successful', 'failed', 'successRate', 'requestsPerSecond', 'bytesReceived', 'bytesPerSecond', 'mebibytesPerSecond'];
  const latencyKeys = ['min', 'mean', 'p50', 'p95', 'p99', 'max'];

  const totals = deltaFields(baseline.totals, candidate.totals, totalKeys);
  const latency = deltaFields(baseline.latencyMs, candidate.latencyMs, latencyKeys);
  const elapsed = deltaFields({ elapsedMs: baseline.elapsedMs }, { elapsedMs: candidate.elapsedMs }, ['elapsedMs']);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    baseline: { file: baseline._file ?? null, generatedAt: baseline.generatedAt ?? null, config: baseline.config ?? null, totals: baseline.totals ?? null, latencyMs: baseline.latencyMs ?? null },
    candidate: { file: candidate._file ?? null, generatedAt: candidate.generatedAt ?? null, config: candidate.config ?? null, totals: candidate.totals ?? null, latencyMs: candidate.latencyMs ?? null },
    delta: {
      totals,
      latencyMs: latency,
      elapsedMs: elapsed.elapsedMs ?? null,
      statusCodes: dictDiff(baseline.statusCodes, candidate.statusCodes),
      errors: dictDiff(baseline.errors, candidate.errors)
    },
    summary: buildSummary(totals, latency)
  };
}

function buildSummary(totals, latency) {
  const lines = [];
  const rps = totals.requestsPerSecond;
  if (rps) lines.push(`Throughput: ${fmt(rps.delta)} req/s (${fmtPct(rps.deltaPercent)})`);
  const p95 = latency.p95;
  if (p95) lines.push(`p95 latency: ${fmt(p95.delta)} ms (${fmtPct(p95.deltaPercent)})`);
  const sr = totals.successRate;
  if (sr) lines.push(`Success rate: ${fmt(sr.delta * 100, 2)} pp (${fmtPct(sr.deltaPercent)})`);
  const mib = totals.mebibytesPerSecond;
  if (mib) lines.push(`Bandwidth: ${fmt(mib.delta)} MiB/s (${fmtPct(mib.deltaPercent)})`);
  return lines;
}

function fmt(v, frac = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const s = v >= 0 ? `+${v.toFixed(frac)}` : v.toFixed(frac);
  return s;
}
function fmtPct(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const s = v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;
  return s;
}

export function formatComparisonText(cmp) {
  const out = [];
  out.push('GP-1 compare');
  out.push(`  baseline : ${cmp.baseline.file ?? '(inline)'} @ ${cmp.baseline.generatedAt ?? 'unknown'}`);
  out.push(`  candidate: ${cmp.candidate.file ?? '(inline)'} @ ${cmp.candidate.generatedAt ?? 'unknown'}`);
  out.push('');
  out.push('Totals:');
  for (const [k, v] of Object.entries(cmp.delta.totals)) {
    out.push(`  ${k.padEnd(20)} ${str(v.baseline).padStart(12)} -> ${str(v.candidate).padStart(12)}  delta ${fmt(v.delta).padStart(10)} (${fmtPct(v.deltaPercent).padStart(8)})`);
  }
  out.push('');
  out.push('Latency (ms):');
  for (const [k, v] of Object.entries(cmp.delta.latencyMs)) {
    out.push(`  ${k.padEnd(20)} ${str(v.baseline).padStart(12)} -> ${str(v.candidate).padStart(12)}  delta ${fmt(v.delta).padStart(10)} (${fmtPct(v.deltaPercent).padStart(8)})`);
  }
  if (cmp.delta.elapsedMs) {
    const v = cmp.delta.elapsedMs;
    out.push('');
    out.push(`Elapsed: ${str(v.baseline)} -> ${str(v.candidate)}  delta ${fmt(v.delta)} ms (${fmtPct(v.deltaPercent)})`);
  }
  const sc = cmp.delta.statusCodes;
  if (Object.keys(sc).length) {
    out.push('');
    out.push('Status code deltas:');
    for (const [k, v] of Object.entries(sc)) out.push(`  ${k}: ${v.baseline} -> ${v.candidate} (delta ${v.delta >= 0 ? '+' : ''}${v.delta})`);
  }
  const er = cmp.delta.errors;
  if (Object.keys(er).length) {
    out.push('');
    out.push('Error deltas:');
    for (const [k, v] of Object.entries(er)) out.push(`  ${k}: ${v.baseline} -> ${v.candidate} (delta ${v.delta >= 0 ? '+' : ''}${v.delta})`);
  }
  if (cmp.summary.length) {
    out.push('');
    out.push('Summary:');
    for (const s of cmp.summary) out.push(`  - ${s}`);
  }
  return out.join('\n');
}

function str(v) {
  if (v === null || v === undefined) return 'n/a';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}
