# Changelog

All notable changes to GP-1 are documented here.

## [0.2.0] 2026-09-01

### Added
- `gp-1 compare <baseline.json> <candidate.json>`: JSON + human-readable delta comparison (totals, latency, status codes, errors) with `--output` and `--html` for machine-readable and HTML diffs.
- Live progress sparkline: per-second throughput and latency sparklines (`▁▂▃▄▅▆▇█`) in the CLI ticker, TTY-aware with fallback to stderr on non-TTY.
- `gp-1 html <report.json>` and `--html <file>`: standalone, dependency-free HTML report generator with latency bars, status-code share, and config summary.
- `src/compare.mjs` and `src/html-report.mjs` as isolated, tested modules.

### Changed
- CLI now supports subcommands (`compare`, `html`/`report`) alongside the default run mode; `--html` and `--version` flags added.
- Version bumped to 0.2.0, docs and architecture updated.

## [0.1.0] 2026-08-21

### Added

- Bounded single-process HTTP GET load runner for localhost, private networks, and explicitly authorized staging.
- Guardrails for target class, duration, concurrency, interval, timeout, and request count.
- JSON reports with success rate, throughput, status codes, errors, and p50/p95/p99 latency.
- Automated metric tests and a local demo server.
- Reproducible localhost baseline experiment and interpretation notes.
- CI, security policy, contribution guidance, issue templates, and pull-request safety checklist.

### Explicitly out of scope

- Distributed traffic generation, protocol exploits, evasion, credential testing, arbitrary request-body flooding, and unapproved public-target measurement.
