# GP-1 experiments

Experiments in this directory are reproducible and scoped. Local runs measure the included demo server directly; the public-network run measures a temporary GP-1 server owned by the project through a real network path. No third-party service is used as a target.

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

## Public-network experiment

The public experiment runner starts a temporary server with `/health`, `/slow`, `/fault`, and `/metrics` endpoints, then compares GP-1 client reports with target-side request, status, latency, CPU, and memory snapshots. Provide the temporary URL and a direct server metrics URL when running it:

```bash
GP1_PUBLIC_URL='https://your-temporary-host.example/gp1-exp-namespace' \\
GP1_SERVER_METRICS_URL='http://127.0.0.1:8127/gp1-exp-namespace' \\
scripts/run-public-experiment.sh
```

The published study is [`results/public-network-2026-08-21/PUBLIC-EXPERIMENT.md`](results/public-network-2026-08-21/PUBLIC-EXPERIMENT.md). It includes a 500-request baseline, a 50-worker power ramp, a gateway 429 boundary, and a lower-rate fault run that observed target-generated 503 responses.

## Bandwidth benchmark

The bandwidth benchmark uses the target's `/payload?bytes=N` endpoint and the GP-1 byte accounting fields. It runs three stages with 1 KiB, 64 KiB, and 1 MiB responses. The latest measured report is [`results/bandwidth-local-2026-08-21/BANDWIDTH-REPORT.md`](results/bandwidth-local-2026-08-21/BANDWIDTH-REPORT.md), with raw JSON reports beside it.

The latest high-capacity stage reached 435.22 MiB/s at the client with 100 concurrent workers and 1 MiB payloads. The report describes the multiplier and its limits without treating it as a universal production capacity claim.

## Interpretation

A lower p95 latency is not automatically evidence that a service is healthy. Compare runs made with the same endpoint, server version, hardware, duration, concurrency, interval, and warm-up conditions. Report the exact commit and configuration with any result.

Do not copy this experiment to a public target. For an authorized staging test, obtain a written test window, define a stop condition, coordinate with the owner, and use the smallest useful load.
