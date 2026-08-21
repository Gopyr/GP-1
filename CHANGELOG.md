# Changelog

All notable changes to GP-1 are documented here.

## [0.1.0] — 2026-08-21

### Added

- Bounded single-process HTTP GET load runner for localhost, private networks, and explicitly authorized staging.
- Guardrails for target class, duration, concurrency, interval, timeout, and request count.
- JSON reports with success rate, throughput, status codes, errors, and p50/p95/p99 latency.
- Automated metric tests and a local demo server.
- Reproducible localhost baseline experiment and interpretation notes.
- CI, security policy, contribution guidance, issue templates, and pull-request safety checklist.

### Explicitly out of scope

- Distributed traffic generation, protocol exploits, evasion, credential testing, arbitrary request-body flooding, and unapproved public-target measurement.
