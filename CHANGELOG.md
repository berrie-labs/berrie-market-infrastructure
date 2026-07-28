# Changelog

Notable project changes will be recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The project uses [Semantic Versioning](https://semver.org/).

## Unreleased

## [0.1.0] - 2026-07-27

### Added

- Canonical spot and perpetual market symbols with caller-supplied adapters.
- Deterministic, bounded market-event envelopes.
- Validated quote, trade, candle, order-book snapshot, and order-book delta
  records that preserve decimal strings.
- Sequence tracking, bounded event deduplication, and freshness monitoring.
- Pure backoff calculation and injectable-clock request budgets.
- A generic bounded priority queue with three explicit overflow policies.
- TypeScript declarations, usage examples, a reproducible benchmark, focused
  tests, and package verification in CI.
