from pathlib import Path
import json

root = Path('experiments/results/public-network-2026-08-21')

def load(name):
    return json.loads((root / name).read_text())

def delta(before, after):
    return {
        'requests': after['totalRequests'] - before['totalRequests'],
        'status': {k: after['byStatus'].get(k, 0) - before['byStatus'].get(k, 0) for k in set(before['byStatus']) | set(after['byStatus'])},
        'paths': {k: after['byPath'].get(k, 0) - before['byPath'].get(k, 0) for k in set(before['byPath']) | set(after['byPath'])},
        'cpuUserMs': (after['cpu']['user'] - before['cpu']['user']) / 1000,
        'cpuSystemMs': (after['cpu']['system'] - before['cpu']['system']) / 1000,
        'rssDeltaMiB': (after['memory']['rss'] - before['memory']['rss']) / (1024 * 1024),
        'serverMeanLatencyMs': after['latencyMs']['mean'],
        'serverP95LatencyMs': after['latencyMs']['p95'],
    }

baseline = load('baseline.json')
power = load('power-latency.json')
fault = load('fault-profile.json')
accurate_fault = load('fault-profile-accurate.json')
network = {
    'baseline': delta(load('metrics-before.json'), load('metrics-after-baseline.json')),
    'power': delta(load('metrics-after-baseline.json'), load('metrics-after-power.json')),
    'fault': delta(load('metrics-after-power.json'), load('metrics-after-fault.json')),
    'accurateFault': delta(load('metrics-before-accurate-fault.json'), load('metrics-after-accurate-fault.json')),
}

rows = []
for title, report, server_delta in [
    ('Baseline /health', baseline, network['baseline']),
    ('Power /slow?ms=25', power, network['power']),
    ('Fault /fault?rate=0.05 (high-rate)', fault, network['fault']),
    ('Fault /fault?rate=0.10 (accurate low-rate)', accurate_fault, network['accurateFault']),
]:
    rows.append(f"| {title} | {report['totals']['requests']} | {report['totals']['successful']} | {report['totals']['failed']} | {report['totals']['requestsPerSecond']:.2f} | {report['latencyMs']['p95']:.2f} | {report['statusCodes']} | {server_delta['requests']} | {server_delta['status']} | {server_delta['cpuUserMs']:.2f} | {server_delta['rssDeltaMiB']:.2f} |")

report = f'''# GP-1 public network experiment

**Date:** 2026-08-21  
**Target:** temporary public GP-1 server owned by this experiment, exposed through the temporary public URL namespace `/gp1-exp-20260821`.  
**Purpose:** measure a real network path, observe gateway behavior, and compare client-side reports with target-side metrics.

## Important interpretation

This was a real public-network test, but the public URL passed through a proxy gateway. The gateway returned HTTP `429` during the most aggressive ramp. The target server itself recorded only the requests that reached it, and its target-side status counts remained HTTP `200` for the `/slow` scenario. The `429` responses therefore measure the public gateway's rate boundary, not target application failures.

| Scenario | Client requests | Client 2xx | Client failed | Client req/s | Client p95 ms | Client status codes | Target requests received | Target status | CPU user ms | RSS delta MiB |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | ---: | ---: |
{chr(10).join(rows)}

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
'''
(root / 'PUBLIC-EXPERIMENT.md').write_text(report)
