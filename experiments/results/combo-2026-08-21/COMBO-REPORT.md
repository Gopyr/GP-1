# GP-1 combo benchmark report

**Target:** GP-1 benchmark server owned by the project on loopback.  
**Transport:** Undici keep-alive pool with up to 400 connections.  
**Combination:** sustained 64 KiB, burst 2 MiB/200 workers, and recovery.

| Stage | Client requests | Success | Bytes | MiB/s | Client p95 | Target p95 | CPU user ms | RSS delta MiB | Event-loop p95 | Max active |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-1k | 1000 | 100.00% | 0.98 MiB | 0.70 | 4.84 ms | 2.00 ms | 382.53 | 10.36 | 10.27 ms | 8 |
| sustained-64k | 8291 | 100.00% | 518.19 MiB | 50.50 | 266.21 ms | 151.67 ms | 10378.15 | 64.36 | 91.88 ms | 100 |
| burst-2m | 583 | 100.00% | 1166.00 MiB | 413.55 | 2001.68 ms | 162.30 ms | 1703.03 | 57.23 | 97.26 ms | 120 |
| recovery-1k | 2000 | 100.00% | 1.95 MiB | 0.42 | 16.06 ms | 161.82 ms | 4441.66 | 0.00 | 77.73 ms | 120 |

## Findings

The burst stage transferred **1166.00 MiB** at **413.55 MiB/s** with **200 workers** and **2001.68 ms** client p95. The total-volume multiplier over the 1 KiB baseline was **1193.98x**; the bandwidth multiplier was **589.02x** under the combined payload/concurrency/transport profile.
Target telemetry during the burst recorded p95 **162.30 ms**, event-loop p95 **97.26 ms**, user CPU **1703.03 ms**, RSS delta **57.23 MiB**, and maximum observed active requests **120**.
The recovery stage returned **16.06 ms** client p95 and `{'200': 2000}` target statuses after the combined load. These are measurements of this benchmark process and environment.

## Interpretation

This is a larger combo experiment than the previous single-axis stages. The report separates volume multiplier from bandwidth multiplier and records the bottleneck indicators instead of treating a large multiplier as a universal capacity claim.
