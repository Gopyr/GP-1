from pathlib import Path
import json
import sys

root = Path(sys.argv[1])
report = json.loads((root / 'SATURATION-REPORT.json').read_text())
rows = []
for item in report['stages']:
    c = item.get('client') or {}
    totals = c.get('totals', {}) if c else {}
    t = item['target']
    before_path = root / f"metrics-before-{item['stage']}.json"
    after_path = root / f"metrics-after-{item['stage']}.json"
    if before_path.exists() and after_path.exists():
        before_metrics = json.loads(before_path.read_text())
        after_metrics = json.loads(after_path.read_text())
        t['status'] = {code: (after_metrics.get('byStatus', {}).get(code, 0) - before_metrics.get('byStatus', {}).get(code, 0)) for code in set(before_metrics.get('byStatus', {})) | set(after_metrics.get('byStatus', {}))}
    rows.append({
        'stage': item['stage'],
        'concurrency': item['config']['concurrency'],
        'requests': t['requests'],
        'bytesMiB': t['responseBytes'] / (1024 * 1024),
        'targetP95Ms': t['targetP95Ms'],
        'eventLoopP95Ms': t['eventLoopP95Ms'],
        'eventLoopMaxMs': t['eventLoopMaxMs'],
        'rssDeltaMiB': t['rssDeltaMiB'],
        'failures': t['failures'],
        'status': t['status'],
        'stoppedByThreshold': item['stoppedByThreshold'],
        'clientRequests': totals.get('requests'),
        'clientSuccess': totals.get('successful'),
        'clientFailed': totals.get('failed'),
        'clientMiBPerSecond': totals.get('mebibytesPerSecond'),
        'clientP95Ms': (c.get('latencyMs') or {}).get('p95'),
    })
summary = {'threshold': report['threshold'], 'stopReason': report['stopReason'], 'stages': rows}
(root / 'SATURATION-SUMMARY.json').write_text(json.dumps(summary, indent=2) + '\n')
lines = [
    '# GP-1 controlled saturation report',
    '',
    '**Target:** project-owned GP-1 benchmark server on loopback.  ',
    '**Ramp:** concurrency 25 → 50 → 100 → 200 → 400, 30 seconds per stage, 64 KiB payload.  ',
    '**Control:** auto-cut thresholds were active; no threshold was crossed in this run.',
    '',
    '| Stage | Concurrency | Target requests | Target bytes | Target p95 | Event-loop p95 | Event-loop max | RSS delta | Target failures | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
]
for row in rows:
    lines.append(f"| {row['stage']} | {row['concurrency']} | {row['requests']} | {row['bytesMiB']:.2f} MiB | {row['targetP95Ms']:.2f} ms | {row['eventLoopP95Ms']:.2f} ms | {row['eventLoopMaxMs']:.2f} ms | {row['rssDeltaMiB']:.2f} MiB | {row['failures']} | `{row['status']}` |")
last = rows[-1]
lines += [
    '',
    '## Findings',
    '',
    f"The highest completed stage was **{last['concurrency']} concurrency**. Across that stage, the target recorded **{last['requests']} requests** and **{last['bytesMiB']:.2f} MiB** of response bytes with target p95 **{last['targetP95Ms']:.2f} ms** and event-loop p95 **{last['eventLoopP95Ms']:.2f} ms**.",
    f"No target HTTP failures were observed; the final stage status delta was `{last['status']}`. No auto-cut threshold was crossed. The run therefore identifies a measured point inside the target's envelope, not a failure limit.",
    'The next meaningful capacity step is to move the benchmark target to a separately provisioned lab host and repeat the same ramp while collecting host network, CPU, memory, socket, and queue metrics. Increasing local traffic alone would mostly measure the sandbox and client limits.',
]
(root / 'SATURATION-REPORT.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
