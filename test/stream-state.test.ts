import { describe, expect, it } from "vitest";

import {
  BoundedEventDeduplicator,
  FreshnessMonitor,
  SequenceTracker,
} from "../src/stream-state.js";

describe("SequenceTracker", () => {
  it("accepts the first value and contiguous values", () => {
    const tracker = new SequenceTracker();
    expect(tracker.observe(10)).toEqual({
      status: "accepted",
      received: 10,
    });
    expect(tracker.observe(11)).toEqual({
      status: "accepted",
      received: 11,
      previous: 10,
    });
  });

  it("reports duplicates, stale values, and gaps without advancing", () => {
    const tracker = new SequenceTracker();
    tracker.observe(10);

    expect(tracker.observe(10).status).toBe("duplicate");
    expect(tracker.observe(9).status).toBe("stale");
    expect(tracker.observe(12)).toEqual({
      status: "gap",
      received: 12,
      previous: 10,
      expected: 11,
    });
    expect(tracker.lastSequence).toBe(10);
  });

  it("resets to an empty or specified sequence", () => {
    const tracker = new SequenceTracker();
    tracker.observe(5);
    tracker.reset();
    expect(tracker.lastSequence).toBeUndefined();
    tracker.reset(20);
    expect(tracker.observe(21).status).toBe("accepted");
  });
});
describe("BoundedEventDeduplicator", () => {
  it("recognizes duplicates and evicts the oldest identifier", () => {
    const deduplicator = new BoundedEventDeduplicator(2);
    expect(deduplicator.remember("a")).toBe(true);
    expect(deduplicator.remember("a")).toBe(false);
    expect(deduplicator.remember("b")).toBe(true);
    expect(deduplicator.remember("c")).toBe(true);
    expect(deduplicator.remember("a")).toBe(true);
    expect(deduplicator.size).toBe(2);
  });

  it("validates capacity and identifiers", () => {
    expect(() => new BoundedEventDeduplicator(0)).toThrow(
      "positive safe integer",
    );
    const deduplicator = new BoundedEventDeduplicator();
    expect(() => deduplicator.remember(" bad ")).toThrow(
      "without surrounding whitespace",
    );
  });
});

describe("FreshnessMonitor", () => {
  it("reports unknown, fresh, and stale states", () => {
    let now = 1_000;
    const monitor = new FreshnessMonitor({
      staleAfterMs: 500,
      now: () => now,
    });

    expect(monitor.snapshot()).toEqual({ status: "unknown" });
    monitor.update();
    expect(monitor.snapshot()).toEqual({
      status: "fresh",
      ageMs: 0,
      updatedAt: 1_000,
    });
    now = 1_501;
    expect(monitor.snapshot()).toEqual({
      status: "stale",
      ageMs: 501,
      updatedAt: 1_000,
    });
  });

  it("rejects future updates and a clock that moves backward", () => {
    let now = 100;
    const monitor = new FreshnessMonitor({
      staleAfterMs: 10,
      now: () => now,
    });
    expect(() => monitor.update(101)).toThrow("must not be in the future");
    now = 99;
    expect(() => monitor.snapshot()).toThrow("monotonic");
  });
});
