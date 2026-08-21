#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { summarize } from './metrics.mjs';
import { Agent } from 'undici';

const VERSION = '0.1.0';
const HTTP_AGENT = new Agent({ connections: 400, pipelining: 1, keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000 });
const SETTINGS_PATH = new URL('../settings.json', import.meta.url);

async function loadSettings() {
  const settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'));
  if (![0, 1].includes(settings.mode)) throw new Error('settings.json mode must be 0 or 1');
  return settings;
}

function showHelp(settings) {
  console.log(`GP-1 ${VERSION}\n\nFlagship HTTP performance and resilience experiments with explicit mode settings.\n\nUsage:\n  gp-1 --url http://127.0.0.1:8080/health [options]\n\nOptions:\n  -u, --url <url>             Target URL (required)\n      --mode <0|1>            Override settings.json mode for this run\n      --lab-confirm           Required for mode=1; confirms an isolated lab/staging window\n      --allow-public          Opt in to a public test server you own or are authorized to test\n      --public-test-confirm   Confirms the public target is an approved test server\n      --worker-id <id>        Transparent local worker/run label for logs\n      --method <name>         Transparent benchmark method label\n  -d, --duration <seconds>    Test duration, maximum 600\n  -c, --concurrency <count>   Parallel workers, maximum 400\n  -i, --interval <ms>         Delay per worker between requests\n  -t, --timeout <ms>          Per-request timeout\n  -m, --max-requests <count>  Hard request cap\n      --max-bytes <bytes>     Hard response-byte cap (default: 536870912)\n  -o, --output <file>         Write the JSON report to a file\n  -h, --help                  Show this help\n\nSettings modes:\n  mode=0  safe-observation: bounded read-only measurements\n  mode=1  lab-experiment: explicit lab/staging experiments with confirmation\n\nBoth modes use GET only, require private/loopback targets unless both public opt-ins are supplied,\nconsume response bodies only to count bytes, persist no response bodies, and enforce duration, concurrency, interval, timeout, request, and byte caps.`);
}

function valueFor(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${name} requires a value`);
  return value;
}

function parseArgs(argv, settings) {
  const modeOverride = argv.includes('--mode') ? Number(valueFor(argv, argv.indexOf('--mode'), '--mode')) : null;
  const mode = modeOverride ?? settings.mode;
  if (![0, 1].includes(mode)) throw new Error('--mode must be 0 or 1');
  const profile = settings.profiles[String(mode)];
  const options = {
    mode,
    profile,
    url: null,
    output: null,
    labConfirm: argv.includes('--lab-confirm'),
    allowPublic: argv.includes('--allow-public'),
    publicTestConfirm: argv.includes('--public-test-confirm'),
    durationSeconds: profile.defaultDurationSeconds,
    concurrency: profile.defaultConcurrency,
    intervalMs: profile.defaultIntervalMs,
    timeoutMs: 5000,
    maxRequests: profile.defaultMaxRequests,
    maxBytes: 536870912,
    workerId: 'local-run',
    methodLabel: 'default'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '-u' || arg === '--url') options.url = valueFor(argv, index++, arg);
    else if (arg === '--mode') index += 1;
    else if (arg === '--lab-confirm' || arg === '--allow-public' || arg === '--public-test-confirm') continue;
    else if (arg === '-d' || arg === '--duration') options.durationSeconds = Number(valueFor(argv, index++, arg));
    else if (arg === '-c' || arg === '--concurrency') options.concurrency = Number(valueFor(argv, index++, arg));
    else if (arg === '-i' || arg === '--interval') options.intervalMs = Number(valueFor(argv, index++, arg));
    else if (arg === '-t' || arg === '--timeout') options.timeoutMs = Number(valueFor(argv, index++, arg));
    else if (arg === '-m' || arg === '--max-requests') options.maxRequests = Number(valueFor(argv, index++, arg));
    else if (arg === '--max-bytes') options.maxBytes = Number(valueFor(argv, index++, arg));
    else if (arg === '--worker-id') options.workerId = valueFor(argv, index++, arg);
    else if (arg === '--method') options.methodLabel = valueFor(argv, index++, arg);
    else if (arg === '-o' || arg === '--output') options.output = valueFor(argv, index++, arg);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.url) throw new Error('--url is required');
  if (options.profile.requireLabConfirm && !options.labConfirm) {
    throw new Error('mode=1 requires --lab-confirm and is reserved for an isolated lab or authorized staging window');
  }
  if (options.allowPublic && !options.publicTestConfirm) {
    throw new Error('--allow-public requires --public-test-confirm for an approved test server');
  }
  const numeric = ['durationSeconds', 'concurrency', 'intervalMs', 'timeoutMs', 'maxRequests', 'maxBytes'];
  if (numeric.some((key) => !Number.isFinite(options[key]) || options[key] < 0 || !Number.isInteger(options[key]))) {
    throw new Error('Numeric options must be non-negative integers');
  }
  if (options.durationSeconds < 1 || options.durationSeconds > 600) throw new Error('--duration must be between 1 and 600 seconds');
  if (options.concurrency < 1 || options.concurrency > 400) throw new Error('--concurrency must be between 1 and 400');
  if (options.intervalMs > 60000) throw new Error('--interval must be between 0 and 60000 ms');
  if (options.timeoutMs < 100 || options.timeoutMs > 60000) throw new Error('--timeout must be between 100 and 60000 ms');
  if (options.maxRequests < 1 || options.maxRequests > 100000) throw new Error('--max-requests must be between 1 and 100000');
  if (options.maxBytes < 1024 || options.maxBytes > 2147483648) throw new Error('--max-bytes must be between 1024 and 2147483648');
  return options;
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^169\.254\./.test(host) || /^fc[0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}

function validateTarget(rawUrl, profile, options) {
  let target;
  try { target = new URL(rawUrl); } catch { throw new Error('Target must be a valid URL'); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only http:// and https:// targets are supported');
  if (profile.requirePrivateTarget && !isPrivateHost(target.hostname) && !(options.allowPublic && options.publicTestConfirm)) {
    throw new Error(`mode profile '${profile.name}' accepts localhost/private targets only unless public opt-ins are supplied`);
  }
  return target;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestOnce(target, timeoutMs, requestContext) {
  const started = performance.now();
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      dispatcher: HTTP_AGENT,
      headers: { accept: '*/*', 'user-agent': `GP-1/${VERSION} worker/${requestContext.workerId} method/${requestContext.methodLabel}`, connection: 'keep-alive' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.arrayBuffer();
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      latencyMs: performance.now() - started,
      bytesReceived: body.byteLength,
      error: null
    };
  } catch (error) {
    return { ok: false, status: null, latencyMs: performance.now() - started, bytesReceived: 0, error: error.name || 'RequestError' };
  }
}

async function run(options, target) {
  const samples = [];
  const started = performance.now();
  let nextRequest = 0;
  let running = true;
  let bytesObserved = 0;
  const limit = Math.min(options.maxRequests, 100000);

  const worker = async () => {
    while (running) {
      const requestNumber = nextRequest++;
      if (requestNumber >= limit || bytesObserved >= options.maxBytes || performance.now() - started >= options.durationSeconds * 1000) break;
      const sample = await requestOnce(target, options.timeoutMs, options);
      bytesObserved += sample.bytesReceived || 0;
      samples.push(sample);
      if (options.intervalMs > 0) await sleep(options.intervalMs);
    }
  };

  const ticker = setInterval(() => {
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    process.stdout.write(`\rGP-1 mode=${options.mode} ${options.profile.name} | ${samples.length} requests | ${elapsed}s`);
  }, 1000);
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  running = false;
  clearInterval(ticker);
  process.stdout.write('\n');
  return summarize(samples, performance.now() - started, {
    mode: options.mode,
    profile: options.profile.name,
    url: target.toString(),
    durationSeconds: options.durationSeconds,
    concurrency: options.concurrency,
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
    maxRequests: options.maxRequests,
    maxBytes: options.maxBytes,
    workerId: options.workerId,
    method: options.methodLabel,
    targetClass: isPrivateHost(target.hostname) ? 'private-or-loopback' : 'public-opt-in'
  });
}

function printReport(report) {
  const { totals, latencyMs } = report;
  console.log(JSON.stringify(report, null, 2));
  console.error(`GP-1 complete: mode=${report.config.mode}, ${totals.requests} requests, ${totals.requestsPerSecond.toFixed(2)} req/s, ${(totals.mebibytesPerSecond ?? 0).toFixed(2)} MiB/s, p95 ${(latencyMs.p95 ?? 0).toFixed(2)} ms`);
}

async function main() {
  const settings = await loadSettings();
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp(settings);
    return;
  }
  const options = parseArgs(process.argv.slice(2), settings);
  if (options.help) return showHelp(settings);
  const target = validateTarget(options.url, options.profile, options);
  const report = await run(options, target);
  if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  printReport(report);
}

main().catch((error) => {
  console.error(`GP-1 error: ${error.message}`);
  process.exitCode = 1;
});
