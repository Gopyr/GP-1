# GP-1 combo benchmark plan

This run combines dimensions instead of increasing only one request count. The comparison unit is the project-owned benchmark server and the report records actual bytes, requests, latency, target telemetry, and recovery.

| Stage | Payload | Workers | Duration | Request cap | Byte cap | Purpose |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Baseline | 1 KiB | 10 | 10 s | 1,000 | 4 MiB | Reference client and target overhead. |
| Sustained | 64 KiB | 100 | 60 s | 10,000 | 512 MiB | Hold a high request rate for a longer window. |
| Burst | 2 MiB | 200 | 30 s | 2,000 | 768 MiB | Combine larger payload with high concurrency and no interval. |
| Recovery | 1 KiB | 10 | 20 s | 2,000 | 8 MiB | Measure return toward baseline after the combined stages. |

The combo scale is thousands of times larger in transferred bytes than the previous 1 KiB warm-up, but the report does not call that a universal server capacity number. It reports where the limit appears: request generation, keep-alive pool, payload transfer, target CPU, RSS, event-loop delay, target status codes, or recovery.

The target is the project's own benchmark server. The runner has fixed duration, request, byte, and worker caps, and the process is closed after the run.
