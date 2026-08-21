#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const outDir = new URL('../experiments/results/local-2000-workers-2026-08-21/', import.meta.url);
const baseUrl = process.env.GP1_2000_URL || 'http://127.0.0.1:8133/gp1-2000';
const metricsUrl = process.env.GP1_2000_METRICS_URL || baseUrl;
const processCount = 20;
const workersPerProcess = 100;
const stages = [
  { name: 'baseline-1k', path: 'payload?bytes=1024', duration: 10, interval: 10, maxRequests: 1000, maxBytes: 4 * 1024 * 1024, processes: 1 },
  { name: 'multi-64k-2000w', path: 'payload?bytes=65536', duration: 30, interval: 0, maxRequests: 5000, maxBytes: 32 * 1024 * 1024, processes: processCount },
  { name: 'multi-256k-2000w', path: 'payload?bytes=262144', duration: 30, interval: 0, maxRequests: 5000, maxBytes: 32 * 1024 * 1024, processes: processCount },
  { name: 'multi-1m-2000w', path: 'payload?bytes=1048576', duration: 20, interval: 0, maxRequests: 2000, maxBytes: 32 * 1024 * 1024, processes: processCount },
  { name: 'recovery-1k', path: 'payload?bytes=1024', duration: 20, interval: 10, maxRequests: 2000, maxBytes: 8 * 1024 * 1024, processes: 1 }
];

async function snapshot(name) {
  const response = await fetch(`${metricsUrl}/metrics`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`metrics ${response.status}`);
  await writeFile(new URL(`./metrics-${name}.json`, outDir), await response.text());
}

function runOne(stage, index) {
  const output = new URL(`./${stage.name}-${index}.json`, outDir);
  const args = [
    new URL('../src/cli.mjs', import.meta.url).pathname,
    '--mode', '1', '--lab-confirm', '--url', `${baseUrl}/${stage.path}`,
    '--duration', String(stage.duration), '--concurrency', String(workersPerProcess),
    '--interval', String(stage.interval), '--max-requests', String(stage.maxRequests),
    '--max-bytes', String(stage.maxBytes), '--output', output.pathname
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: new URL('../', import.meta.url).pathname, stdio: ['ignore', 'ignore', 'pipe'] });
    const errors = [];
    child.stderr.on('data', (chunk) => errors.push(String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve({ output, errors }) : reject(new Error(`${stage.name}-${index} exited ${code}: ${errors.join('').slice(-500)}`)));
  });
}

async function aggregate(stage) {
  const reports = [];
  for (let index = 0; index < stage.processes; index += 1) {
    reports.push(JSON.parse(await readFile(new URL(`./${stage.name}-${index}.json`, outDir), 'utf8')));
  }
  const totals = reports.reduce((sum, report) => {
    sum.requests += report.totals.requests;
    sum.successful += report.totals.successful;
    sum.failed += report.totals.failed;
    sum.bytesReceived += report.totals.bytesReceived;
    sum.elapsedMs = Math.max(sum.elapsedMs, report.elapsedMs);
    for (const [status, count] of Object.entries(report.statusCodes)) sum.statusCodes[status] = (sum.statusCodes[status] || 0) + count;
    return sum;
  }, { requests: 0, successful: 0, failed: 0, bytesReceived: 0, elapsedMs: 0, statusCodes: {} });
  const latencies = reports.flatMap((report) => [report.latencyMs.p50, report.latencyMs.p95, report.latencyMs.p99].filter(Number.isFinite));
  totals.requestsPerSecond = totals.requests / Math.max(totals.elapsedMs / 1000, 0.001);
  totals.bytesPerSecond = totals.bytesReceived / Math.max(totals.elapsedMs / 1000, 0.001);
  totals.mebibytesPerSecond = totals.bytesPerSecond / (1024 * 1024);
  return { stage, processCount: stage.processes, workersPerProcess, totals, representativeTailLatencyMs: { p50: Math.min(...latencies), p95: Math.max(...latencies), p99: Math.max(...latencies) } };
}

await mkdir(outDir, { recursive: true });
const started = performance.now();
const results = [];
for (const stage of stages) {
  await snapshot(`before-${stage.name}`);
  await Promise.all(Array.from({ length: stage.processes }, (_, index) => runOne(stage, index)));
  await snapshot(`after-${stage.name}`);
  results.push(await aggregate(stage));
  console.log(JSON.stringify(results.at(-1)));
}
await writeFile(new URL('./LOCAL-2000-WORKER-REPORT.json', outDir), JSON.stringify({ processCount, workersPerProcess, totalWorkers: processCount * workersPerProcess, elapsedMs: performance.now() - started, stages: results }, null, 2) + '\n');
