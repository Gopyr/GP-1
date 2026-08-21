# GP-1 bandwidth benchmark

**Date:** 2026-08-21  
**Target:** GP-1 benchmark server owned by the project on loopback.  
**Transport:** Node.js `fetch` with an Undici keep-alive agent configured for up to 100 connections.  
**Accounting:** The client consumes each response body and counts bytes; bodies are not persisted.

## Results

| Stage | Payload | Concurrency | Requests | Bytes received | Client bandwidth | Client p95 | Target p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 1 KiB | 10 | 1,000 | 1.02 MB | 0.69 MiB/s | 4.86 ms | 1.99 ms |
| Throughput | 64 KiB | 50 | 1,073 | 70.32 MB | 88.49 MiB/s | 50.42 ms | 21.95 ms |
| High-capacity | 1 MiB | 100 | 227 | 238.03 MB | **435.22 MiB/s** | 273.45 ms | 34.97 ms |

## What the numbers show

The 64 KiB stage delivered **128.14x** the measured client bandwidth of the 1 KiB baseline. The 1 MiB stage delivered **630.24x** the baseline bandwidth. This multiplier is an observed result of changing payload size, concurrency, and transport utilization together; it is not a claim that the target has a universal 630x capacity increase.

The high-capacity stage delivered 238.03 MB across 227 successful responses at 435.22 MiB/s on the client side. The target-side snapshot measured approximately 337.39 MB/s for the same stage. The difference is expected from separate measurement windows and process/protocol overhead; both values are recorded rather than collapsed into one number.

Target-side p95 latency increased from 1.99 ms at the 1 KiB baseline to 34.97 ms at the 1 MiB stage. The target process RSS delta was approximately 141.22 MiB during the high-capacity stage. All 227 high-capacity responses were HTTP 200; the observed boundary in this run was latency and memory growth rather than target-generated errors.

## Configuration

```text
baseline:      10 concurrency, 10 ms interval, 5 s, 1,000 requests, 2 MiB cap
throughput:    50 concurrency, 0 ms interval, 15 s, 5,000 requests, 64 MiB cap
high-capacity: 100 concurrency, 0 ms interval, 20 s, 1,000 requests, 128 MiB cap
```

The client byte cap stopped the high-capacity stage after approximately 128 MiB of response data had been observed by the scheduler, although concurrent in-flight responses produced 238.03 MB in the final report. This overshoot is recorded and is a consequence of concurrent workers completing already-started transfers.

## Scope

This is a capacity measurement of the project's own benchmark server in the current sandbox environment. It should not be presented as a production capacity number or transferred to an unrelated target. The raw JSON reports and target-side metrics are stored beside this document.
