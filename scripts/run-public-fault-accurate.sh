#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BASE_URL="${GP1_PUBLIC_URL:?Set GP1_PUBLIC_URL}"
METRICS_URL="${GP1_SERVER_METRICS_URL:?Set GP1_SERVER_METRICS_URL}"
OUT_DIR="experiments/results/public-network-2026-08-21"

curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-before-accurate-fault.json"
node src/cli.mjs \
  --mode 1 \
  --lab-confirm \
  --allow-public \
  --public-test-confirm \
  --url "$BASE_URL/fault?rate=0.10" \
  --duration 10 \
  --concurrency 2 \
  --interval 300 \
  --max-requests 40 \
  --output "$OUT_DIR/fault-profile-accurate.json" > "$OUT_DIR/fault-profile-accurate.log" 2>&1
curl -fsS --max-time 15 "$METRICS_URL/metrics" > "$OUT_DIR/metrics-after-accurate-fault.json"
