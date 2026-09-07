/**
 * GP-1 assertions — response validation and threshold checking.
 * Supports: status code, body contains/regex, latency cap, success rate.
 */

/**
 * Parse assertion CLI flags into a structured array.
 * @param {string[]} flags - e.g. ["--assert-status=200", "--assert-body=ok", "--assert-latency<500"]
 * @returns {object[]}
 */
export function parseAssertions(flags) {
  const out = [];
  for (const flag of flags) {
    const m = flag.match(/^--assert-(.+)$/);
    if (!m) continue;
    const spec = m[1];
    // status code: --assert-status=200 or --assert-status=2xx
    const statusMatch = spec.match(/^status\s*(=|<|>)\s*(\S+)$/);
    if (statusMatch) {
      out.push({ type: 'status', op: statusMatch[1], value: statusMatch[2] });
      continue;
    }
    // body contains: --assert-body=substring
    const bodyMatch = spec.match(/^body\s*(=|!~|~|contains)\s*(.+)$/);
    if (bodyMatch) {
      out.push({ type: 'body', op: bodyMatch[1] === '~' ? 'regex' : bodyMatch[1] === '!~' ? 'not_regex' : 'contains', value: bodyMatch[2] });
      continue;
    }
    // latency: --assert-latency<500 or --assert-latency=200
    const latMatch = spec.match(/^latency\s*([<>=]+)\s*(\d+(?:\.\d+)?)$/);
    if (latMatch) {
      out.push({ type: 'latency', op: latMatch[1], value: parseFloat(latMatch[2]) });
      continue;
    }
    throw new Error(`Unknown assertion spec: --assert-${spec}`);
  }
  return out;
}

/**
 * Parse threshold CLI flags into structured array.
 * @param {string[]} flags - e.g. ["--threshold p95<500", "--threshold success>99"]
 * @returns {object[]}
 */
export function parseThresholds(flags) {
  const out = [];
  for (const flag of flags) {
    const m = flag.match(/^--threshold\s+(.+)$/);
    if (!m) continue;
    const spec = m[1];
    // p95<500, p99<1000, rps>100, success>99, error<1
    const thMatch = spec.match(/^(p\d{1,2}|rps|success|error|latency|throughput|bandwidth|p50|p99|max|min|mean)\s*([<>=!]+)\s*([\d.]+)$/);
    if (!thMatch) throw new Error(`Invalid threshold: --threshold ${spec}. Use e.g. p95<500, success>99`);
    const metric = thMatch[1];
    const op = thMatch[2];
    const value = parseFloat(thMatch[3]);
    out.push({ metric, op, value, raw: spec });
  }
  return out;
}

/**
 * Check per-request assertions against a single sample.
 * @param {object} sample
 * @param {object[]} assertions
 * @returns {{ passed: boolean, failures: string[] }}
 */
export function checkSample(sample, assertions) {
  const failures = [];
  for (const a of assertions) {
    if (a.type === 'status') {
      const actual = sample.status;
      if (actual === null) { failures.push(`expected status ${a.op} ${a.value}, got null/error`); continue; }
      if (a.value.endsWith('xx') || a.value.endsWith('XX')) {
        const prefix = a.value.toLowerCase().slice(0, 1);
        const actualPrefix = String(actual).slice(0, 1);
        if (actualPrefix !== prefix) failures.push(`expected status ${a.value}, got ${actual}`);
      } else if (a.op === '=') { if (actual !== Number(a.value)) failures.push(`expected status ${a.value}, got ${actual}`); }
      else if (a.op === '<') { if (actual >= Number(a.value)) failures.push(`expected status < ${a.value}, got ${actual}`); }
      else if (a.op === '>') { if (actual <= Number(a.value)) failures.push(`expected status > ${a.value}, got ${actual}`); }
    } else if (a.type === 'latency') {
      const actual = sample.latencyMs;
      const target = a.value;
      if (a.op === '<' && actual >= target) failures.push(`expected latency < ${target}ms, got ${actual.toFixed(1)}ms`);
      else if (a.op === '<=' && actual > target) failures.push(`expected latency <= ${target}ms, got ${actual.toFixed(1)}ms`);
      else if (a.op === '>' && actual <= target) failures.push(`expected latency > ${target}ms, got ${actual.toFixed(1)}ms`);
      else if (a.op === '=' && Math.abs(actual - target) > 0.5) failures.push(`expected latency ~${target}ms, got ${actual.toFixed(1)}ms`);
    }
  }
  return { passed: failures.length === 0, failures };
}

/**
 * Check threshold assertions against a summary report.
 * @param {object} report - from summarize()
 * @param {object[]} thresholds
 * @returns {{ passed: boolean, results: object[] }}
 */
export function checkThresholds(report, thresholds) {
  const results = [];
  for (const t of thresholds) {
    const actual = extractMetric(report, t.metric);
    let passed = false;
    if (actual === null || actual === undefined) {
      results.push({ ...t, actual: null, passed: false, message: `metric '${t.metric}' not found` });
      continue;
    }
    switch (t.op) {
      case '<': passed = actual < t.value; break;
      case '<=': passed = actual <= t.value; break;
      case '>': passed = actual > t.value; break;
      case '>=': passed = actual >= t.value; break;
      case '=': passed = Math.abs(actual - t.value) < 0.01; break;
      case '!=': passed = Math.abs(actual - t.value) >= 0.01; break;
      default: passed = false;
    }
    results.push({
      metric: t.metric,
      op: t.op,
      threshold: t.value,
      actual,
      passed,
      message: passed ? `OK: ${t.metric}=${fmtNum(actual)} ${t.op} ${t.value}` : `FAIL: ${t.metric}=${fmtNum(actual)} ${t.op} ${t.value}`
    });
  }
  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}

function extractMetric(report, metric) {
  const t = report.totals ?? {};
  const l = report.latencyMs ?? {};
  switch (metric) {
    case 'p50': return l.p50;
    case 'p95': return l.p95;
    case 'p99': return l.p99;
    case 'max': return l.max;
    case 'min': return l.min;
    case 'mean': return l.mean;
    case 'rps': case 'throughput': return t.requestsPerSecond;
    case 'success': return t.successRate != null ? t.successRate * 100 : null;
    case 'error': return t.successRate != null ? (1 - t.successRate) * 100 : null;
    case 'bandwidth': return t.mebibytesPerSecond;
    case 'latency': return l.p95; // default to p95
    default: return null;
  }
}

function fmtNum(v) {
  if (v === null || v === undefined) return 'n/a';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
