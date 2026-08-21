from pathlib import Path
import json
import sys

root = Path(sys.argv[1])
client = json.loads((root / 'client.json').read_text())
before = json.loads((root / 'metrics-before.json').read_text())
after = json.loads((root / 'metrics-after.json').read_text())

def delta(a, b):
    return b - a

result = {
    'workerId': client['config']['workerId'],
    'method': client['config']['method'],
    'client': {
        'requests': client['totals']['requests'],
        'successful': client['totals']['successful'],
        'failed': client['totals']['failed'],
        'bytesReceived': client['totals']['bytesReceived'],
        'mebibytesReceived': client['totals']['bytesReceived'] / (1024 * 1024),
        'mebibytesPerSecond': client['totals']['mebibytesPerSecond'],
        'requestsPerSecond': client['totals']['requestsPerSecond'],
        'p95Ms': client['latencyMs']['p95'],
        'p99Ms': client['latencyMs']['p99'],
        'statusCodes': client['statusCodes'],
        'errors': client['errors'],
    },
    'target': {
        'requestsReceived': delta(before['totalRequests'], after['totalRequests']),
        'responseBytes': delta(before['totalResponseBytes'], after['totalResponseBytes']),
        'statusCodes': {k: after['byStatus'].get(k, 0) - before['byStatus'].get(k, 0) for k in set(before['byStatus']) | set(after['byStatus'])},
        'cpuUserMs': delta(before['cpu']['user'], after['cpu']['user']) / 1000,
        'cpuSystemMs': delta(before['cpu']['system'], after['cpu']['system']) / 1000,
        'rssDeltaMiB': delta(before['memory']['rss'], after['memory']['rss']) / (1024 * 1024),
        'targetP95Ms': after['latencyMs']['p95'],
        'eventLoopP95Ms': after['eventLoopDelayMs']['p95'],
        'eventLoopMaxMs': after['eventLoopDelayMs']['max'],
        'maxActiveRequests': after['maxActiveRequests'],
    },
}
(root / 'IMPACT-REPORT.json').write_text(json.dumps(result, indent=2) + '\n')
lines = [
    '# GP-1 impact run report',
    '',
    '**Target:** project-owned GP-1 benchmark server on loopback.  ',
    f"**Worker ID:** `{result['workerId']}`  ",
    f"**Method:** `{result['method']}`",
    '',
    '| Measure | Result |',
    '| --- | ---: |',
    f"| Client requests | {result['client']['requests']} |",
    f"| Client successes | {result['client']['successful']} |",
    f"| Client failures | {result['client']['failed']} |",
    f"| Bytes received by client | {result['client']['mebibytesReceived']:.2f} MiB |",
    f"| Client bandwidth | {result['client']['mebibytesPerSecond']:.2f} MiB/s |",
    f"| Client request rate | {result['client']['requestsPerSecond']:.2f} req/s |",
    f"| Client p95 / p99 | {result['client']['p95Ms']:.2f} / {result['client']['p99Ms']:.2f} ms |",
    f"| Requests received by target | {result['target']['requestsReceived']} |",
    f"| Target response bytes | {result['target']['responseBytes'] / (1024 * 1024):.2f} MiB |",
    f"| Target status codes | `{result['target']['statusCodes']}` |",
    f"| Target CPU user / system | {result['target']['cpuUserMs']:.2f} / {result['target']['cpuSystemMs']:.2f} ms |",
    f"| Target RSS delta | {result['target']['rssDeltaMiB']:.2f} MiB |",
    f"| Target p95 | {result['target']['targetP95Ms']:.2f} ms |",
    f"| Event-loop p95 / max | {result['target']['eventLoopP95Ms']:.2f} / {result['target']['eventLoopMaxMs']:.2f} ms |",
    f"| Maximum active requests observed | {result['target']['maxActiveRequests']} |",
    '',
    '## Interpretation',
    '',
    'This is a controlled load measurement on the project-owned target. The client and target totals are reported separately. The result is not a claim about a production service or an unrelated system.',
]
(root / 'IMPACT-REPORT.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
