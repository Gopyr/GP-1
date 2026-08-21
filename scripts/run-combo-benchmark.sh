#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
BASE_URL="${GP1_COMBO_URL:-http://127.0.0.1:8132/gp1-combo}"
METRICS_URL="${GP1_COMBO_METRICS_URL:-$BASE_URL}"
OUT_DIR="experiments/results/combo-2026-08-21"
mkdir -p "$OUT_DIR"

snapshot() { curl -fsS --max-time 20 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-$1.json"; }
run_stage() {
  local name="$1"; shift
  node src/cli.mjs --mode 1 --lab-confirm --url "$BASE_URL/$1" "${@:2}" \
    --output "$OUT_DIR/$name.json" > "$OUT_DIR/$name.log" 2>&1
}

snapshot before
run_stage baseline-1k 'payload?bytes=1024' --duration 10 --concurrency 10 --interval 10 --max-requests 1000 --max-bytes 4194304
snapshot after-baseline
run_stage sustained-64k 'payload?bytes=65536' --duration 60 --concurrency 100 --interval 0 --max-requests 10000 --max-bytes 536870912
snapshot after-sustained
run_stage burst-2m 'payload?bytes=2097152' --duration 30 --concurrency 200 --interval 0 --max-requests 2000 --max-bytes 805306368
snapshot after-burst
run_stage recovery-1k 'payload?bytes=1024' --duration 20 --concurrency 10 --interval 10 --max-requests 2000 --max-bytes 8388608
snapshot after-recovery

python3 scripts/analyze-combo-benchmark.py "$OUT_DIR"
