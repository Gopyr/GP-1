# GP-1 experiments

Experiments in this directory are intentionally local and reproducible. They measure the behavior of the included demo server, not the capacity or impact of a third-party service.

## Local baseline procedure

From the repository root, start the controlled demo server in one terminal:

```bash
node scripts/demo-server.mjs
```

In a second terminal, run a bounded measurement:

```bash
node src/cli.mjs \
  --url http://127.0.0.1:8123/health \
  --duration 5 \
  --concurrency 4 \
  --interval 50 \
  --max-requests 400 \
  --output experiments/results/localhost-baseline.json
```

The report records request totals, status codes, errors, throughput, and latency percentiles. GP-1 does not save response bodies.

## Lab experiment: controlled faults

Mode `1` is reserved for a confirmed lab or private staging experiment. The included demo server can inject a predictable 503 response every tenth request without contacting any external service:

```bash
FAIL_EVERY=10 DELAY_MS=40 node scripts/demo-server.mjs
```

In a second terminal, explicitly select the lab profile and confirm the local window:

```bash
node src/cli.mjs \\
  --mode 1 \\
  --lab-confirm \\
  --url http://127.0.0.1:8123/health \\
  --duration 5 \\
  --concurrency 4 \\
  --interval 50 \\
  --max-requests 400 \\
  --output experiments/results/localhost-fault-profile.json
```

The expected observation is a measurable 503 proportion close to the demo server's `FAIL_EVERY` setting, plus a higher latency distribution from `DELAY_MS`. This is a controlled fault-injection experiment, not an impact test against a public service.

## Interpretation

A lower p95 latency is not automatically evidence that a service is healthy. Compare runs made with the same endpoint, server version, hardware, duration, concurrency, interval, and warm-up conditions. Report the exact commit and configuration with any result.

Do not copy this experiment to a public target. For an authorized staging test, obtain a written test window, define a stop condition, coordinate with the owner, and use the smallest useful load.
