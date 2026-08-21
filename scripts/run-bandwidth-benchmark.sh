#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
BASE_URL="${GP1_BW_URL:-http://127.0.0.1:8130/gp1-bw}"
METRICS_URL="${GP1_BW_METRICS_URL:-$BASE_URL}"
OUT_DIR="experiments/results/bandwidth-local-2026-08-21"
mkdir -p "$OUT_DIR"

curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-before.json"

node src/cli.mjs --mode 1 --lab-confirm --url "$BASE_URL/payload?bytes=1024" \
  --duration 5 --concurrency 10 --interval 10 --max-requests 1000 --max-bytes 2097152 \
  --output "$OUT_DIR/baseline-1k.json" > "$OUT_DIR/baseline-1k.log" 2>&1
curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-1k.json"

node src/cli.mjs --mode 1 --lab-confirm --url "$BASE_URL/payload?bytes=65536" \
  --duration 15 --concurrency 50 --interval 0 --max-requests 5000 --max-bytes 67108864 \
  --output "$OUT_DIR/throughput-64k.json" > "$OUT_DIR/throughput-64k.log" 2>&1
curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-64k.json"

node src/cli.mjs --mode 1 --lab-confirm --url "$BASE_URL/payload?bytes=1048576" \
  --duration 20 --concurrency 100 --interval 0 --max-requests 1000 --max-bytes 134217728 \
  --output "$OUT_DIR/high-capacity-1m.json" > "$OUT_DIR/high-capacity-1m.log" 2>&1
curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-1m.json"

python3 - "$OUT_DIR" <<'PY'
import json
import pathlib
import sys
root = pathlib.Path(sys.argv[1])
for name in ('baseline-1k', 'throughput-64k', 'high-capacity-1m'):
    report = json.loads((root / f'{name}.json').read_text())
    print(name, json.dumps({'config': report['config'], 'totals': report['totals'], 'latencyMs': report['latencyMs'], 'statusCodes': report['statusCodes']}))
PY
