from pathlib import Path
import json
import sys

root = Path(sys.argv[1])
summary = json.loads((root / 'LOCAL-2000-WORKER-REPORT.json').read_text())

def load(name):
    return json.loads((root / name).read_text())

def stage_reports(name):
    files = sorted(root.glob(f'{name}-*.json'))
    return [load(f.name) for f in files]

def target_delta(before_name, after_name):
    before, after = load(before_name), load(after_name)
    return {
        'requests': after['totalRequests'] - before['totalRequests'],
        'bytes': after['totalResponseBytes'] - before['totalResponseBytes'],
        'status': {k: after['byStatus'].get(k, 0) - before['byStatus'].get(k, 0) for k in set(before['byStatus']) | set(after['byStatus'])},
        'cpuUserMs': (after['cpu']['user'] - before['cpu']['user']) / 1000,
        'cpuSystemMs': (after['cpu']['system'] - before['cpu']['system']) / 1000,
        'rssDeltaMiB': (after['memory']['rss'] - before['memory']['rss']) / (1024 * 1024),
        'targetP95Ms': after['latencyMs']['p95'],
        'eventLoopP95Ms': after['eventLoopDelayMs']['p95'],
        'maxActive': after['maxActiveRequests'],
    }

pairs = [
    ('baseline-1k', 'metrics-before-baseline-1k.json', 'metrics-after-baseline-1k.json'),
    ('multi-64k-2000w', 'metrics-before-multi-64k-2000w.json', 'metrics-after-multi-64k-2000w.json'),
    ('multi-256k-2000w', 'metrics-before-multi-256k-2000w.json', 'metrics-after-multi-256k-2000w.json'),
    ('multi-1m-2000w', 'metrics-before-multi-1m-2000w.json', 'metrics-after-multi-1m-2000w.json'),
    ('recovery-1k', 'metrics-before-recovery-1k.json', 'metrics-after-recovery-1k.json'),
]
rows = []
for name, before, after in pairs:
    reports = stage_reports(name)
    status, errors = {}, {}
    for report in reports:
        for key, value in report.get('statusCodes', {}).items(): status[key] = status.get(key, 0) + value
        for key, value in report.get('errors', {}).items(): errors[key] = errors.get(key, 0) + value
    client = next(item for item in summary['stages'] if item['stage']['name'] == name)
    row = {'name': name, 'client': client['totals'], 'statusCodes': status, 'errors': errors, 'target': target_delta(before, after)}
    rows.append(row)

baseline_bytes = rows[0]['client']['bytesReceived']
baseline_bw = rows[0]['client']['mebibytesPerSecond']
for row in rows:
    row['volumeMultiplierVsBaseline'] = row['client']['bytesReceived'] / baseline_bytes if baseline_bytes else None
    row['bandwidthMultiplierVsBaseline'] = row['client']['mebibytesPerSecond'] / baseline_bw if baseline_bw else None

(root / 'LOCAL-2000-WORKER-REPORT-ANALYZED.json').write_text(json.dumps({'processCount': 20, 'workersPerProcess': 100, 'totalWorkers': 2000, 'stages': rows}, indent=2) + '\n')
lines = [
    '# GP-1 local 2000-worker report',
    '',
    '**Target:** project-owned GP-1 benchmark server on loopback.  ',
    '**Harness:** 20 local Node processes × 100 workers = 2,000 workers.  ',
    '**Scope:** local lab only; no external target and no distributed machines.',
    '',
    '| Stage | Workers | Bytes | MiB/s | Success | Client errors | Target p95 | Event-loop p95 | Target status |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |',
]
for row in rows:
    c, t = row['client'], row['target']
    lines.append(f"| {row['name']} | {2000 if '2000w' in row['name'] else 100} | {c['bytesReceived'] / (1024 * 1024):.2f} MiB | {c['mebibytesPerSecond']:.2f} | {c['successful']}/{c['requests']} | `{row['errors']}` | {t['targetP95Ms']:.2f} ms | {t['eventLoopP95Ms']:.2f} ms | `{t['status']}` |")
lines += [
    '',
    '## Findings',
    '',
    f"The 2,000-worker 64 KiB stage transferred **{rows[1]['client']['bytesReceived'] / (1024 * 1024):.2f} MiB**. The 2,000-worker 256 KiB stage transferred **{rows[2]['client']['bytesReceived'] / (1024 * 1024):.2f} MiB**, and the 1 MiB stage transferred **{rows[3]['client']['bytesReceived'] / (1024 * 1024):.2f} MiB** at **{rows[3]['client']['mebibytesPerSecond']:.2f} MiB/s**.",
    f"The 64 KiB stage had **{rows[1]['client']['failed']} client failures**, the 256 KiB stage had **{rows[2]['client']['failed']}**, and the 1 MiB stage had **{rows[3]['client']['failed']}**. These were primarily client-side timeout/transport observations, while target-side status remained `{rows[1]['target']['status']}`, `{rows[2]['target']['status']}`, and `{rows[3]['target']['status']}` respectively.",
    f"The observed volume multiplier of the 1 MiB stage versus the 1 KiB baseline was **{rows[3]['volumeMultiplierVsBaseline']:.2f}x**. The bandwidth multiplier was **{rows[3]['bandwidthMultiplierVsBaseline']:.2f}x**. Both are measured for this local process setup and are not universal capacity claims.",
    f"Recovery completed with {rows[4]['client']['successful']}/{rows[4]['client']['requests']} successful requests. Its client bandwidth was {rows[4]['client']['mebibytesPerSecond']:.2f} MiB/s and target p95 was {rows[4]['target']['targetP95Ms']:.2f} ms.",
    '',
    'The raw per-process reports and target snapshots are stored in this directory.',
]
(root / 'LOCAL-2000-WORKER-REPORT.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
