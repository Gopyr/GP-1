# GP-1 logical 10,000 jobs report

**Target:** project-owned GP-1 benchmark server on loopback.  
**Worker model:** one transparent `workerId` and `method` label per run, up to 400 local workers in one process.  
**Scope:** benchmark lab only; no hidden identities or external target.

| Method | Worker ID | Jobs | Completed | Failed | Data | MiB/s | Client p95 | Target p95 | CPU user ms | Target status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| payload-1k | `logical-payload-1k` | 10,000 | 10000 | 7 | 9.76 MiB | 0.57 | 829.35 ms | 634.14 ms | 17402.76 | `{'200': 10000}` |
| payload-64k | `logical-payload-64k` | 10,000 | 10000 | 0 | 625.00 MiB | 37.03 | 903.86 ms | 622.80 ms | 17006.23 | `{'200': 10000}` |
| payload-128k | `logical-payload-128k` | 10,000 | 8591 | 0 | 1073.88 MiB | 71.14 | 751.28 ms | 630.22 ms | 15184.08 | `{'200': 8591}` |
| slow-25ms | `logical-slow-25ms` | 10,000 | 10000 | 0 | 0.67 MiB | 0.04 | 742.87 ms | 653.64 ms | 16899.69 | `{'200': 10000}` |

## Findings

The largest completed method was `payload-128k`, which received **1073.88 MiB**. The `payload-64k` method completed all 10,000 jobs and received **625.00 MiB**. The 128 KiB run completed 8,591 jobs before its 120-second stage limit; this is recorded as a duration/throughput boundary, not hidden.
The `slow-25ms` method completed all 10,000 jobs at **0.04 MiB/s** with client p95 **742.87 ms**. The payload methods show the bandwidth tradeoff directly in the table.
The payload-64k method produced **64.04x** the baseline data volume. The report keeps this as a volume comparison; it does not call it an impact claim against any unrelated system.

Each method has its own JSON report, raw log, summary log, worker ID, and target metrics snapshots in this directory.
