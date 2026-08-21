import http from 'node:http';
import { performance } from 'node:perf_hooks';

const port = Number(process.env.PORT || 8125);
const maxDelayMs = 250;
const publicPrefix = process.env.PUBLIC_PREFIX || '';
const startedAt = new Date().toISOString();
let requestSequence = 0;
const metrics = {
  startedAt,
  totalRequests: 0,
  byPath: {},
  byStatus: {},
  latencyMs: { count: 0, min: null, max: null, mean: 0, p50: null, p95: null, samples: [] }
};

function record(path, status, latencyMs) {
  metrics.totalRequests += 1;
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
  return { ...metrics, latencyMs: summary, uptimeSeconds: process.uptime(), memory: process.memoryUsage(), cpu: process.cpuUsage() };
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
  let delayMs = 0;
  let status = 200;
  let body;

  if (path === '/health') {
    body = { ok: true, service: 'GP-1 temporary public test server', mode: 'network-test' };
  } else if (path === '/slow') {
    delayMs = Math.min(Math.max(Number(parsed.searchParams.get('ms') || 50), 0), maxDelayMs);
    body = { ok: true, service: 'GP-1 temporary public test server', delayMs };
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
    const output = path === '/metrics' ? payload() : body;
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(output));
    if (path !== '/metrics') record(path, status, performance.now() - started);
  }, delayMs);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GP-1 temporary public test server listening on port ${port}`);
  console.log(`Public namespace: ${publicPrefix || '/'}`);
  console.log('Endpoints: /health, /slow?ms=50, /fault?rate=0.1, /metrics');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
