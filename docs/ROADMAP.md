# Roadmap

This roadmap describes intended work, not a release commitment. Milestones may change after public API review and implementation evidence.

## 0.1

- canonical spot and perpetual symbol model
- caller-supplied symbol adapter boundary
- typed market event envelopes
- deterministic identifiers and bounded payload metadata
- request-budget accounting
- backoff policy primitives without hidden retries
- bounded priority queue with explicit overflow behavior
- validated quotes, trades, candles, and order-book records
- sequence, deduplication, and freshness state
- TypeScript declarations, tests, and usage examples

## Later

- configurable rolling windows with explicit memory bounds
- snapshot and delta reconciliation helpers
- browser-compatible package verification
- performance characterization for documented workloads

## Not planned

- order execution
- trading strategies
- venue selection or routing
- portfolio or risk recommendations
- scoring or recommendation systems
- hosted services
