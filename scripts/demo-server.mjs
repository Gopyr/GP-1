import http from 'node:http';

const port = Number(process.env.PORT || 8123);
const delayMs = Math.max(0, Math.min(Number(process.env.DELAY_MS || 15), 5000));
const failEvery = Math.max(0, Math.min(Number(process.env.FAIL_EVERY || 0), 1000));
let requestCount = 0;

const server = http.createServer((request, response) => {
  requestCount += 1;
  if (request.url === '/health') {
    const shouldFail = failEvery > 0 && requestCount % failEvery === 0;
    setTimeout(() => {
      if (shouldFail) {
        response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: false, service: 'GP-1 local demo', reason: 'controlled fault injection' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true, service: 'GP-1 local demo', delayMs }));
    }, delayMs);
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`GP-1 demo server listening on http://127.0.0.1:${port}/health`);
  console.log(`Controlled profile: delay=${delayMs}ms, failEvery=${failEvery || 'off'}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
