#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
BASE_URL="${GP1_77X_URL:-http://127.0.0.1:8131/gp1-77x}"
METRICS_URL="${GP1_77X_METRICS_URL:-$BASE_URL}"
OUT_DIR="experiments/results/benchmark-77x-2026-08-21"
mkdir -p "$OUT_DIR"

snapshot() {
  curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-$1.json"
}
run_stage() {
  local name="$1"; shift
  node src/cli.mjs --mode 1 --lab-confirm --url "$BASE_URL/$1" "${@:2}" \
    --output "$OUT_DIR/$name.json" > "$OUT_DIR/$name.log" 2>&1
}

snapshot before
run_stage warmup-1k health --duration 5 --concurrency 10 --interval 10 --max-requests 1000 --max-bytes 2097152
snapshot after-warmup
run_stage sustained-64k 'payload?bytes=65536' --duration 30 --concurrency 50 --interval 0 --max-requests 5000 --max-bytes 134217728
snapshot after-sustained
run_stage high-capacity-1m 'payload?bytes=1048576' --duration 60 --concurrency 100 --interval 0 --max-requests 5000 --max-bytes 536870912
snapshot after-high-capacity
run_stage controlled-fault-64k 'fault?rate=0.10' --duration 20 --concurrency 50 --interval 10 --max-requests 2000 --max-bytes 134217728
snapshot after-fault
run_stage recovery-1k health --duration 15 --concurrency 10 --interval 10 --max-requests 2000 --max-bytes 4194304
snapshot after-recovery

python3 scripts/analyze-77x-benchmark.py "$OUT_DIR"
