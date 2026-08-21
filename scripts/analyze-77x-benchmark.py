from pathlib import Path
import json
import sys

root = Path(sys.argv[1])

def load(name):
    return json.loads((root / name).read_text())

def target_delta(before, after):
    return {
        'requests': after['totalRequests'] - before['totalRequests'],
        'bytes': after['totalResponseBytes'] - before['totalResponseBytes'],
        'status': {k: after['byStatus'].get(k, 0) - before['byStatus'].get(k, 0) for k in set(before['byStatus']) | set(after['byStatus'])},
        'cpuUserMs': (after['cpu']['user'] - before['cpu']['user']) / 1000,
        'cpuSystemMs': (after['cpu']['system'] - before['cpu']['system']) / 1000,
        'rssDeltaMiB': (after['memory']['rss'] - before['memory']['rss']) / (1024 * 1024),
        'targetMeanLatencyMs': after['latencyMs']['mean'],
        'targetP95LatencyMs': after['latencyMs']['p95'],
        'eventLoopP95Ms': after['eventLoopDelayMs']['p95'],
        'eventLoopMaxMs': after['eventLoopDelayMs']['max'],
        'maxActiveRequestsObserved': after['maxActiveRequests'],
    }

stages = [
    ('warmup-1k', 'metrics-before.json', 'metrics-after-warmup.json'),
    ('sustained-64k', 'metrics-after-warmup.json', 'metrics-after-sustained.json'),
    ('high-capacity-1m', 'metrics-after-sustained.json', 'metrics-after-high-capacity.json'),
    ('controlled-fault-64k', 'metrics-after-high-capacity.json', 'metrics-after-fault.json'),
    ('recovery-1k', 'metrics-after-fault.json', 'metrics-after-recovery.json'),
]
rows = []
for name, before_name, after_name in stages:
    report = load(f'{name}.json')
    rows.append({
        'name': name,
        'client': {
            'requests': report['totals']['requests'],
            'successful': report['totals']['successful'],
            'failed': report['totals']['failed'],
            'successRate': report['totals']['successRate'],
            'requestsPerSecond': report['totals']['requestsPerSecond'],
            'bytesReceived': report['totals']['bytesReceived'],
            'mebibytesPerSecond': report['totals']['mebibytesPerSecond'],
            'latencyMs': report['latencyMs'],
            'statusCodes': report['statusCodes'],
            'errors': report['errors'],
            'config': report['config'],
        },
        'target': target_delta(load(before_name), load(after_name)),
    })

warmup = rows[0]['client']['mebibytesPerSecond']
for row in rows:
    row['client']['bandwidthMultiplierVsWarmup'] = row['client']['mebibytesPerSecond'] / warmup if warmup else None

summary = {'experiment': 'benchmark-77x-2026-08-21', 'stages': rows}
(root / 'BENCHMARK-77X-REPORT.json').write_text(json.dumps(summary, indent=2) + '\n')

lines = [
    '# GP-1 77x benchmark report',
    '',
    '**Target:** GP-1 benchmark server owned by the project on loopback.  ',
    '**Transport:** Undici keep-alive pool with up to 100 connections.  ',
    '**Stages:** warm-up, sustained load, 1 MiB high-capacity, controlled fault, and recovery.',
    '',
    '## Summary',
    '',
    '| Stage | Client requests | Client success | Client MiB/s | Client p95 | Target p95 | Target status | CPU user ms | RSS delta MiB | Event-loop p95 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |',
]
for row in rows:
    c = row['client']; t = row['target']
    lines.append(f"| {row['name']} | {c['requests']} | {c['successRate'] * 100:.2f}% | {c['mebibytesPerSecond']:.2f} | {c['latencyMs']['p95']:.2f} ms | {t['targetP95LatencyMs']:.2f} ms | `{t['status']}` | {t['cpuUserMs']:.2f} | {t['rssDeltaMiB']:.2f} | {t['eventLoopP95Ms']:.2f} ms |")

high = rows[2]
fault = rows[3]
recovery = rows[4]
lines += [
    '',
    '## Findings',
    '',
    f"The 1 MiB high-capacity stage delivered **{high['client']['mebibytesPerSecond']:.2f} MiB/s** at **{high['client']['config']['concurrency']} concurrent workers**, with **{high['client']['bytesReceived'] / (1024 * 1024):.2f} MiB** received and **{high['client']['latencyMs']['p95']:.2f} ms** client p95. Relative to the 1 KiB warm-up, the observed client bandwidth multiplier was **{high['client']['bandwidthMultiplierVsWarmup']:.2f}x** under the changed payload and concurrency profile.",
    f"The target recorded **{high['target']['requests']} requests**, target p95 **{high['target']['targetP95LatencyMs']:.2f} ms**, event-loop p95 **{high['target']['eventLoopP95Ms']:.2f} ms**, approximately **{high['target']['cpuUserMs']:.2f} ms** of user CPU, and an RSS delta of **{high['target']['rssDeltaMiB']:.2f} MiB** during the stage.",
    f"The controlled fault stage produced target status counts `{fault['target']['status']}`. This separates target-generated failures from client/network failures and gives the report a measurable error impact rather than a request-count-only result.",
    f"The recovery stage returned **{recovery['client']['latencyMs']['p95']:.2f} ms** client p95 after the stress and fault stages, compared with **{rows[0]['client']['latencyMs']['p95']:.2f} ms** during warm-up. This is the recovery observation for this process and environment, not a general production guarantee.",
    '',
    '## Interpretation',
    '',
    'The 77x label describes a multi-dimensional stress matrix. The largest observed bandwidth multiplier is a real measurement from the project-owned benchmark target, but it combines payload size, concurrency, and keep-alive transport. Target-side telemetry is reported separately so client bandwidth is not confused with application capacity.',
    '',
    'Raw JSON reports, target snapshots, and the machine-readable summary are stored in this directory.',
]
(root / 'BENCHMARK-77X-REPORT.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines[:16]))
