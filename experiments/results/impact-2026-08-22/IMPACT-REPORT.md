# GP-1 impact run report

**Target:** project-owned GP-1 benchmark server on loopback.  
**Worker ID:** `impact-load-0001`  
**Method:** `payload-64k-impact`

| Measure | Result |
| --- | ---: |
| Client requests | 10000 |
| Client successes | 10000 |
| Client failures | 0 |
| Bytes received by client | 625.00 MiB |
| Client bandwidth | 66.28 MiB/s |
| Client request rate | 1060.50 req/s |
| Client p95 / p99 | 581.92 / 930.23 ms |
| Requests received by target | 10000 |
| Target response bytes | 625.00 MiB |
| Target status codes | `{'200': 10000}` |
| Target CPU user / system | 9226.73 / 653.01 ms |
| Target RSS delta | 89.88 MiB |
| Target p95 | 439.10 ms |
| Event-loop p95 / max | 10.23 / 592.97 ms |
| Maximum active requests observed | 400 |

## Interpretation

This is a controlled load measurement on the project-owned target. The client and target totals are reported separately. The result is not a claim about a production service or an unrelated system.
