# GP-1 public network experiment

**Date:** 2026-08-21  
**Target:** temporary public GP-1 server owned by this experiment, exposed through the temporary public URL namespace `/gp1-exp-20260821`.  
**Purpose:** measure a real network path, observe gateway behavior, and compare client-side reports with target-side metrics.

## Important interpretation

This was a real public-network test, but the public URL passed through a proxy gateway. The gateway returned HTTP `429` during the most aggressive ramp. The target server itself recorded only the requests that reached it, and its target-side status counts remained HTTP `200` for the `/slow` scenario. The `429` responses therefore measure the public gateway's rate boundary, not target application failures.

| Scenario | Client requests | Client 2xx | Client failed | Client req/s | Client p95 ms | Client status codes | Target requests received | Target status | CPU user ms | RSS delta MiB |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | ---: | ---: |
| Baseline /health | 500 | 500 | 0 | 90.56 | 8.79 | {'200': 500} | 500 | {'200': 500} | 277.85 | 8.03 |
| Power /slow?ms=25 | 3000 | 1685 | 1315 | 1298.34 | 46.95 | {'200': 1685, '429': 1315} | 1685 | {'200': 1685} | 1006.43 | 18.16 |
| Fault /fault?rate=0.05 (high-rate) | 1000 | 58 | 942 | 853.06 | 8.03 | {'200': 58, '429': 937, '503': 5} | 63 | {'503': 5, '200': 58} | 62.61 | 0.00 |
| Fault /fault?rate=0.10 (accurate low-rate) | 40 | 31 | 9 | 6.36 | 12.57 | {'200': 31, '503': 9} | 40 | {'503': 9, '200': 31} | 35.54 | 6.20 |

## Main result

The baseline completed 500 public-network requests with 100% success at 90.56 requests/second. The stronger `/slow?ms=25` ramp attempted 3,000 requests with 50 concurrent workers and a 10 ms worker interval. The client completed 1,685 requests at 1,298.34 observations/second; 1,315 were rejected by the public proxy with HTTP 429. The target server received 1,685 `/slow` requests and returned 1,685 HTTP 200 responses, with target-side p95 latency of 36.60 ms.

Compared with the baseline target session, the power session increased target-side mean latency from 1.25 ms to 23.09 ms, increased target-side p95 latency from 1.74 ms to 36.60 ms, consumed approximately 1,006 ms additional user CPU and 147 ms system CPU in the server process, and increased observed RSS by approximately 18.16 MiB across the session boundary. These are measurements of this temporary Node.js server in this sandbox, not general capacity claims.

The accurate low-rate fault run used mode `1`, `--lab-confirm`, 2 workers, a 300 ms interval, and a 10% controlled fault profile for 40 public requests. It produced 31 HTTP 200 responses and 9 HTTP 503 responses, with no proxy 429 responses in that low-rate window. This confirms that GP-1 can observe target-generated failures through a real public network path when the gateway is not the limiting factor.

## Reproduction shape

The stronger run used these bounded parameters:

```text
mode=1
concurrency=50
interval=10ms
duration=20s
max-requests=3000
endpoint=/slow?ms=25
```

The lower-rate fault confirmation used:

```text
mode=1
--lab-confirm
concurrency=2
interval=300ms
duration=10s
max-requests=40
endpoint=/fault?rate=0.10
```

All requests were `GET` requests to the project's own temporary server. No third-party service was used as a target. The raw client reports and before/after server snapshots are stored in this directory.

## Limitations

The temporary public gateway imposes its own rate limit, so the power run cannot be interpreted as the application's maximum capacity. The server metrics are process-level observations rather than a full production telemetry stack. The temporary URL is not a permanent benchmark endpoint and may expire after the experiment.
