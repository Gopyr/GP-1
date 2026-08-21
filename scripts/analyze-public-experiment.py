from pathlib import Path
import json
import sys

root = Path(sys.argv[1])

def load(name):
    return json.loads((root / name).read_text())

def delta(before, after):
    return {
        'requests': after['totalRequests'] - before['totalRequests'],
        'byPath': {key: after['byPath'].get(key, 0) - before['byPath'].get(key, 0) for key in set(before['byPath']) | set(after['byPath'])},
        'byStatus': {key: after['byStatus'].get(key, 0) - before['byStatus'].get(key, 0) for key in set(before['byStatus']) | set(after['byStatus'])},
        'cpuUserMicros': after['cpu']['user'] - before['cpu']['user'],
        'cpuSystemMicros': after['cpu']['system'] - before['cpu']['system'],
        'rssBytes': after['memory']['rss'] - before['memory']['rss'],
        'serverMeanLatencyMs': after['latencyMs']['mean'],
        'serverP95LatencyMs': after['latencyMs']['p95'],
    }

before = load('metrics-before.json')
after_baseline = load('metrics-after-baseline.json')
after_power = load('metrics-after-power.json')
after_fault = load('metrics-after-fault.json')
reports = {name: load(f'{name}.json') for name in ('baseline', 'power-latency', 'fault-profile')}

sections = {
    'baseline': delta(before, after_baseline),
    'power-latency': delta(after_baseline, after_power),
    'fault-profile': delta(after_power, after_fault),
}

for name, report in reports.items():
    print(name, json.dumps({
        'client': report['totals'],
        'clientStatusCodes': report['statusCodes'],
        'clientLatencyMs': report['latencyMs'],
        'serverDelta': sections[name],
    }, sort_keys=True))

summary = {
    'experiment': 'public-network-2026-08-21',
    'serverStartedAt': before['startedAt'],
    'targetClass': 'temporary public test server owned by GP-1 experiment',
    'scenarios': sections,
    'clientReports': {name: {
        'config': report['config'],
        'totals': report['totals'],
        'latencyMs': report['latencyMs'],
        'statusCodes': report['statusCodes'],
        'errors': report['errors'],
    } for name, report in reports.items()}
}
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
