# GP-1 controlled saturation plan

The saturation run increases offered load in fixed stages and stops automatically when a target-side threshold is crossed. It never relies on an unmeasured or open-ended load.

| Signal | Stop threshold | Reason |
| --- | ---: | --- |
| Target HTTP failure rate | 1% in a stage | Treat the target as leaving the healthy envelope. |
| Client timeout rate | 1% in a stage | Separate client/transport saturation from target HTTP errors. |
| Target p95 latency | 1,000 ms | Mark a clear tail-latency boundary. |
| Event-loop p95 | 250 ms | Prevent prolonged event-loop starvation. |
| RSS increase | 256 MiB from baseline | Stop before the benchmark process grows without bound. |
| Sustained stage duration | 30 s | Keep each observation comparable and recoverable. |
| Maximum worker level | 400 local workers | Bound the lab run while allowing a useful ramp. |

The report records the last completed stage, the first threshold crossed, the offered load, the accepted target requests, total bytes, bandwidth, p95/p99, status codes, timeout counts, CPU, RSS, event-loop delay, and recovery probes. The saturation point is the first stage that crosses a threshold; it is not described as damage or as a universal production limit.
