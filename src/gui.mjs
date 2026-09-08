import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3199;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve static UI
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = await readFile(join(__dirname, 'gui', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${e.message}`);
    }
    return;
  }

  // Serve Event Stream (SSE)
  if (req.method === 'GET' && url.pathname === '/api/run') {
    const targetUrl = url.searchParams.get('url');
    const method = url.searchParams.get('method') || 'GET';
    const concurrency = url.searchParams.get('concurrency') || '10';
    const duration = url.searchParams.get('duration') || '10';
    const body = url.searchParams.get('body');

    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing url parameter');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write('retry: 10000\n\n');

    // Build args for GP-1 child run
    const args = [
      join(__dirname, 'cli.mjs'),
      '-u', targetUrl,
      '-m', method,
      '-c', concurrency,
      '-d', duration
    ];
    if (body) {
      args.push('--body', body);
    }
    args.push('--ndjson');

    const cp = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrBuffer = '';
    
    // Stderr contains live ticker lines on non-TTY
    cp.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop(); // keep partial last line

      for (const line of lines) {
        // Parse ticker progress: GP-1 mode=... | 78 req | 2.0s | 40 r/s...
        if (line.includes('req |')) {
          const matchReq = line.match(/\|\s*(\d+)\s*req/);
          const matchRps = line.match(/\|\s*(\d+)\s*r\/s/);
          const matchLat = line.match(/lat\s*(\d+)ms/);
          const matchErr = line.match(/err\s*([\d\.]+)%/);
          const matchP95 = line.match(/p95\s*(\d+)ms/);
          const matchSec = line.match(/\|\s*([\d\.]+)\s*s/);

          const rps = matchRps ? parseInt(matchRps[1], 10) : 0;
          const reqCount = matchReq ? parseInt(matchReq[1], 10) : 0;
          const lat = matchLat ? parseInt(matchLat[1], 10) : 0;
          const err = matchErr ? parseFloat(matchErr[1]) : 0;
          const p95 = matchP95 ? parseInt(matchP95[1], 10) : 0;
          const elapsed = matchSec ? parseFloat(matchSec[1]) : 0;

          res.write(`data: ${JSON.stringify({
            type: 'tick',
            req: reqCount,
            rps,
            lat,
            p95,
            err,
            elapsed
          })}\n\n`);
        }
      }
    });

    cp.on('close', (code) => {
      if (code === 0) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Exit code ${code}` })}\n\n`);
      }
      res.end();
    });

    req.on('close', () => {
      cp.kill('SIGINT');
    });

    return;
  }

  // Not Found
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

export function startGuiServer() {
  server.listen(PORT, () => {
    const localUrl = `http://localhost:${PORT}`;
    console.log(`\n[GP-1 GUI] Server berjalan di ${localUrl}`);
    console.log(`[GP-1 GUI] Membuka browser otomatis...`);

    // Auto-open browser
    const startCmd = process.platform === 'darwin' ? 'open'
                   : process.platform === 'win32' ? 'start'
                   : 'xdg-open';
    exec(`${startCmd} ${localUrl}`).unref();
  });
}
