# GP-1 local 2000-worker report

**Target:** project-owned GP-1 benchmark server on loopback.  
**Harness:** 20 local Node processes × 100 workers = 2,000 workers.  
**Scope:** local lab only; no external target and no distributed machines.

| Stage | Workers | Bytes | MiB/s | Success | Client errors | Target p95 | Event-loop p95 | Target status |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| baseline-1k | 100 | 0.98 MiB | 2.00 | 1000/1000 | `{}` | 7.61 ms | 10.20 ms | `{'200': 1000}` |
| multi-64k-2000w | 2000 | 694.50 MiB | 28.78 | 11112/14645 | `{'TimeoutError': 3533}` | 123.76 ms | 48.23 ms | `{'200': 12430}` |
| multi-256k-2000w | 2000 | 910.50 MiB | 60.01 | 3642/6577 | `{'TimeoutError': 2935}` | 95.31 ms | 47.35 ms | `{'200': 4451}` |
| multi-1m-2000w | 2000 | 1459.00 MiB | 176.02 | 1459/2918 | `{'TimeoutError': 1459}` | 74.82 ms | 45.71 ms | `{'200': 2012}` |
| recovery-1k | 100 | 1.95 MiB | 0.31 | 2000/2000 | `{}` | 253.13 ms | 48.17 ms | `{'200': 2000}` |

## Findings

The 2,000-worker 64 KiB stage transferred **694.50 MiB**. The 2,000-worker 256 KiB stage transferred **910.50 MiB**, and the 1 MiB stage transferred **1459.00 MiB** at **176.02 MiB/s**.
The 64 KiB stage had **3533 client failures**, the 256 KiB stage had **2935**, and the 1 MiB stage had **1459**. These were primarily client-side timeout/transport observations, while target-side status remained `{'200': 12430}`, `{'200': 4451}`, and `{'200': 2012}` respectively.
The observed volume multiplier of the 1 MiB stage versus the 1 KiB baseline was **1494.02x**. The bandwidth multiplier was **87.98x**. Both are measured for this local process setup and are not universal capacity claims.
Recovery completed with 2000/2000 successful requests. Its client bandwidth was 0.31 MiB/s and target p95 was 253.13 ms.

The raw per-process reports and target snapshots are stored in this directory.
