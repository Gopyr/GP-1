#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url);
const outDir = new URL('../experiments/results/saturation-2026-08-22/', import.meta.url);
const baseUrl = process.env.GP1_SATURATION_URL || 'http://127.0.0.1:8136/gp1-saturation';
const metricsUrl = process.env.GP1_SATURATION_METRICS_URL || baseUrl;
const stages = [25, 50, 100, 200, 400].map((concurrency) => ({ concurrency, duration: 30, payload: 65536, maxRequests: 5000, maxBytes: 268435456 }));
const threshold = { targetP95Ms: 1000, eventLoopP95Ms: 250, rssDeltaMiB: 256, targetFailureRate: 0.01, clientTimeoutRate: 0.01 };

await mkdir(outDir, { recursive: true });

async function metrics() {
  const response = await fetch(`${metricsUrl}/metrics`, { signal: AbortSignal.timeout(5000) });
  return response.json();
}
async function saveMetrics(name, value) { await writeFile(new URL(`./metrics-${name}.json`, outDir), JSON.stringify(value, null, 2) + '\n'); }
function stageDelta(before, after) {
  const requests = after.totalRequests - before.totalRequests;
  const failures = Object.entries(after.byStatus).reduce((sum, [code, count]) => sum + (Number(code) >= 500 ? count : 0), 0) - Object.entries(before.byStatus).reduce((sum, [code, count]) => sum + (Number(code) >= 500 ? count : 0), 0);
  const status = Object.fromEntries(new Set([...Object.keys(before.byStatus), ...Object.keys(after.byStatus)]).map((code) => [code, (after.byStatus[code] || 0) - (before.byStatus[code] || 0)]));
  return { requests, responseBytes: after.totalResponseBytes - before.totalResponseBytes, targetP95Ms: after.latencyMs.p95, eventLoopP95Ms: after.eventLoopDelayMs.p95, eventLoopMaxMs: after.eventLoopDelayMs.max, rssDeltaMiB: (after.memory.rss - before.memory.rss) / (1024 * 1024), failures, status };
}
function crossed(delta) {
  const failureRate = delta.requests ? delta.failures / delta.requests : 0;
  return delta.targetP95Ms >= threshold.targetP95Ms || delta.eventLoopP95Ms >= threshold.eventLoopP95Ms || delta.rssDeltaMiB >= threshold.rssDeltaMiB || failureRate >= threshold.targetFailureRate;
}

const results = [];
let stopReason = null;
for (const stage of stages) {
  if (stopReason) break;
  const name = `c${stage.concurrency}`;
  const before = await metrics();
  await saveMetrics(`before-${name}`, before);
  const output = new URL(`./client-${name}.json`, outDir);
  const log = new URL(`./client-${name}.log`, outDir);
  const args = [new URL('../src/cli.mjs', import.meta.url).pathname, '--mode', '1', '--lab-confirm', '--url', `${baseUrl}/payload?bytes=${stage.payload}`, '--duration', String(stage.duration), '--concurrency', String(stage.concurrency), '--interval', '0', '--max-requests', String(stage.maxRequests), '--max-bytes', String(stage.maxBytes), '--worker-id', `saturation-${name}`, '--method', `saturation-${name}`, '--output', output.pathname];
  const child = spawn(process.execPath, args, { cwd: new URL('../', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  let trigger = null;
  const monitor = setInterval(async () => {
    try {
      const current = await metrics();
      const delta = stageDelta(before, current);
      await writeFile(new URL(`./live-${name}.json`, outDir), JSON.stringify({ at: new Date().toISOString(), delta }, null, 2) + '\n');
      if (crossed(delta) && !trigger) {
        trigger = delta;
        child.kill('SIGTERM');
      }
    } catch {}
  }, 500);
  await new Promise((resolve) => child.on('close', resolve));
  clearInterval(monitor);
  const after = await metrics();
  await saveMetrics(`after-${name}`, after);
  await writeFile(log, `${stdout}\n${stderr}`);
  const delta = stageDelta(before, after);
  let client = null;
  try { client = JSON.parse(await readFile(output, 'utf8')); } catch {}
  const result = { stage: name, config: stage, threshold, stoppedByThreshold: Boolean(trigger), trigger, client, target: delta };
  results.push(result);
  console.log(JSON.stringify({ stage: name, stoppedByThreshold: Boolean(trigger), trigger, target: delta }));
  if (trigger) stopReason = { stage: name, trigger };
}
await writeFile(new URL('./SATURATION-REPORT.json', outDir), JSON.stringify({ threshold, stages: results, stopReason }, null, 2) + '\n');
