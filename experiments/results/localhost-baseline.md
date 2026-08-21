# GP-1 mode=0 localhost baseline

This run was performed on **2026-08-21** against the repository's own demo server at `127.0.0.1:8123/health`. It is a controlled functional and measurement check, not a capacity claim for an external service.

| Parameter | Value |
| --- | ---: |
| Mode | `0` (`safe-observation`) |
| Duration | 5 seconds |
| Concurrency | 4 workers |
| Per-worker interval | 50 ms |
| Timeout | 5,000 ms |
| Request cap | 400 |
| Requests completed | 300 |
| Successful | 300 (100%) |
| Failed | 0 |
| Throughput | 59.47 requests/second |
| p50 latency | 15.94 ms |
| p95 latency | 16.91 ms |
| p99 latency | 28.90 ms |
| Maximum latency | 83.16 ms |
| Status codes | 300 × 200 |

## What this says

Under this exact local configuration, GP-1 completed 300 health requests in approximately five seconds with no observed request failures. The demo server intentionally waits about 15 ms before replying, so the measured p50 and p95 values are consistent with a small local delay plus client and event-loop overhead.

The measured impact is limited to the controlled demo process and this machine. It does **not** establish maximum capacity, production SLO compliance, or the effect on any public or third-party service. A responsible staging experiment would pair GP-1 data with server-side CPU, memory, queue, saturation, and error-rate telemetry collected by the system owner.

The raw report is available in [`localhost-baseline.json`](localhost-baseline.json). The command and method are documented in [`../README.md`](../README.md).
