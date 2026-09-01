# GP-1 performance-engineering roadmap

## What the latest run actually shows

The latest run used 10,000 logical jobs per labeled method against the project-owned loopback benchmark target. The highest completed transfer was the 128 KiB method at 1,073.88 MiB, 71.14 MiB/s, and 8,591 completed jobs before the 120-second stage limit. The 64 KiB method completed all 10,000 jobs at 37.03 MiB/s. These values describe this client, process, target, and environment; they are not production capacity claims.

The main bottleneck signal is tail latency and stage duration rather than target HTTP errors. Client p95 was roughly 751–904 ms across the payload methods, while target-side status remained HTTP 200 for the completed target observations. The next useful work is therefore not merely increasing worker count. It is separating client scheduling, connection-pool saturation, event-loop delay, response buffering, target CPU/RSS, and network throughput.

## Recommended development direction

| Priority | Area | Development work | Success measure |
| --- | --- | --- | --- |
| 1 | Measurement integrity | Add per-stage and per-worker histograms, queue wait time, connect time, first-byte time, body-read time, and explicit timeout classification. | A run can identify whether latency comes from scheduling, socket acquisition, target processing, or body transfer. |
| 2 | Transport | Compare keep-alive pool sizes, HTTP/1.1 reuse, payload streaming, and bounded connection acquisition. | Higher useful bytes/s without hiding increased p95, timeout, or error rates. |
| 3 | Target observability | Add request queue depth, active requests, response bytes, CPU, RSS, event-loop delay, and periodic snapshots. | Client and target totals reconcile within a documented tolerance. |
| 4 | Capacity model | Add staged saturation runs that increase one dimension at a time: concurrency, payload, duration, and request rate. | A reproducible saturation curve identifies the first limiting resource. |
| 5 | Recovery | Add cool-down and post-load probes with fixed intervals and before/after comparisons. | Recovery time and residual latency are reported separately from peak-load results. |
| 6 | Reproducibility | Store exact commit, settings, machine information, target version, method label, worker label, and raw JSON. | Another engineer can reproduce the same experiment and explain variance. |

## What not to optimize for

A large worker count or a large multiplier by itself is not a useful capacity result. Combining every dimension at once can make the client, operating system, or benchmark proxy the bottleneck before the target is meaningfully exercised. GP-1 should therefore report both **offered load** and **accepted/observed load**, and should mark any client-side timeout or transport failure instead of treating it as a target failure.

## Suggested positioning

GP-1 should be presented as a **reproducible performance and resilience laboratory**. Its strongest differentiator is not an extreme number of workers; it is the ability to explain why a run saturates, reconcile client and target telemetry, quantify tail latency, and document recovery with raw evidence.
