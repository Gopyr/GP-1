# GP-1 10,000 logical jobs plan

This benchmark uses 10,000 scheduled jobs per named method against the project-owned loopback target. It uses up to 400 concurrent workers inside one local runner; it does not create hidden identities or distributed agents.

| Method | Endpoint | Jobs | Payload/behavior | Output |
| --- | --- | ---: | --- | --- |
| `payload-1k` | `/payload?bytes=1024` | 10,000 | Small-payload transport baseline | requests, bytes/s, latency, errors |
| `payload-64k` | `/payload?bytes=65536` | 10,000 | Sustained transfer | requests, bytes/s, latency, errors |
| `payload-128k` | `/payload?bytes=131072` | 10,000 | Higher transfer stage | requests, bytes/s, latency, errors |
| `slow-25ms` | `/slow?ms=25` | 10,000 | Latency/queue behavior | requests, latency tail, timeouts, recovery |

Each stage writes its own JSON report and log. The combined log records total requests, successes, failures, bytes, MiB/s, status codes, errors, p95/p99, and elapsed time. The target metrics snapshots record CPU, RSS, event-loop delay, active requests, and target status codes.
