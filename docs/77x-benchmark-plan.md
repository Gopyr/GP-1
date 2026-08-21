# GP-1 77x benchmark plan

The 77x label is a test matrix, not a claim that one number becomes 77 times larger. Each dimension is compared with a named baseline and reported separately.

| Dimension | Baseline | 77x stress stage | Measurement |
| --- | --- | --- | --- |
| Payload | 1 KiB | 1 MiB | Bytes received and MiB/s |
| Concurrency | 10 workers | 100 workers | Target max active requests |
| Duration | 5 s | 60 s | Completed requests and recovery |
| Request cap | 1,000 | 5,000 | Exact completed/requested counts |
| Transport | Default small run | 100-connection keep-alive pool | Client throughput and latency |
| Fault | No injected fault | 10% controlled target fault | Target 5xx and client error split |
| Observability | Latency/status | CPU, RSS, event-loop delay, active requests | Before/after resource deltas |

The stress sequence is warm-up, sustained load, high-capacity payload, controlled fault, and recovery. Each stage has a duration and byte/request cap. The report must identify whether a boundary came from the target, the client runtime, or an intermediate proxy.

A significant report includes actual bandwidth, request throughput, p50/p95/p99/max latency, status distribution, error rate, target CPU, RSS, event-loop delay, maximum active requests, and recovery comparison. It does not call a small sample a system-wide capacity limit.
