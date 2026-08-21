#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url);
const outDir = new URL('../experiments/results/logical-10000-2026-08-21/', import.meta.url);
const baseUrl = process.env.GP1_10000_URL || 'http://127.0.0.1:8134/gp1-10000';
const metricsUrl = process.env.GP1_10000_METRICS_URL || baseUrl;
const jobs = 10_000;
const concurrency = 400;
const stages = [
  { name: 'payload-1k', path: 'payload?bytes=1024', maxBytes: 64 * 1024 * 1024 },
  { name: 'payload-64k', path: 'payload?bytes=65536', maxBytes: 768 * 1024 * 1024 },
  { name: 'payload-128k', path: 'payload?bytes=131072', maxBytes: 1024 * 1024 * 1024 },
  { name: 'slow-25ms', path: 'slow?ms=25', maxBytes: 64 * 1024 * 1024 }
];

await mkdir(outDir, { recursive: true });

async function snapshot(name) {
  const response = await fetch(`${metricsUrl}/metrics`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`metrics ${response.status}`);
  await writeFile(new URL(`./metrics-${name}.json`, outDir), await response.text());
}

function runStage(stage) {
  const output = new URL(`./${stage.name}.json`, outDir);
  const log = new URL(`./${stage.name}.log`, outDir);
  const args = [
    new URL('../src/cli.mjs', import.meta.url).pathname,
    '--mode', '1', '--lab-confirm', '--url', `${baseUrl}/${stage.path}`,
    '--duration', '120', '--concurrency', String(concurrency), '--interval', '0',
    '--max-requests', String(jobs), '--max-bytes', String(stage.maxBytes),
    '--worker-id', `logical-${stage.name}`, '--method', stage.name, '--output', output.pathname
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: new URL('../', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', async (code) => {
      await writeFile(log, `${stdout}\n${stderr}`);
      if (code !== 0) return reject(new Error(`${stage.name} exited ${code}`));
      const report = JSON.parse(await readFile(output, 'utf8'));
      const line = [
        `METHOD=${stage.name}`,
        `WORKER_ID=logical-${stage.name}`,
        `JOBS=${jobs}`,
        `COMPLETED=${report.totals.requests}`,
        `SUCCESS=${report.totals.successful}`,
        `FAILED=${report.totals.failed}`,
        `BYTES=${report.totals.bytesReceived}`,
        `MIB_PER_SECOND=${report.totals.mebibytesPerSecond.toFixed(2)}`,
        `REQUESTS_PER_SECOND=${report.totals.requestsPerSecond.toFixed(2)}`,
        `P95_MS=${(report.latencyMs.p95 ?? 0).toFixed(2)}`,
        `P99_MS=${(report.latencyMs.p99 ?? 0).toFixed(2)}`,
        `STATUS_CODES=${JSON.stringify(report.statusCodes)}`,
        `ERRORS=${JSON.stringify(report.errors)}`
      ].join(' ');
      await writeFile(new URL(`./${stage.name}.summary.log`, outDir), `${line}\n`);
      console.log(line);
      resolve(report);
    });
  });
}

const combined = [];
for (const stage of stages) {
  await snapshot(`before-${stage.name}`);
  const report = await runStage(stage);
  await snapshot(`after-${stage.name}`);
  combined.push({ name: stage.name, report });
}
await writeFile(new URL('./COMBINED-OUTPUT.log', outDir), combined.map(({ name, report }) => [
  `METHOD=${name}`,
  `WORKER_ID=logical-${name}`,
  `JOBS=${jobs}`,
  `COMPLETED=${report.totals.requests}`,
  `SUCCESS=${report.totals.successful}`,
  `FAILED=${report.totals.failed}`,
  `BYTES=${report.totals.bytesReceived}`,
  `MIB_PER_SECOND=${report.totals.mebibytesPerSecond.toFixed(2)}`,
  `REQUESTS_PER_SECOND=${report.totals.requestsPerSecond.toFixed(2)}`,
  `P95_MS=${(report.latencyMs.p95 ?? 0).toFixed(2)}`,
  `P99_MS=${(report.latencyMs.p99 ?? 0).toFixed(2)}`,
  `STATUS_CODES=${JSON.stringify(report.statusCodes)}`,
  `ERRORS=${JSON.stringify(report.errors)}`
].join(' ')).join('\n') + '\n');
