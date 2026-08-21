from pathlib import Path
import json
import sys

root = Path(sys.argv[1])

def load(name):
    return json.loads((root / name).read_text())

def delta(before, after):
    return {
        'targetRequests': after['totalRequests'] - before['totalRequests'],
        'targetBytes': after['totalResponseBytes'] - before['totalResponseBytes'],
        'targetBytesPerSecond': (after['totalResponseBytes'] - before['totalResponseBytes']) / max(after['uptimeSeconds'] - before['uptimeSeconds'], 0.001),
        'targetMeanLatencyMs': after['latencyMs']['mean'],
        'targetP95LatencyMs': after['latencyMs']['p95'],
        'targetCpuUserMs': (after['cpu']['user'] - before['cpu']['user']) / 1000,
        'targetCpuSystemMs': (after['cpu']['system'] - before['cpu']['system']) / 1000,
        'targetRssDeltaMiB': (after['memory']['rss'] - before['memory']['rss']) / (1024 * 1024),
        'targetStatusDelta': {k: after['byStatus'].get(k, 0) - before['byStatus'].get(k, 0) for k in set(before['byStatus']) | set(after['byStatus'])},
    }

stages = [
    ('baseline-1k', 'metrics-before.json', 'metrics-after-1k.json'),
    ('throughput-64k', 'metrics-after-1k.json', 'metrics-after-64k.json'),
    ('high-capacity-1m', 'metrics-after-64k.json', 'metrics-after-1m.json'),
]
rows = []
for name, before_name, after_name in stages:
    report = load(f'{name}.json')
    target = delta(load(before_name), load(after_name))
    rows.append({
        'name': name,
        'payloadBytes': report['config']['url'].split('bytes=')[-1],
        'clientRequests': report['totals']['requests'],
        'clientBytes': report['totals']['bytesReceived'],
        'clientMiBPerSecond': report['totals']['mebibytesPerSecond'],
        'clientP95Ms': report['latencyMs']['p95'],
        'target': target,
    })

baseline_mib = rows[0]['clientMiBPerSecond']
for row in rows:
    row['clientBandwidthMultiplierVs1k'] = row['clientMiBPerSecond'] / baseline_mib if baseline_mib else None

summary = {'experiment': 'bandwidth-local-2026-08-21', 'stages': rows}
(root / 'BANDWIDTH-REPORT.json').write_text(json.dumps(summary, indent=2) + '\n')
for row in rows:
    print(json.dumps(row, sort_keys=True))
