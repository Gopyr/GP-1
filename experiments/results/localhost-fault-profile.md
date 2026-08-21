# GP-1 mode=1 fault profile

This run used GP-1 `mode=1` against the included local demo server at `127.0.0.1:8124/health`. The demo server was configured with `DELAY_MS=40` and `FAIL_EVERY=10`. No public or third-party service was contacted.

| Parameter | Value |
| --- | ---: |
| Mode | `1` (`lab-experiment`) |
| Confirmation | `--lab-confirm` |
| Duration | 5 seconds |
| Concurrency | 4 workers |
| Per-worker interval | 50 ms |
| Timeout | 5,000 ms |
| Request cap | 400 |
| Requests completed | 216 |
| Successful | 195 (90.28%) |
| Failed | 21 (9.72%) |
| Throughput | 43.05 requests/second |
| p50 latency | 41.25 ms |
| p95 latency | 42.41 ms |
| p99 latency | 55.09 ms |
| Maximum latency | 107.02 ms |
| Status codes | 195 × 200, 21 × 503 |

## Comparison with mode=0 baseline

The mode=0 baseline completed 300 requests at 59.47 requests/second with p50 latency of 15.94 ms and p95 latency of 16.91 ms. Under the controlled mode=1 profile, the injected 40 ms delay increased p50 latency by approximately **25.31 ms** and p95 latency by approximately **25.50 ms**. The predictable `FAIL_EVERY=10` rule produced an observed 503 proportion of **9.72%**, close to the intended 10% profile.

This is the measurable impact of a deliberately injected local delay and failure pattern. It does not establish how an external service would behave, and it does not estimate a public system's breaking point. A real authorized staging study would pair GP-1 data with server-side CPU, memory, queue, saturation, and error-budget telemetry.
