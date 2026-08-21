import http from 'node:http';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

const port = Number(process.env.PORT || 8125);
const maxDelayMs = 250;
const maxPayloadBytes = 4 * 1024 * 1024;
const publicPrefix = process.env.PUBLIC_PREFIX || '';
const startedAt = new Date().toISOString();
const eventLoopMonitor = monitorEventLoopDelay({ resolution: 10 });
eventLoopMonitor.enable();
let requestSequence = 0;
const metrics = {
  startedAt,
  totalRequests: 0,
  totalResponseBytes: 0,
  activeRequests: 0,
  maxActiveRequests: 0,
  byPath: {},
  byStatus: {},
  latencyMs: { count: 0, min: null, max: null, mean: 0, p50: null, p95: null, samples: [] }
};

function record(path, status, latencyMs, responseBytes) {
  metrics.totalRequests += 1;
  metrics.totalResponseBytes += responseBytes;
  metrics.byPath[path] = (metrics.byPath[path] || 0) + 1;
  metrics.byStatus[status] = (metrics.byStatus[status] || 0) + 1;
  const latency = metrics.latencyMs;
  latency.count += 1;
  latency.min = latency.min === null ? latencyMs : Math.min(latency.min, latencyMs);
  latency.max = latency.max === null ? latencyMs : Math.max(latency.max, latencyMs);
  latency.mean += (latencyMs - latency.mean) / latency.count;
  latency.samples.push(latencyMs);
  if (latency.samples.length > 10000) latency.samples.shift();
  const ordered = [...latency.samples].sort((a, b) => a - b);
  latency.p50 = ordered[Math.floor((ordered.length - 1) * 0.5)];
  latency.p95 = ordered[Math.floor((ordered.length - 1) * 0.95)];
}

function payload() {
  const { samples, ...summary } = metrics.latencyMs;
  return {
    ...metrics,
    latencyMs: summary,
    eventLoopDelayMs: {
      mean: eventLoopMonitor.mean / 1e6,
      p95: eventLoopMonitor.percentile(95) / 1e6,
      max: eventLoopMonitor.max / 1e6
    },
    uptimeSeconds: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };
}

const server = http.createServer((request, response) => {
  const started = performance.now();
  const sequence = requestSequence++;
  const parsed = new URL(request.url, 'http://127.0.0.1');
  const path = publicPrefix && parsed.pathname.startsWith(publicPrefix)
    ? parsed.pathname.slice(publicPrefix.length) || '/'
    : parsed.pathname;
  if (publicPrefix && !parsed.pathname.startsWith(publicPrefix)) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  metrics.activeRequests += 1;
  metrics.maxActiveRequests = Math.max(metrics.maxActiveRequests, metrics.activeRequests);

  let delayMs = 0;
  let status = 200;
  let body;
  let contentType = 'application/json';

  if (path === '/health') {
    body = { ok: true, service: 'GP-1 temporary public test server', mode: 'network-test' };
  } else if (path === '/slow') {
    delayMs = Math.min(Math.max(Number(parsed.searchParams.get('ms') || 50), 0), maxDelayMs);
    body = { ok: true, service: 'GP-1 temporary public test server', delayMs };
  } else if (path === '/payload') {
    const bytes = Math.min(Math.max(Number(parsed.searchParams.get('bytes') || 1024), 1), maxPayloadBytes);
    body = Buffer.alloc(bytes, 0x47);
    contentType = 'application/octet-stream';
  } else if (path === '/fault') {
    const rate = Math.min(Math.max(Number(parsed.searchParams.get('rate') || 0.1), 0), 0.5);
    const bucket = sequence % 100;
    if (bucket < Math.round(rate * 100)) {
      status = 503;
      body = { ok: false, service: 'GP-1 temporary public test server', fault: 'controlled fault profile' };
    } else {
      body = { ok: true, service: 'GP-1 temporary public test server', faultRate: rate };
    }
  } else if (path === '/metrics') {
    body = payload();
  } else {
    status = 404;
    body = { ok: false, error: 'not found' };
  }

  setTimeout(() => {
    const output = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(path === '/metrics' ? payload() : body));
    response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store', 'content-length': output.byteLength });
    response.end(output);
    if (path !== '/metrics') record(path, status, performance.now() - started, output.byteLength);
    metrics.activeRequests = Math.max(metrics.activeRequests - 1, 0);
  }, delayMs);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GP-1 temporary public test server listening on port ${port}`);
  console.log(`Public namespace: ${publicPrefix || '/'}`);
  console.log('Endpoints: /health, /slow?ms=50, /payload?bytes=2097152, /fault?rate=0.1, /metrics');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
