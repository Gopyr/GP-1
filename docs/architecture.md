# GP-1 architecture

GP-1 keeps the measurement path compact but transport-capable: settings select a profile, the CLI validates the target and bounds, an Undici keep-alive pool serves concurrent workers, response streams are consumed for byte accounting, and the metrics layer converts observations into a versioned JSON report.

```mermaid
flowchart LR
    A[settings.json\nmode 0 or 1] --> B[CLI argument parser]
    B --> C[Target and bound validation]
    C --> D[Bounded worker pool]
    D -->     E[GET request observation\nkeep-alive pool]
    E --> F[Sample collection\nstatus latency errors bytes]
    F --> G[Metrics summary\np50 p95 p99 req/s MiB/s]

    G --> H[JSON report]
    I[Local demo server] --> E
```

The demo server is a separate local process. Its delay, payload size, and failure profile are explicit parameters so an experiment can state exactly what was injected. GP-1 consumes response bodies only long enough to count bytes; it does not persist bodies, perform host discovery, or coordinate distributed workers.

## Mode semantics

`mode=0` is the default observation profile. `mode=1` is a confirmed lab profile for controlled latency and fault experiments. Both profiles retain the same private-target and request-shape boundaries; mode 1 changes the documented experiment posture and defaults, not the tool into an attack mechanism.

## Report contract

The report schema is versioned at `schemaVersion: 2`. It records the selected mode and profile, exact run configuration, totals, request rate, bytes received, bytes per second, MiB per second, latency summary, status-code counts, error counts, and elapsed wall-clock time. It intentionally omits response bodies and sensitive headers.
