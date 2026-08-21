#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
BASE_URL="${GP1_PUBLIC_URL:?Set GP1_PUBLIC_URL to the temporary GP-1 test server URL}"
METRICS_URL="${GP1_SERVER_METRICS_URL:-$BASE_URL}"
OUT_DIR="experiments/results/public-network-2026-08-21"
mkdir -p "$OUT_DIR"

curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-before.json"

node src/cli.mjs \
  --mode 0 \
  --allow-public \
  --public-test-confirm \
  --url "$BASE_URL/health" \
  --duration 10 \
  --concurrency 10 \
  --interval 100 \
  --max-requests 500 \
  --output "$OUT_DIR/baseline.json" > "$OUT_DIR/baseline.log" 2>&1

curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-baseline.json"

node src/cli.mjs \
  --mode 1 \
  --lab-confirm \
  --allow-public \
  --public-test-confirm \
  --url "$BASE_URL/slow?ms=25" \
  --duration 20 \
  --concurrency 50 \
  --interval 10 \
  --max-requests 3000 \
  --output "$OUT_DIR/power-latency.json" > "$OUT_DIR/power-latency.log" 2>&1

curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-power.json"

node src/cli.mjs \
  --mode 1 \
  --lab-confirm \
  --allow-public \
  --public-test-confirm \
  --url "$BASE_URL/fault?rate=0.05" \
  --duration 10 \
  --concurrency 25 \
  --interval 20 \
  --max-requests 1000 \
  --output "$OUT_DIR/fault-profile.json" > "$OUT_DIR/fault-profile.log" 2>&1

curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-fault.json"

python3 - "$OUT_DIR" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for name in ('baseline', 'power-latency', 'fault-profile'):
    data = json.loads((root / f'{name}.json').read_text())
    print(name, json.dumps({
        'config': data['config'],
        'totals': data['totals'],
        'latencyMs': data['latencyMs'],
        'statusCodes': data['statusCodes'],
        'errors': data['errors'],
    }))
PY
