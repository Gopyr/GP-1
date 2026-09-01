/**
 * GP-1 HTML report generator. Zero dependencies, standalone HTML.
 * Input: report from src/metrics.mjs summarize() (schemaVersion 2).
 * Output: string of HTML.
 */

function esc(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  return Number.isInteger(v) && digits === 0 ? String(v) : v.toFixed(digits);
}

function barWidth(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(2, (value / max) * 100));
}

export function generateHtml(report) {
  const cfg = report.config ?? {};
  const t = report.totals ?? {};
  const l = report.latencyMs ?? {};
  const sc = report.statusCodes ?? {};
  const er = report.errors ?? {};
  const elapsed = report.elapsedMs ?? 0;
  const title = `GP-1 Report. ${esc(cfg.url ?? 'unknown target')}. ${esc(report.generatedAt ?? '')}`;
  const latencyMax = Math.max(l.p99 ?? 0, l.p95 ?? 0, l.max ?? 0, 1);

  const statusRows = Object.entries(sc).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([code, count]) => `<tr><td>${esc(code)}</td><td class="num">${esc(count)}</td><td class="bar-cell"><div class="bar" style="width:${barWidth(count, t.requests)}%"></div></td></tr>`).join('\n') || '<tr><td colspan="3" class="muted">No status codes</td></tr>';
  const errorRows = Object.entries(er).map(([name, count]) => `<tr><td>${esc(name)}</td><td class="num">${esc(count)}</td></tr>`).join('\n') || '<tr><td colspan="2" class="muted">No errors</td></tr>';

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box}body{font-family:ui-sans,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#0b0f14;color:#e6edf3;line-height:1.5}
.wrap{max-width:960px;margin:0 auto;padding:32px 20px}
header{border-bottom:1px solid #1f2a36;padding-bottom:16px;margin-bottom:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 12px;color:#c9d1d9;border-bottom:1px solid #1f2a36;padding-bottom:6px}
.muted{color:#8b949e;font-size:13px}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;word-break:break-all}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.card{background:#111824;border:1px solid #1f2a36;border-radius:10px;padding:14px}
.card .k{font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:.04em}.card .v{font-size:20px;font-weight:650;margin-top:4px}.card .s{font-size:12px;color:#8b949e;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:#8b949e;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #1f2a36;padding:8px 8px}td{border-bottom:1px solid #16202e;padding:8px 8px}td.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:8px;background:#2ea043;border-radius:999px}.bar-cell{width:40%}
.lat-row{display:flex;align-items:center;gap:10px;margin:6px 0}.lat-label{width:48px;font-size:13px;color:#8b949e}.lat-bar{flex:1;height:10px;background:#16202e;border-radius:999px;overflow:hidden}.lat-fill{height:100%;background:#58a6ff}.lat-val{width:90px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
.cfg{display:grid;grid-template-columns:160px 1fr;gap:6px 12px;font-size:13px}.cfg dt{color:#8b949e}.cfg dd{margin:0;font-family:ui-monospace,monospace;word-break:break-all}
footer{margin-top:32px;padding-top:16px;border-top:1px solid #1f2a36;color:#8b949e;font-size:12px}
.badge{display:inline-block;font-size:11px;border:1px solid #2a3a4d;border-radius:999px;padding:2px 8px;color:#8b949e}
@media print{body{background:#fff;color:#111}.card{background:#f6f8fa;border-color:#d0d7de}header{border-color:#d0d7de}}
</style>
<div class="wrap">
<header>
  <div class="badge">GP-1 ${esc(report.schemaVersion ?? '?')} · ${esc(cfg.profile ?? 'unknown')} · mode ${esc(cfg.mode ?? '?')}</div>
  <h1>GP-1 Load Report</h1>
  <div class="mono">${esc(cfg.url ?? 'n/a')}</div>
  <div class="muted">Generated ${esc(report.generatedAt ?? 'n/a')} · elapsed ${fmtNum(elapsed, 0)} ms · ${esc(cfg.targetClass ?? '')}</div>
</header>

<div class="grid">
  <div class="card"><div class="k">Requests</div><div class="v">${fmtNum(t.requests, 0)}</div><div class="s">${fmtNum(t.successful, 0)} ok · ${fmtNum(t.failed, 0)} failed · ${(Number.isFinite(t.successRate) ? (t.successRate * 100).toFixed(1) : 'n/a')}% success</div></div>
  <div class="card"><div class="k">Throughput</div><div class="v">${fmtNum(t.requestsPerSecond)} <span style="font-size:13px;font-weight:500">req/s</span></div><div class="s">${fmtNum(t.mebibytesPerSecond)} MiB/s · ${fmtNum(t.bytesPerSecond, 0)} B/s</div></div>
  <div class="card"><div class="k">Bytes received</div><div class="v">${fmtNum(t.bytesReceived, 0)}</div><div class="s">total response bytes counted</div></div>
  <div class="card"><div class="k">p95 latency</div><div class="v">${fmtNum(l.p95)} <span style="font-size:13px;font-weight:500">ms</span></div><div class="s">p50 ${fmtNum(l.p50)} · p99 ${fmtNum(l.p99)} · max ${fmtNum(l.max)}</div></div>
</div>

<h2>Latency</h2>
<div class="lat-row"><span class="lat-label">min</span><div class="lat-bar"><div class="lat-fill" style="width:${barWidth(l.min, latencyMax)}%"></div></div><span class="lat-val">${fmtNum(l.min)} ms</span></div>
<div class="lat-row"><span class="lat-label">mean</span><div class="lat-bar"><div class="lat-fill" style="width:${barWidth(l.mean, latencyMax)}%"></div></div><span class="lat-val">${fmtNum(l.mean)} ms</span></div>
<div class="lat-row"><span class="lat-label">p50</span><div class="lat-bar"><div class="lat-fill" style="width:${barWidth(l.p50, latencyMax)}%"></div></div><span class="lat-val">${fmtNum(l.p50)} ms</span></div>
<div class="lat-row"><span class="lat-label">p95</span><div class="lat-bar"><div class="lat-fill" style="width:${barWidth(l.p95, latencyMax)}%;background:#d29922"></div></div><span class="lat-val">${fmtNum(l.p95)} ms</span></div>
<div class="lat-row"><span class="lat-label">p99</span><div class="lat-bar"><div class="lat-fill" style="width:${barWidth(l.p99, latencyMax)}%;background:#f85149"></div></div><span class="lat-val">${fmtNum(l.p99)} ms</span></div>
<div class="lat-row"><span class="lat-label">max</span><div class="lat-bar"><div class="lat-fill" style="width:${barWidth(l.max, latencyMax)}%;background:#f85149"></div></div><span class="lat-val">${fmtNum(l.max)} ms</span></div>

<h2>Configuration</h2>
<dl class="cfg">
  <dt>URL</dt><dd>${esc(cfg.url ?? 'n/a')}</dd>
  <dt>Mode / profile</dt><dd>${esc(cfg.mode ?? 'n/a')} / ${esc(cfg.profile ?? 'n/a')}</dd>
  <dt>Duration</dt><dd>${esc(cfg.durationSeconds ?? 'n/a')} s</dd>
  <dt>Concurrency</dt><dd>${esc(cfg.concurrency ?? 'n/a')}</dd>
  <dt>Interval</dt><dd>${esc(cfg.intervalMs ?? 'n/a')} ms</dd>
  <dt>Timeout</dt><dd>${esc(cfg.timeoutMs ?? 'n/a')} ms</dd>
  <dt>Max requests</dt><dd>${esc(cfg.maxRequests ?? 'n/a')}</dd>
  <dt>Max bytes</dt><dd>${esc(cfg.maxBytes ?? 'n/a')}</dd>
  <dt>Worker</dt><dd>${esc(cfg.workerId ?? 'n/a')} · ${esc(cfg.method ?? 'n/a')}</dd>
</dl>

<h2>Status codes</h2>
<table><thead><tr><th>Code</th><th style="text-align:right">Count</th><th>Share</th></tr></thead><tbody>${statusRows}</tbody></table>

<h2>Errors</h2>
<table><thead><tr><th>Error</th><th style="text-align:right">Count</th></tr></thead><tbody>${errorRows}</tbody></table>

<footer>
  <div>GP-1 is a bounded, single-process HTTP load generator. Throughput and MiB/s are client-observed bytes/s, not server capacity claims.</div>
  <div style="margin-top:6px">Report schema v${esc(report.schemaVersion ?? '?')} · <span class="mono">${esc(report.generatedAt ?? '')}</span></div>
</footer>
</div>
</html>`;
}

export function generateCompareHtml(cmp) {
  const a = cmp.baseline, b = cmp.candidate;
  const rows = [];
  for (const [k, v] of Object.entries(cmp.delta.totals)) {
    rows.push(`<tr><td>${esc(k)}</td><td class="num">${esc(v.baseline ?? 'n/a')}</td><td class="num">${esc(v.candidate ?? 'n/a')}</td><td class="num ${v.delta > 0 ? 'up' : v.delta < 0 ? 'down' : ''}">${v.delta >= 0 ? '+' : ''}${esc(Number.isFinite(v.delta) ? v.delta.toFixed(2) : 'n/a')}</td><td class="num">${v.deltaPercent === null ? 'n/a' : (v.deltaPercent >= 0 ? '+' : '') + v.deltaPercent.toFixed(1) + '%'}</td></tr>`);
  }
  const latRows = [];
  for (const [k, v] of Object.entries(cmp.delta.latencyMs)) {
    latRows.push(`<tr><td>${esc(k)}</td><td class="num">${esc(v.baseline ?? 'n/a')}</td><td class="num">${esc(v.candidate ?? 'n/a')}</td><td class="num ${v.delta > 0 ? 'bad' : v.delta < 0 ? 'good' : ''}">${v.delta >= 0 ? '+' : ''}${esc(Number.isFinite(v.delta) ? v.delta.toFixed(2) : 'n/a')}</td><td class="num">${v.deltaPercent === null ? 'n/a' : (v.deltaPercent >= 0 ? '+' : '') + v.deltaPercent.toFixed(1) + '%'}</td></tr>`);
  }
  const summary = (cmp.summary ?? []).map(s => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No summary</li>';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GP-1 Compare. ${esc(a.file ?? 'baseline')} vs ${esc(b.file ?? 'candidate')}</title>
<style>*{box-sizing:border-box}body{font-family:ui-sans,system-ui,sans-serif;margin:0;background:#0b0f14;color:#e6edf3;line-height:1.5}.wrap{max-width:1000px;margin:0 auto;padding:32px 20px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:28px 0 12px;color:#c9d1d9;border-bottom:1px solid #1f2a36;padding-bottom:6px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#8b949e;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #1f2a36;padding:8px}td{border-bottom:1px solid #16202e;padding:8px}td.num{text-align:right;font-variant-numeric:tabular-nums}.up{color:#2ea043}.down{color:#f85149}.good{color:#2ea043}.bad{color:#f85149}.muted{color:#8b949e}.mono{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}.badge{display:inline-block;font-size:11px;border:1px solid #2a3a4d;border-radius:999px;padding:2px 8px;color:#8b949e}ul{margin:8px 0;padding-left:20px}footer{margin-top:32px;padding-top:16px;border-top:1px solid #1f2a36;color:#8b949e;font-size:12px}</style>
<div class="wrap">
<div class="badge">GP-1 compare</div>
<h1>Compare</h1>
<div class="mono">baseline: ${esc(a.file ?? 'n/a')} @ ${esc(a.generatedAt ?? 'n/a')}</div>
<div class="mono">candidate: ${esc(b.file ?? 'n/a')} @ ${esc(b.generatedAt ?? 'n/a')}</div>
<h2>Totals</h2>
<table><thead><tr><th>Metric</th><th style="text-align:right">Baseline</th><th style="text-align:right">Candidate</th><th style="text-align:right">Delta</th><th style="text-align:right">Δ%</th></tr></thead><tbody>${rows.join('\n')}</tbody></table>
<h2>Latency (ms)</h2>
<table><thead><tr><th>Metric</th><th style="text-align:right">Baseline</th><th style="text-align:right">Candidate</th><th style="text-align:right">Delta</th><th style="text-align:right">Δ%</th></tr></thead><tbody>${latRows.join('\n')}</tbody></table>
<h2>Summary</h2>
<ul>${summary}</ul>
<footer>GP-1 compare. Deltas are candidate minus baseline. Throughput/MiB/s are client-observed, not capacity claims.</footer>
</div></html>`;
}
