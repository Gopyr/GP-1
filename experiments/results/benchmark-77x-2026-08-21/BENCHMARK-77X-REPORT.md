# GP-1 77x benchmark report

**Target:** GP-1 benchmark server owned by the project on loopback.  
**Transport:** Undici keep-alive pool with up to 100 connections.  
**Stages:** warm-up, sustained load, 1 MiB high-capacity, controlled fault, and recovery.

## Summary

| Stage | Client requests | Client success | Client MiB/s | Client p95 | Target p95 | Target status | CPU user ms | RSS delta MiB | Event-loop p95 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| warmup-1k | 1000 | 100.00% | 0.05 | 4.43 ms | 1.91 ms | `{'200': 1000}` | 468.42 | 8.96 | 10.26 ms |
| sustained-64k | 2097 | 100.00% | 82.61 | 63.49 ms | 32.59 ms | `{'200': 2097}` | 1616.93 | 46.90 | 10.97 ms |
| high-capacity-1m | 611 | 100.00% | 511.08 | 280.99 ms | 46.74 ms | `{'200': 611}` | 837.08 | 65.05 | 13.70 ms |
| controlled-fault-64k | 2000 | 90.00% | 0.05 | 82.43 ms | 54.63 ms | `{'503': 200, '200': 1800}` | 2653.71 | 2.37 | 31.34 ms |
| recovery-1k | 2000 | 100.00% | 0.04 | 13.65 ms | 51.79 ms | `{'503': 0, '200': 2000}` | 3850.68 | 0.00 | 27.21 ms |

## Findings

The 1 MiB high-capacity stage delivered **511.08 MiB/s** at **100 concurrent workers**, with **611.00 MiB** received and **280.99 ms** client p95. Relative to the 1 KiB warm-up, the observed client bandwidth multiplier was **9435.48x** under the changed payload and concurrency profile.
The target recorded **611 requests**, target p95 **46.74 ms**, event-loop p95 **13.70 ms**, approximately **837.08 ms** of user CPU, and an RSS delta of **65.05 MiB** during the stage.
The controlled fault stage produced target status counts `{'503': 200, '200': 1800}`. This separates target-generated failures from client/network failures and gives the report a measurable error impact rather than a request-count-only result.
The recovery stage returned **13.65 ms** client p95 after the stress and fault stages, compared with **4.43 ms** during warm-up. This is the recovery observation for this process and environment, not a general production guarantee.

## Interpretation

The 77x label describes a multi-dimensional stress matrix. The largest observed bandwidth multiplier is a real measurement from the project-owned benchmark target, but it combines payload size, concurrency, and keep-alive transport. Target-side telemetry is reported separately so client bandwidth is not confused with application capacity.

Raw JSON reports, target snapshots, and the machine-readable summary are stored in this directory.
