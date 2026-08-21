from pathlib import Path
import json
import sys

root = Path(sys.argv[1])

def load(name):
    return json.loads((root / name).read_text())

def delta(before, after):
    return {
        'requests': after['totalRequests'] - before['totalRequests'],
        'bytes': after['totalResponseBytes'] - before['totalResponseBytes'],
        'status': {k: after['byStatus'].get(k, 0) - before['byStatus'].get(k, 0) for k in set(before['byStatus']) | set(after['byStatus'])},
        'cpuUserMs': (after['cpu']['user'] - before['cpu']['user']) / 1000,
        'cpuSystemMs': (after['cpu']['system'] - before['cpu']['system']) / 1000,
        'rssDeltaMiB': (after['memory']['rss'] - before['memory']['rss']) / (1024 * 1024),
        'targetP95Ms': after['latencyMs']['p95'],
        'eventLoopP95Ms': after['eventLoopDelayMs']['p95'],
        'eventLoopMaxMs': after['eventLoopDelayMs']['max'],
        'maxActive': after['maxActiveRequests'],
    }

stages = [
    ('baseline-1k', 'metrics-before.json', 'metrics-after-baseline.json'),
    ('sustained-64k', 'metrics-after-baseline.json', 'metrics-after-sustained.json'),
    ('burst-2m', 'metrics-after-sustained.json', 'metrics-after-burst.json'),
    ('recovery-1k', 'metrics-after-burst.json', 'metrics-after-recovery.json'),
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
            'bytes': report['totals']['bytesReceived'],
            'mebibytesPerSecond': report['totals']['mebibytesPerSecond'],
            'latencyMs': report['latencyMs'],
            'statusCodes': report['statusCodes'],
            'config': report['config'],
        },
        'target': delta(load(before_name), load(after_name)),
    })

baseline = rows[0]['client']['mebibytesPerSecond']
for row in rows:
    row['volumeMultiplierVsBaseline'] = row['client']['bytes'] / rows[0]['client']['bytes'] if rows[0]['client']['bytes'] else None
    row['bandwidthMultiplierVsBaseline'] = row['client']['mebibytesPerSecond'] / baseline if baseline else None

summary = {'experiment': 'combo-2026-08-21', 'stages': rows}
(root / 'COMBO-REPORT.json').write_text(json.dumps(summary, indent=2) + '\n')

lines = [
    '# GP-1 combo benchmark report',
    '',
    '**Target:** GP-1 benchmark server owned by the project on loopback.  ',
    '**Transport:** Undici keep-alive pool with up to 400 connections.  ',
    '**Combination:** sustained 64 KiB, burst 2 MiB/200 workers, and recovery.',
    '',
    '| Stage | Client requests | Success | Bytes | MiB/s | Client p95 | Target p95 | CPU user ms | RSS delta MiB | Event-loop p95 | Max active |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
]
for row in rows:
    c = row['client']; t = row['target']
    lines.append(f"| {row['name']} | {c['requests']} | {c['successRate'] * 100:.2f}% | {c['bytes'] / (1024 * 1024):.2f} MiB | {c['mebibytesPerSecond']:.2f} | {c['latencyMs']['p95']:.2f} ms | {t['targetP95Ms']:.2f} ms | {t['cpuUserMs']:.2f} | {t['rssDeltaMiB']:.2f} | {t['eventLoopP95Ms']:.2f} ms | {t['maxActive']} |")

burst = rows[2]
recovery = rows[3]
lines += [
    '',
    '## Findings',
    '',
    f"The burst stage transferred **{burst['client']['bytes'] / (1024 * 1024):.2f} MiB** at **{burst['client']['mebibytesPerSecond']:.2f} MiB/s** with **{burst['client']['config']['concurrency']} workers** and **{burst['client']['latencyMs']['p95']:.2f} ms** client p95. The total-volume multiplier over the 1 KiB baseline was **{burst['volumeMultiplierVsBaseline']:.2f}x**; the bandwidth multiplier was **{burst['bandwidthMultiplierVsBaseline']:.2f}x** under the combined payload/concurrency/transport profile.",
    f"Target telemetry during the burst recorded p95 **{burst['target']['targetP95Ms']:.2f} ms**, event-loop p95 **{burst['target']['eventLoopP95Ms']:.2f} ms**, user CPU **{burst['target']['cpuUserMs']:.2f} ms**, RSS delta **{burst['target']['rssDeltaMiB']:.2f} MiB**, and maximum observed active requests **{burst['target']['maxActive']}**.",
    f"The recovery stage returned **{recovery['client']['latencyMs']['p95']:.2f} ms** client p95 and `{recovery['target']['status']}` target statuses after the combined load. These are measurements of this benchmark process and environment.",
    '',
    '## Interpretation',
    '',
    'This is a larger combo experiment than the previous single-axis stages. The report separates volume multiplier from bandwidth multiplier and records the bottleneck indicators instead of treating a large multiplier as a universal capacity claim.',
]
(root / 'COMBO-REPORT.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines[:16]))
