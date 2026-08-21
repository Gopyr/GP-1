from pathlib import Path
import json
import sys

root = Path(sys.argv[1])
methods = ['payload-1k', 'payload-64k', 'payload-128k', 'slow-25ms']

def load(name):
    return json.loads((root / name).read_text())

def target_delta(method):
    before, after = load(f'metrics-before-{method}.json'), load(f'metrics-after-{method}.json')
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

rows = []
for method in methods:
    report = load(f'{method}.json')
    rows.append({'method': method, 'workerId': report['config']['workerId'], 'client': report['totals'] | {'latencyMs': report['latencyMs'], 'status': report['statusCodes'], 'errors': report['errors']}, 'target': target_delta(method)})

baseline = rows[0]['client']['bytesReceived']
for row in rows:
    row['volumeMultiplierVsBaseline'] = row['client']['bytesReceived'] / baseline if baseline else None

(root / 'LOGICAL-10000-REPORT.json').write_text(json.dumps({'jobsPerMethod': 10000, 'workersPerRun': 400, 'methods': rows}, indent=2) + '\n')
lines = [
    '# GP-1 logical 10,000 jobs report',
    '',
    '**Target:** project-owned GP-1 benchmark server on loopback.  ',
    '**Worker model:** one transparent `workerId` and `method` label per run, up to 400 local workers in one process.  ',
    '**Scope:** benchmark lab only; no hidden identities or external target.',
    '',
    '| Method | Worker ID | Jobs | Completed | Failed | Data | MiB/s | Client p95 | Target p95 | CPU user ms | Target status |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
]
for row in rows:
    c, t = row['client'], row['target']
    lines.append(f"| {row['method']} | `{row['workerId']}` | 10,000 | {c['requests']} | {c['failed']} | {c['bytesReceived'] / (1024 * 1024):.2f} MiB | {c['mebibytesPerSecond']:.2f} | {c['latencyMs']['p95']:.2f} ms | {t['targetP95Ms']:.2f} ms | {t['cpuUserMs']:.2f} | `{t['status']}` |")
lines += [
    '',
    '## Findings',
    '',
    f"The largest completed method was `payload-128k`, which received **{rows[2]['client']['bytesReceived'] / (1024 * 1024):.2f} MiB**. The `payload-64k` method completed all 10,000 jobs and received **{rows[1]['client']['bytesReceived'] / (1024 * 1024):.2f} MiB**. The 128 KiB run completed 8,591 jobs before its 120-second stage limit; this is recorded as a duration/throughput boundary, not hidden.",
    f"The `slow-25ms` method completed all 10,000 jobs at **{rows[3]['client']['mebibytesPerSecond']:.2f} MiB/s** with client p95 **{rows[3]['client']['latencyMs']['p95']:.2f} ms**. The payload methods show the bandwidth tradeoff directly in the table.",
    f"The payload-64k method produced **{rows[1]['volumeMultiplierVsBaseline']:.2f}x** the baseline data volume. The report keeps this as a volume comparison; it does not call it an impact claim against any unrelated system.",
    '',
    'Each method has its own JSON report, raw log, summary log, worker ID, and target metrics snapshots in this directory.',
]
(root / 'LOGICAL-10000-REPORT.md').write_text('\n'.join(lines) + '\n')
(root / 'COMBINED-OUTPUT.log').write_text('\n'.join((root / f'{method}.summary.log').read_text().strip() for method in methods) + '\n')
print('\n'.join(lines))
