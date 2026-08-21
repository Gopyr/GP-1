# GP-1 controlled saturation report

**Target:** project-owned GP-1 benchmark server on loopback.  
**Ramp:** concurrency 25 → 50 → 100 → 200 → 400, 30 seconds per stage, 64 KiB payload.  
**Control:** auto-cut thresholds were active; no threshold was crossed in this run.

| Stage | Concurrency | Target requests | Target bytes | Target p95 | Event-loop p95 | Event-loop max | RSS delta | Target failures | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| c25 | 25 | 4120 | 257.50 MiB | 25.32 ms | 18.71 ms | 34.93 ms | 48.90 MiB | 0 | `{'200': 4120}` |
| c50 | 50 | 4145 | 259.06 MiB | 95.92 ms | 67.44 ms | 129.89 ms | 23.77 MiB | 0 | `{'200': 4145}` |
| c100 | 100 | 4195 | 262.19 MiB | 243.26 ms | 90.18 ms | 352.32 ms | 3.66 MiB | 0 | `{'200': 4195}` |
| c200 | 200 | 4295 | 268.44 MiB | 440.73 ms | 105.19 ms | 557.32 ms | 2.61 MiB | 0 | `{'200': 4295}` |
| c400 | 400 | 4605 | 287.81 MiB | 476.07 ms | 206.31 ms | 559.42 ms | 9.75 MiB | 0 | `{'200': 4605}` |

## Findings

The highest completed stage was **400 concurrency**. Across that stage, the target recorded **4605 requests** and **287.81 MiB** of response bytes with target p95 **476.07 ms** and event-loop p95 **206.31 ms**.
No target HTTP failures were observed; the final stage status delta was `{'200': 4605}`. No auto-cut threshold was crossed. The run therefore identifies a measured point inside the target's envelope, not a failure limit.
The next meaningful capacity step is to move the benchmark target to a separately provisioned lab host and repeat the same ramp while collecting host network, CPU, memory, socket, and queue metrics. Increasing local traffic alone would mostly measure the sandbox and client limits.
