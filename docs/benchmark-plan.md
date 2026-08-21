# GP-1 benchmark plan

The previous public run was useful as a network-path observation, but it was too small to characterize a system. This plan makes the next run stronger without confusing a gateway limit with application saturation.

## Profiles

| Profile | Concurrency | Duration | Request cap | Purpose |
| --- | ---: | ---: | ---: | --- |
| Warm-up | 10 | 30 s | 1,000 | Establish a clean baseline and warm connection pools. |
| Load | 50 | 90 s | 10,000 | Measure steady-state throughput and tail latency. |
| Saturation | 100 | 120 s | 25,000 | Find the first sustained error/latency boundary on the owned benchmark target. |
| Recovery | 10 | 60 s | 2,000 | Check whether latency and error rate return toward baseline after the high-load stage. |

These are sequential stages against the same temporary benchmark target. The target owner can stop the run at any time. The runner stops a stage when its duration or request cap is reached; the analysis marks a stage as saturated when the target-side error rate or p95 latency crosses the configured threshold.

## Measurements

GP-1 client reports should include request count, completed rate, status-code distribution, timeout/network errors, mean/p50/p95/p99/max latency, and stage configuration. The target should expose request count, status counts, queue/active-request count, event-loop delay, CPU usage, RSS/heap, and target-side latency percentiles.

The report must keep three classes of failure separate: target-generated failures such as 5xx, gateway/proxy failures such as 429, and client-side timeouts or connection errors. A proxy 429 is not an application crash.

## Stop conditions

The benchmark is limited to a target owned by the project or an explicitly authorized staging target. A run must stop if the target owner requests it, if the target becomes unavailable, if error rate exceeds 20% for two consecutive observation windows, or if the target's memory rises continuously without recovery. No stage is unbounded, distributed, or designed to evade rate controls.

## Acceptance criteria

A useful result is not the largest request number. It is a reproducible saturation curve showing how throughput, tail latency, target errors, gateway errors, CPU, memory, and recovery behavior change from warm-up through recovery.
