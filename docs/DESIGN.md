# Design

## Purpose

Market-data services repeatedly need the same small pieces: normalized symbols,
bounded event records, sequence checks, freshness state, request budgets, and
queues with predictable overflow behavior. This package keeps those pieces
independent from transport clients and application policy.

## Data representation

Prices, sizes, and volumes are decimal strings. Validation removes redundant
trailing zeros without converting values to JavaScript numbers. This avoids
adding an implicit precision policy to a transport-neutral package.

Timestamps are normalized to ISO 8601 UTC strings. Sequence values are
non-negative safe integers.

## Resource bounds

Every collection that may grow from external input has a caller-visible bound:

- event payloads have byte, depth, and node limits
- metadata has an entry limit
- order books have a level limit
- event deduplication has a fixed capacity
- priority queues have a fixed capacity and overflow policy

The package rejects input that exceeds a bound. It does not truncate market
records silently.

## Determinism

Time and randomness can be injected where they affect observable behavior.
Event identifiers derive from a stable representation of the normalized
envelope. Callers can reproduce tests without replacing global clocks or random
sources.

## Error handling

Validation failures throw `TypeError` for malformed values and `RangeError` for
values outside accepted bounds. Stateful helpers return explicit status values
for normal stream conditions such as duplicates and sequence gaps.

## Exclusions

The package does not own transport connections, persistence, account state,
execution, routing, recommendations, or retries. Those decisions remain with
the application using the primitives.
