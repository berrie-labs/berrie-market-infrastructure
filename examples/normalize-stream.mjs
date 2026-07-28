import {
  BoundedEventDeduplicator,
  FreshnessMonitor,
  SequenceTracker,
  createMarketEvent,
  createMarketQuote,
  parseMarketSymbol,
} from "../dist/index.js";

let now = Date.parse("2026-01-01T00:00:01Z");
const clock = () => now;
const sequence = new SequenceTracker();
const seen = new BoundedEventDeduplicator(100);
const freshness = new FreshnessMonitor({
  staleAfterMs: 5_000,
  now: clock,
});

const quote = createMarketQuote({
  symbol: parseMarketSymbol("spot:abc/usd"),
  timestamp: "2026-01-01T00:00:00Z",
  bid: "10.2500",
  bidSize: "4",
  ask: "10.3000",
  askSize: "3",
});

const event = createMarketEvent({
  type: "quote.updated",
  source: "sample-feed",
  symbol: quote.symbol,
  sequence: 1,
  occurredAt: quote.timestamp,
  receivedAt: new Date(now).toISOString(),
  payload: quote,
});

const observation = sequence.observe(event.sequence);
if (observation.status === "accepted" && seen.remember(event.id)) {
  freshness.update(Date.parse(event.receivedAt));
}

now += 1_000;
console.log(
  JSON.stringify(
    {
      eventId: event.id,
      symbol: event.symbol,
      sequence: observation,
      freshness: freshness.snapshot(),
    },
    null,
    2,
  ),
);
