#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { summarize } from './metrics.mjs';
import { Agent } from 'undici';
import { compareReports, formatComparisonText } from './compare.mjs';
import { generateHtml, generateCompareHtml } from './html-report.mjs';

const VERSION = '0.2.0';
const HTTP_AGENT = new Agent({ connections: 400, pipelining: 1, keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000 });
const SETTINGS_PATH = new URL('../settings.json', import.meta.url);

async function loadSettings() {
  const settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'));
  if (![0, 1].includes(settings.mode)) throw new Error('settings.json mode must be 0 or 1');
  return settings;
}

function showHelp(settings) {
  const modeHint = settings ? ` (settings.json mode=${settings.mode} ${settings.profiles[String(settings.mode)]?.name ?? ''})` : '';
  console.log(`GP-1 ${VERSION}${modeHint}

Flagship HTTP performance and resilience experiments with explicit mode settings.

Usage:
  gp-1 --url http://127.0.0.1:8080/health [options]
  gp-1 compare <baseline.json> <candidate.json> [--output diff.json] [--html diff.html]
  gp-1 html <report.json> [--output report.html]

Commands:
  (no command)  Run a bounded load test (default)
  compare       Compare two JSON reports and print deltas
  html          Generate a standalone HTML report from a JSON report

Options (run mode):
  -u, --url <url>             Target URL (required)
      --mode <0|1>            Override settings.json mode for this run
      --lab-confirm           Required for mode=1; confirms an isolated lab/staging window
      --allow-public          Opt in to a public test server you own or are authorized to test
      --public-test-confirm   Confirms the public target is an approved test server
      --worker-id <id>        Transparent local worker/run label for logs
      --method <name>         Transparent benchmark method label
  -d, --duration <seconds>    Test duration, maximum 600
  -c, --concurrency <count>   Parallel workers, maximum 400
  -i, --interval <ms>         Delay per worker between requests
  -t, --timeout <ms>          Per-request timeout
  -m, --max-requests <count>  Hard request cap
      --max-bytes <bytes>     Hard response-byte cap (default: 536870912)
  -o, --output <file>         Write the JSON report to a file
      --html <file>           Also write a standalone HTML report
  -h, --help                  Show this help
      --version               Show version

Options (compare):
      --output <file>         Write JSON diff to file
      --html <file>           Write HTML diff to file

Options (html):
  -o, --output <file>         Output HTML file (default: <input>.html)
      --stdout                Print HTML to stdout instead of a file

Settings modes:
  mode=0  safe-observation: bounded read-only measurements
  mode=1  lab-experiment: explicit lab/staging experiments with confirmation

Both modes use GET only, require private/loopback targets unless both public opt-ins are supplied,
consume response bodies only to count bytes, persist no response bodies, and enforce duration, concurrency, interval, timeout, request, and byte caps.`);
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
    htmlOutput: null,
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
    if (arg === '--version') return { version: true };
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
    else if (arg === '--html') options.htmlOutput = valueFor(argv, index++, arg);
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

// --- sparkline ---
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
function renderSpark(values) {
  if (!values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === 0 && min === 0) return SPARK_CHARS[0].repeat(values.length);
  if (max === min) return SPARK_CHARS[3].repeat(values.length);
  return values.map((v) => {
    const ratio = (v - min) / (max - min);
    const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(ratio * (SPARK_CHARS.length - 1))));
    return SPARK_CHARS[idx];
  }).join('');
}

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

  // sparkline state
  let lastCount = 0;
  let lastSampleIdx = 0;
  const rpsHistory = [];
  const latHistory = [];

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
    const deltaCount = samples.length - lastCount;
    lastCount = samples.length;
    const newSamples = samples.slice(lastSampleIdx);
    lastSampleIdx = samples.length;
    const avgLat = newSamples.length ? newSamples.reduce((s, x) => s + x.latencyMs, 0) / newSamples.length : 0;
    rpsHistory.push(deltaCount);
    latHistory.push(avgLat);
    if (rpsHistory.length > 20) rpsHistory.shift();
    if (latHistory.length > 20) latHistory.shift();
    const rpsSpark = renderSpark(rpsHistory);
    const latSpark = renderSpark(latHistory);
    const latStr = avgLat ? `${avgLat.toFixed(0)}ms` : '—';
    const line = `GP-1 mode=${options.mode} ${options.profile.name} | ${samples.length} req | ${elapsed}s | ${deltaCount} r/s ${rpsSpark} | lat ${latStr} ${latSpark}`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r${line}`.padEnd(120, ' '));
    } else {
      // non-TTY: emit to stderr so stdout stays clean for JSON
      process.stderr.write(`${line}\n`);
    }
  }, 1000);
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  running = false;
  clearInterval(ticker);
  if (process.stdout.isTTY) process.stdout.write('\n');
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

// --- compare subcommand ---
async function handleCompare(argv) {
  // argv after 'compare'
  let baselineFile = null;
  let candidateFile = null;
  let output = null;
  let htmlOutput = null;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--output' || a === '-o') { output = valueFor(argv, i++, a); }
    else if (a === '--html') { htmlOutput = valueFor(argv, i++, a); }
    else if (a === '--help' || a === '-h') { console.log('Usage: gp-1 compare <baseline.json> <candidate.json> [--output diff.json] [--html diff.html]\n\nCompare two GP-1 JSON reports. Prints a human-readable delta table and optionally writes JSON/HTML diffs.'); return; }
    else if (a.startsWith('-')) throw new Error(`Unknown compare option: ${a}`);
    else positional.push(a);
  }
  if (positional.length < 2) throw new Error('compare requires two files: gp-1 compare <baseline.json> <candidate.json>');
  if (positional.length > 2) throw new Error(`compare takes exactly two files, got ${positional.length}`);
  [baselineFile, candidateFile] = positional;
  const [rawA, rawB] = await Promise.all([readFile(baselineFile, 'utf8'), readFile(candidateFile, 'utf8')]);
  const a = JSON.parse(rawA);
  const b = JSON.parse(rawB);
  a._file = baselineFile;
  b._file = candidateFile;
  const cmp = compareReports(a, b);
  console.log(formatComparisonText(cmp));
  // also emit JSON to stdout if no output file? No — human text already on stdout; JSON goes to file or stderr hint.
  if (output) {
    await writeFile(output, `${JSON.stringify(cmp, null, 2)}\n`);
    console.error(`Wrote JSON diff to ${output}`);
  } else {
    // also print JSON diff to stderr for piping if needed? Keep behavior: write to stdout is human text, so mention --output.
  }
  if (htmlOutput) {
    const html = generateCompareHtml(cmp);
    await writeFile(htmlOutput, html);
    console.error(`Wrote HTML diff to ${htmlOutput}`);
  }
  // If neither file output, also dump JSON to output file is not required; human text is the result.
  // For machine use, allow piping: if --output not given, also write JSON to stdout? We already wrote text — avoid mixing.
  // Instead, if user wants JSON on stdout, they can use --output /dev/stdout or we emit to stderr.
}

// --- html subcommand ---
async function handleHtml(argv) {
  let input = null;
  let output = null;
  let toStdout = false;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--output' || a === '-o') { output = valueFor(argv, i++, a); }
    else if (a === '--stdout') { toStdout = true; }
    else if (a === '--help' || a === '-h') { console.log('Usage: gp-1 html <report.json> [--output report.html] [--stdout]\n\nGenerate a standalone HTML report from a GP-1 JSON report.'); return; }
    else if (a.startsWith('-')) throw new Error(`Unknown html option: ${a}`);
    else positional.push(a);
  }
  if (positional.length < 1) throw new Error('html requires an input file: gp-1 html <report.json>');
  input = positional[0];
  if (positional.length > 1) throw new Error('html takes a single input file');
  if (!output && !toStdout) output = input.replace(/\.json$/i, '.html') || `${input}.html`;
  const raw = await readFile(input, 'utf8');
  const report = JSON.parse(raw);
  report._file = input;
  const html = generateHtml(report);
  if (toStdout) process.stdout.write(html);
  else {
    await writeFile(output, html);
    console.error(`Wrote HTML report to ${output}`);
  }
}

async function main() {
  const settings = await loadSettings();
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--version')) {
    console.log(VERSION);
    return;
  }
  if (rawArgs[0] === 'compare') {
    await handleCompare(rawArgs.slice(1));
    return;
  }
  if (rawArgs[0] === 'html' || rawArgs[0] === 'report' || rawArgs[0] === 'html-report') {
    await handleHtml(rawArgs.slice(1));
    return;
  }
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    showHelp(settings);
    return;
  }
  const options = parseArgs(rawArgs, settings);
  if (options.help) return showHelp(settings);
  if (options.version) { console.log(VERSION); return; }
  const target = validateTarget(options.url, options.profile, options);
  const report = await run(options, target);
  if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  if (options.htmlOutput) {
    const html = generateHtml(report);
    await writeFile(options.htmlOutput, html);
    console.error(`Wrote HTML report to ${options.htmlOutput}`);
  }
  printReport(report);
}

main().catch((error) => {
  console.error(`GP-1 error: ${error.message}`);
  process.exitCode = 1;
});
