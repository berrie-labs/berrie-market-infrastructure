# Berrie Market Infrastructure

Typed, resource-bounded building blocks for market-data services.

The package provides canonical symbols, validated market records, deterministic
event envelopes, stream integrity checks, request budgets, backoff calculation,
and bounded priority queues. It performs no network requests and has no runtime
dependencies.

## Requirements

- Node.js 20 or newer
- TypeScript 5.8 or newer for source development

The package name is `@berrie-labs/market-infrastructure`. Until the first
registry release, install the repository directly:

```sh
npm install github:berrie-labs/berrie-market-infrastructure
```

## Example

```ts
import {
  BoundedEventDeduplicator,
  FreshnessMonitor,
  SequenceTracker,
  createMarketQuote,
  parseMarketSymbol,
} from "@berrie-labs/market-infrastructure";

const symbol = parseMarketSymbol("spot:abc/usd");
const sequence = new SequenceTracker();
const deduplicator = new BoundedEventDeduplicator(1_000);
const freshness = new FreshnessMonitor({ staleAfterMs: 5_000 });

const quote = createMarketQuote({
  symbol,
  timestamp: "2026-01-01T00:00:00Z",
  bid: "10.25",
  bidSize: "4",
  ask: "10.30",
  askSize: "3",
});

if (
  sequence.observe(1).status === "accepted" &&
  deduplicator.remember("quote-1")
) {
  freshness.update(Date.parse(quote.timestamp));
}
```

Run the complete example locally with `npm run example`.

## Modules

### Symbols

Canonical symbols use `spot:BASE/QUOTE` or `perpetual:BASE/QUOTE`. Asset
identifiers are normalized to uppercase. `SymbolAdapterRegistry` accepts
caller-owned adapters without bundling any exchange mapping.

### Market data

Factories validate and freeze:

- top-of-book quotes
- trades
- candles
- order-book snapshots
- order-book deltas

Prices and sizes remain decimal strings. The package never converts them to
floating-point numbers. Order-book levels are bounded, normalized, checked for
duplicates, and required to be correctly sorted.

### Events

`createMarketEvent` accepts JSON-compatible payloads, normalizes timestamps,
applies byte, depth, node, and metadata limits, then derives a deterministic
identifier from the complete envelope.

### Stream state

`SequenceTracker` reports accepted, duplicate, stale, and gap observations.
`BoundedEventDeduplicator` retains a fixed number of identifiers.
`FreshnessMonitor` reports unknown, fresh, or stale state against an injectable
monotonic clock.

### Backoff and request budgets

`calculateBackoffDelay` is deterministic when supplied a random source.
`RequestBudget` is a token bucket with an injectable clock. The package reports
wait time but never schedules or retries a request.

### Bounded priority queue

The queue returns the highest priority item first and preserves insertion order
for ties. Its overflow policy is explicit:

- `reject-new` leaves a full queue unchanged.
- `drop-oldest` accepts a new item and removes the oldest queued item.
- `drop-lowest` accepts only a higher-priority item and removes the oldest item
  at the current minimum priority.

## Verification

```sh
npm ci
npm run verify
npm run benchmark
npm pack --dry-run
```

The benchmark is a repeatable workload description, not a performance claim.
Results depend on the runtime and host.

## Scope

This project contains general market-data infrastructure. It does not include
network clients, account access, order execution, strategy logic, venue
selection, recommendations, or hosted services. See
[Design](docs/DESIGN.md) and [Roadmap](docs/ROADMAP.md) for the maintained
boundary.

## Contributing

Read [Contributing](CONTRIBUTING.md) before opening a pull request. Report
security concerns through the process in [Security](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
