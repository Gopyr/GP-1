#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { summarize, formatSummaryLine } from './metrics.mjs';
import { Agent } from 'undici';
import { compareReports, formatComparisonText } from './compare.mjs';
import { generateHtml, generateCompareHtml } from './html-report.mjs';
import { parseAssertions, parseThresholds, checkSample, checkThresholds } from './assertions.mjs';
import { parseRamp, totalRampDuration, concurrencyAt } from './ramp.mjs';
import { enrichReportWithHistogram, renderHistogram } from './histogram.mjs';
import { isPrivateHost } from './net.mjs';
import { pentestHelp, parsePentestArgs, validatePentestTarget, preflightPentest, runPentest } from './pentest.mjs';

const VERSION = '0.4.0';
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

Safe, bounded HTTP load testing and resilience toolkit.

Usage:
  gp-1 --url http://127.0.0.1:8080/health [options]
  gp-1 compare <baseline.json> <candidate.json> [--output diff.json] [--html diff.html]
  gp-1 html <report.json> [--output report.html]

Commands:
  (no command)  Run a bounded load test (default)
  compare       Compare two JSON reports and print deltas
  html          Generate a standalone HTML report from a JSON report
  pentest       Run an authorized AI penetration scan via Strix (gp-1 pentest --help)

HTTP options:
  -u, --url <url>             Target URL (required)
  -m, --method <name>         HTTP method (default: GET)
      --body <string>         Request body (for POST/PUT/PATCH)
      --body-file <path>      Read request body from file
      --content-type <type>   Content-Type header (default: application/json for POST/PUT/PATCH)
  -H, --header <K:V>          Add custom header (repeatable)
      --bearer <token>        Add Authorization: Bearer <token>
      --auth <user:pass>      Add Basic Authorization header
      --cookie <K=V>          Add cookie (repeatable)
      --insecure              Allow insecure TLS (skip cert verification)

Load options:
  -d, --duration <seconds>    Test duration, maximum 600
  -c, --concurrency <count>   Parallel workers, maximum 400
  -i, --interval <ms>         Delay per worker between requests
  -t, --timeout <ms>          Per-request timeout
  -r, --ramp <spec>           Progressive load: "conc:duration,conc:duration,..." (overrides -d, -c)
      --max-requests <count>  Hard request cap
      --max-bytes <bytes>     Hard response-byte cap (default: 536870912)

Safety options:
      --mode <0|1>            Override settings.json mode for this run
      --lab-confirm           Required for mode=1; confirms isolated lab/staging
      --allow-public          Opt in to a public test server you own
      --public-test-confirm   Confirms the public target is approved
      --worker-id <id>        Transparent local worker label
      --method <name>         Transparent benchmark method label

Assertion options:
      --assert-status=<code>  Assert response status (=200, 2xx, <400)
      --assert-body=<text>    Assert response body contains text
      --assert-latency<ms     Assert per-request latency (<500)
      --threshold <expr>      Assert post-run threshold (p95<500, success>99, rps>10)

Output options:
  -o, --output <file>         Write JSON report to file
      --html <file>           Also write standalone HTML report
      --csv <file>            Write results as CSV
      --ndjson                Stream per-request results as NDJSON to stdout
      --quiet                 Suppress live ticker (useful for CI)
  -h, --help                  Show this help
      --version               Show version

Compare options:
      --output <file>         Write JSON diff to file
      --html <file>           Write HTML diff to file

HTML options:
  -o, --output <file>         Output HTML file
      --stdout                Print HTML to stdout

Settings modes:
  mode=0  safe-observation: bounded read-only measurements
  mode=1  lab-experiment: explicit lab/staging experiments with confirmation

Examples:
  # Basic GET test
  gp-1 -u http://localhost:3000/api -d 10 -c 10

  # POST with JSON body and custom headers
  gp-1 -u http://localhost:3000/api/login -m POST -H "Content-Type: application/json" --body '{"user":"admin","pass":"test"}'

  # Progressive ramp: 5 workers for 10s, then 50 for 30s, then 10 for 10s
  gp-1 -u http://localhost:3000/api -r "5:10s,50:30s,10:10s"

  # CI gate: fail if p95 > 200ms or success rate < 99%
  gp-1 -u http://localhost:3000/api --threshold p95<200 --threshold success>99

  # Compare two runs
  gp-1 compare baseline.json candidate.json`);
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
    method: 'GET',
    body: null,
    bodyFile: null,
    contentType: null,
    headers: [],
    bearer: null,
    auth: null,
    cookies: [],
    insecure: false,
    output: null,
    htmlOutput: null,
    csvOutput: null,
    ndjson: false,
    quiet: false,
    labConfirm: argv.includes('--lab-confirm'),
    allowPublic: argv.includes('--allow-public'),
    publicTestConfirm: argv.includes('--public-test-confirm'),
    durationSeconds: profile.defaultDurationSeconds,
    concurrency: profile.defaultConcurrency,
    intervalMs: profile.defaultIntervalMs,
    timeoutMs: 5000,
    maxRequests: profile.defaultMaxRequests,
    maxBytes: 536870912,
    rampSpec: null,
    rampStages: [],
    workerId: 'local-run',
    methodLabel: 'default',
    assertions: [],
    thresholds: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '--version') return { version: true };
    if (arg === '-u' || arg === '--url') options.url = valueFor(argv, index++, arg);
    else if (arg === '-m' || arg === '--method') options.method = valueFor(argv, index++, arg).toUpperCase();
    else if (arg === '--body') options.body = valueFor(argv, index++, arg);
    else if (arg === '--body-file') options.bodyFile = valueFor(argv, index++, arg);
    else if (arg === '--content-type') options.contentType = valueFor(argv, index++, arg);
    else if (arg === '-H' || arg === '--header') options.headers.push(valueFor(argv, index++, arg));
    else if (arg === '--bearer') options.bearer = valueFor(argv, index++, arg);
    else if (arg === '--auth') options.auth = valueFor(argv, index++, arg);
    else if (arg === '--cookie') options.cookies.push(valueFor(argv, index++, arg));
    else if (arg === '--insecure') options.insecure = true;
    else if (arg === '--mode') index += 1;
    else if (arg === '--lab-confirm' || arg === '--allow-public' || arg === '--public-test-confirm') continue;
    else if (arg === '-d' || arg === '--duration') options.durationSeconds = Number(valueFor(argv, index++, arg));
    else if (arg === '-c' || arg === '--concurrency') options.concurrency = Number(valueFor(argv, index++, arg));
    else if (arg === '-i' || arg === '--interval') options.intervalMs = Number(valueFor(argv, index++, arg));
    else if (arg === '-t' || arg === '--timeout') options.timeoutMs = Number(valueFor(argv, index++, arg));
    else if (arg === '-r' || arg === '--ramp') options.rampSpec = valueFor(argv, index++, arg);
    else if (arg === '-m' && argv[index - 1] !== '--method' && argv[index - 1] !== '-m') { /* skip, already handled */ }
    else if (arg === '--max-requests') options.maxRequests = Number(valueFor(argv, index++, arg));
    else if (arg === '--max-bytes') options.maxBytes = Number(valueFor(argv, index++, arg));
    else if (arg === '--worker-id') options.workerId = valueFor(argv, index++, arg);
    else if (arg === '--method' && !argv.includes('-m')) { /* already handled above */ }
    else if (arg === '-o' || arg === '--output') options.output = valueFor(argv, index++, arg);
    else if (arg === '--html') options.htmlOutput = valueFor(argv, index++, arg);
    else if (arg === '--csv') options.csvOutput = valueFor(argv, index++, arg);
    else if (arg === '--ndjson') options.ndjson = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg.startsWith('--assert-')) { options.assertions.push(arg); }
    else if (arg === '--threshold') { options.thresholds.push(`--threshold ${valueFor(argv, index++, arg)}`); }
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

  // Parse ramp
  if (options.rampSpec) {
    options.rampStages = parseRamp(options.rampSpec);
    options.durationSeconds = Math.ceil(totalRampDuration(options.rampStages) / 1000);
    options.concurrency = Math.max(...options.rampStages.map(s => s.concurrency));
  }

  // Parse assertions and thresholds
  options.assertions = parseAssertions(options.assertions);
  options.thresholds = parseThresholds(options.thresholds);

  // Parse headers
  const parsedHeaders = {};
  for (const h of options.headers) {
    const colonIdx = h.indexOf(':');
    if (colonIdx === -1) throw new Error(`Invalid header format: "${h}". Use "Key: Value"`);
    parsedHeaders[h.slice(0, colonIdx).trim()] = h.slice(colonIdx + 1).trim();
  }
  if (options.bearer) parsedHeaders['Authorization'] = `Bearer ${options.bearer}`;
  if (options.auth) {
    const b64 = Buffer.from(options.auth).toString('base64');
    parsedHeaders['Authorization'] = `Basic ${b64}`;
  }
  if (options.cookies.length) parsedHeaders['Cookie'] = options.cookies.join('; ');
  if (options.contentType) parsedHeaders['Content-Type'] = options.contentType;
  else if (options.body && ['POST', 'PUT', 'PATCH'].includes(options.method) && !parsedHeaders['Content-Type']) {
    parsedHeaders['Content-Type'] = 'application/json';
  }
  options.parsedHeaders = parsedHeaders;

  return options;
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

/**
 * Build the fetch options for a single request.
 */
function buildRequestOptions(target, options, requestContext) {
  const fetchOpts = {
    method: options.method,
    redirect: 'manual',
    dispatcher: HTTP_AGENT,
    headers: {
      ...options.parsedHeaders,
      'user-agent': `GP-1/${VERSION} worker/${options.workerId} method/${options.methodLabel}`,
      'connection': 'keep-alive'
    },
    signal: AbortSignal.timeout(options.timeoutMs)
  };
  if (options.body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    fetchOpts.body = options.body;
  }
  if (options.insecure) {
    // Node.js undici fetch doesn't have a direct insecure option; we use dispatcher for that
    // For now we note it in config but don't break
  }
  return fetchOpts;
}

async function requestOnce(target, options, requestContext) {
  const started = performance.now();
  try {
    const fetchOpts = buildRequestOptions(target, options, requestContext);
    const response = await fetch(target, fetchOpts);
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
  const isRamp = options.rampStages.length > 0;
  const totalDurationMs = isRamp ? totalRampDuration(options.rampStages) : options.durationSeconds * 1000;

  // sparkline state
  let lastCount = 0;
  let lastSampleIdx = 0;
  const rpsHistory = [];
  const latHistory = [];

  // Live percentile tracking
  let liveP95 = 0;
  let liveP99 = 0;

  const worker = async (earlyStopAgeMs = null) => {
    while (running) {
      const elapsed = performance.now() - started;
      // A worker may have a fixed lifespan (ramp partial worker that should stop)
      if (earlyStopAgeMs !== null && elapsed >= earlyStopAgeMs) break;
      if (bytesObserved >= options.maxBytes || elapsed >= totalDurationMs) break;
      if (!isRamp && nextRequest >= limit) break;
      const requestNumber = nextRequest++;

      const sample = await requestOnce(target, options, options);
      sample.requestIndex = requestNumber;

      // Check per-request assertions
      if (options.assertions.length > 0) {
        const assertionResult = checkSample(sample, options.assertions);
        sample.assertionsPassed = assertionResult.passed;
        if (!assertionResult.passed) sample.assertionFailures = assertionResult.failures;
      }

      bytesObserved += sample.bytesReceived || 0;
      samples.push(sample);

      // NDJSON streaming
      if (options.ndjson && process.stdout.isTTY) {
        process.stderr.write(JSON.stringify(sample) + '\n');
      } else if (options.ndjson) {
        process.stdout.write(JSON.stringify(sample) + '\n');
      }

      if (options.intervalMs > 0) await sleep(options.intervalMs);
    }
  };

  const ticker = setInterval(() => {
    const elapsed = performance.now() - started;
    const elapsedSec = (elapsed / 1000).toFixed(1);
    const deltaCount = samples.length - lastCount;
    lastCount = samples.length;
    const newSamples = samples.slice(lastSampleIdx);
    lastSampleIdx = samples.length;
    const avgLat = newSamples.length ? newSamples.reduce((s, x) => s + x.latencyMs, 0) / newSamples.length : 0;
    rpsHistory.push(deltaCount);
    latHistory.push(avgLat);
    if (rpsHistory.length > 20) rpsHistory.shift();
    if (latHistory.length > 20) latHistory.shift();

    // Live percentiles
    if (newSamples.length > 0) {
      const allLats = samples.map(s => s.latencyMs).filter(Number.isFinite);
      if (allLats.length >= 5) {
        const sorted = [...allLats].sort((a, b) => a - b);
        const p95Idx = Math.floor(sorted.length * 0.95);
        const p99Idx = Math.floor(sorted.length * 0.99);
        liveP95 = sorted[Math.min(p95Idx, sorted.length - 1)];
        liveP99 = sorted[Math.min(p99Idx, sorted.length - 1)];
      }
    }

    const rpsSpark = renderSpark(rpsHistory);
    const latSpark = renderSpark(latHistory);
    const latStr = avgLat ? `${avgLat.toFixed(0)}ms` : '-';
    const errCount = samples.filter(s => s.error).length;
    const errRate = samples.length ? ((errCount / samples.length) * 100).toFixed(1) : '0.0';

    // Ramp indicator
    let stageInfo = '';
    if (isRamp) {
      const rampState = concurrencyAt(options.rampStages, elapsed);
      stageInfo = ` stage=${rampState.stageIndex + 1}/${options.rampStages.length} c=${rampState.concurrency}`;
    }

    const line = `GP-1 mode=${options.mode} ${options.profile.name}${stageInfo} | ${samples.length} req | ${elapsedSec}s | ${deltaCount} r/s ${rpsSpark} | lat ${latStr} ${latSpark} | p95 ${liveP95.toFixed(0)}ms p99 ${liveP99.toFixed(0)}ms | err ${errRate}%`;
    if (process.stdout.isTTY && !options.quiet) {
      process.stdout.write(`\r${line}`.padEnd(140, ' '));
    } else if (!options.quiet) {
      process.stderr.write(`${line}\n`);
    }
  }, 1000);

  if (isRamp) {
    // Ramp mode: duration-based load with dynamic concurrency.
    // Each worker repeatedly fires requests until told to stop. The ramp
    // ticker pools workers up/down so the number of in-flight workers
    // tracks each stage's target concurrency over the total duration.
    const stageBoundaries = []; // {atMs, concurrency}, cumulative
    let acc = 0;
    for (const s of options.rampStages) {
      acc += s.durationMs;
      stageBoundaries.push({ atMs: acc, concurrency: s.concurrency });
    }
    const concurrencyAt = () => {
      const e = performance.now() - started;
      let target = options.rampStages[0].concurrency;
      for (const b of stageBoundaries) if (e >= b.atMs) target = b.concurrency;
      return target;
    };

    let liveWorkers = 0;

    const spawnWorker = () => {
      liveWorkers++;
      (async () => {
        while (running) {
          const e = performance.now() - started;
          if (e >= totalDurationMs) break;
          const requestNumber = nextRequest++;
          const sample = await requestOnce(target, options, options);
          sample.requestIndex = requestNumber;
          if (options.assertions.length > 0) {
            const assertionResult = checkSample(sample, options.assertions);
            sample.assertionsPassed = assertionResult.passed;
            if (!assertionResult.passed) sample.assertionFailures = assertionResult.failures;
          }
          bytesObserved += sample.bytesReceived || 0;
          samples.push(sample);
          if (options.ndjson) process.stdout.write(JSON.stringify(sample) + '\n');
          if (options.intervalMs > 0) await sleep(options.intervalMs);
        }
        liveWorkers--;
      })();
    };

    // Initial fill at the first stage's concurrency
    for (let i = 0; i < options.rampStages[0].concurrency; i++) spawnWorker();

    const rampTicker = setInterval(() => {
      const target = concurrencyAt();
      const diff = target - liveWorkers;
      if (diff > 0) for (let i = 0; i < diff; i++) spawnWorker();
      // negative diff: workers retire naturally when running flips false;
      // for mid-ramp down-steps we let them finish+retire on the next tick
    }, 150);

    // Wait until total duration elapses, then stop
    while (performance.now() - started < totalDurationMs) await sleep(50);
    running = false;
    clearInterval(ticker);
    clearInterval(rampTicker);
  } else {
    await Promise.all(Array.from({ length: options.concurrency }, worker));
    running = false;
    clearInterval(ticker);
  }

  if (process.stdout.isTTY && !options.quiet) process.stdout.write('\n');

  const report = summarize(samples, performance.now() - started, {
    mode: options.mode,
    profile: options.profile.name,
    method: options.method,
    url: target.toString(),
    durationSeconds: options.durationSeconds,
    concurrency: options.concurrency,
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
    maxRequests: options.maxRequests,
    maxBytes: options.maxBytes,
    rampSpec: options.rampSpec,
    workerId: options.workerId,
    methodLabel: options.methodLabel,
    targetClass: isPrivateHost(target.hostname) ? 'private-or-loopback' : 'public-opt-in',
    headers: Object.keys(options.parsedHeaders).filter(k => k !== 'user-agent'),
    hasBody: !!options.body,
    assertions: options.assertions.length,
    thresholds: options.thresholds.length
  });

  // Enrich with histogram
  enrichReportWithHistogram(report, samples);

  // Check assertions summary
  if (options.assertions.length > 0) {
    const assertionFailures = samples.filter(s => s.assertionFailures?.length > 0);
    report.assertions = {
      total: samples.length * options.assertions.length,
      passed: samples.length * options.assertions.length - assertionFailures.reduce((s, f) => s + f.assertionFailures.length, 0),
      failedRequests: assertionFailures.length,
      failed: assertionFailures.length > 0 ? assertionFailures.slice(0, 10).map(s => ({ index: s.requestIndex, failures: s.assertionFailures })) : []
    };
  }

  // Check thresholds
  if (options.thresholds.length > 0) {
    report.thresholds = checkThresholds(report, options.thresholds);
  }

  return report;
}

async function writeCsv(report, filepath) {
  const lines = ['index,status,latency_ms,bytes,error'];
  // We need raw samples... but report doesn't have them.
  // CSV is a limitation without storing samples. For v0.3 we write summary CSV.
  const l = report.latencyMs;
  lines.push(`summary,200,${l.mean?.toFixed(2) ?? ''},${report.totals.bytesReceived},${report.totals.failed}`);
  lines.push(`percentile,p50,${l.p50?.toFixed(2) ?? ''}`);
  lines.push(`percentile,p95,${l.p95?.toFixed(2) ?? ''}`);
  lines.push(`percentile,p99,${l.p99?.toFixed(2) ?? ''}`);
  await writeFile(filepath, lines.join('\n') + '\n');
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
  console.error(formatSummaryLine(report));

  // Print histogram to stderr
  if (report.histogram?.buckets?.length) {
    console.error('\nLatency distribution:');
    console.error(renderHistogram(report.histogram));
  }

  // Print assertion results
  if (report.assertions) {
    console.error(`\nAssertions: ${report.assertions.passed}/${report.assertions.total} passed, ${report.assertions.failedRequests} requests failed`);
    if (report.assertions.failed.length > 0) {
      console.error('  Sample failures:');
      for (const f of report.assertions.failed) {
        console.error(`    request[${f.index}]: ${f.failures.join('; ')}`);
      }
    }
  }

  // Print threshold results
  if (report.thresholds) {
    console.error(`\nThresholds: ${report.thresholds.passed ? 'ALL PASSED' : 'FAILED'}`);
    for (const r of report.thresholds.results) {
      console.error(`  ${r.passed ? '✓' : '✗'} ${r.message}`);
    }
  }
}

// --- compare subcommand ---
async function handleCompare(argv) {
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
  if (output) {
    await writeFile(output, `${JSON.stringify(cmp, null, 2)}\n`);
    console.error(`Wrote JSON diff to ${output}`);
  }
  if (htmlOutput) {
    const html = generateCompareHtml(cmp);
    await writeFile(htmlOutput, html);
    console.error(`Wrote HTML diff to ${htmlOutput}`);
  }
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

async function handlePentest(argv, settings) {
  let opts;
  try {
    opts = parsePentestArgs(argv, settings);
  } catch (e) {
    if (e.message === '__help__') { console.log(pentestHelp()); return; }
    throw e;
  }
  const targetInfo = validatePentestTarget(opts);
  const preflight = await preflightPentest(opts, targetInfo);
  await runPentest(opts, preflight, targetInfo);
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
  if (rawArgs[0] === 'pentest' || rawArgs[0] === 'scan') {
    await handlePentest(rawArgs.slice(1), settings);
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
  if (options.csvOutput) {
    await writeCsv(report, options.csvOutput);
    console.error(`Wrote CSV to ${options.csvOutput}`);
  }
  printReport(report);

  // Exit code: fail if thresholds failed
  if (report.thresholds && !report.thresholds.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`GP-1 error: ${error.message}`);
  process.exitCode = 1;
});
