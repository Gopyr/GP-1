# GP-1 bandwidth plan

The phrase **100x bandwidth** is treated as a measurable experiment target, not a promise. GP-1 will report bytes received from the target and derived throughput in bytes/second and MiB/second. It will not infer bandwidth from request count alone.

## Measurement model

For each response, GP-1 consumes the body as a stream and counts bytes without storing the body. The report includes total bytes, bytes per second, MiB per second, response count, and latency percentiles. The target exposes a controlled `/payload?bytes=N` endpoint so response size is explicit and reproducible.

| Stage | Response size | Concurrency | Request cap | Purpose |
| --- | ---: | ---: | ---: | --- |
| Baseline | 1 KiB | 10 | 1,000 | Establish client and target overhead. |
| Throughput | 64 KiB | 50 | 5,000 | Measure useful sustained payload throughput. |
| High-capacity | 256 KiB | 100 | 10,000 | Push the owned target/client path toward a higher byte rate. |

The high-capacity stage is bounded by both request count and duration. If the target is exposed through a gateway, gateway 429 responses and gateway bandwidth must be separated from target-side bytes.

## What counts as success

A successful result reports the actual multiplier over the chosen baseline, the payload size, request rate, bytes per second, p95/p99 latency, status distribution, and target-side CPU/memory. If the environment cannot reach 100x because of a proxy, CPU, socket, or memory bottleneck, the report records that bottleneck instead of inventing a larger number.

The benchmark runs only against the project's own target or an explicitly authorized staging target. It does not add distributed coordination, unbounded loops, or evasion of gateway controls.
