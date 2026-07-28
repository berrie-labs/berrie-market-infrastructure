import { describe, expect, it } from "vitest";

import {
  createMarketCandle,
  createMarketQuote,
  createMarketTrade,
  createOrderBookDelta,
  createOrderBookSnapshot,
} from "../src/market-data.js";

const symbol = { kind: "spot" as const, base: "abc", quote: "usd" };

describe("market data", () => {
  it("normalizes a quote without converting decimal values to numbers", () => {
    const quote = createMarketQuote({
      symbol,
      timestamp: "2026-01-01T00:00:00Z",
      bid: "100.5000",
      bidSize: "2.00",
      ask: "100.75",
      askSize: "0",
    });

    expect(quote).toEqual({
      symbol: { kind: "spot", base: "ABC", quote: "USD" },
      timestamp: "2026-01-01T00:00:00.000Z",
      bid: "100.5",
      bidSize: "2",
      ask: "100.75",
      askSize: "0",
    });
    expect(Object.isFrozen(quote)).toBe(true);
  });

  it("rejects empty and crossed quotes", () => {
    expect(() =>
      createMarketQuote({ symbol, timestamp: "2026-01-01T00:00:00Z" }),
    ).toThrow("quote must contain");
    expect(() =>
      createMarketQuote({
        symbol,
        timestamp: "2026-01-01T00:00:00Z",
        bid: "11",
        ask: "10",
      }),
    ).toThrow("bid must not exceed ask");
  });

  it("rejects numeric and exponent-form prices", () => {
    expect(() =>
      createMarketQuote({
        symbol,
        timestamp: "2026-01-01T00:00:00Z",
        bid: 10 as unknown as string,
      }),
    ).toThrow("decimal string");
    expect(() =>
      createMarketQuote({
        symbol,
        timestamp: "2026-01-01T00:00:00Z",
        bid: "1e3",
      }),
    ).toThrow("base-10 decimal");
  });

  it("creates a normalized trade", () => {
    expect(
      createMarketTrade({
        symbol,
        timestamp: "2026-01-01T00:00:00.100Z",
        price: "10.2500",
        size: "0.500",
        side: "buy",
        tradeId: "sample-1",
      }),
    ).toEqual({
      symbol: { kind: "spot", base: "ABC", quote: "USD" },
      timestamp: "2026-01-01T00:00:00.100Z",
      price: "10.25",
      size: "0.5",
      side: "buy",
      tradeId: "sample-1",
    });
  });

  it("rejects invalid trade values", () => {
    expect(() =>
      createMarketTrade({
        symbol,
        timestamp: "2026-01-01T00:00:00Z",
        price: "0",
        size: "1",
      }),
    ).toThrow("price must be greater than zero");
    expect(() =>
      createMarketTrade({
        symbol,
        timestamp: "2026-01-01T00:00:00Z",
        price: "1",
        size: "1",
        side: "unknown" as "buy",
      }),
    ).toThrow('side must be "buy" or "sell"');
  });

  it("validates candle ranges and time bounds", () => {
    const candle = createMarketCandle({
      symbol,
      interval: "1m",
      openTime: "2026-01-01T00:00:00Z",
      closeTime: "2026-01-01T00:01:00Z",
      open: "10",
      high: "12",
      low: "9",
      close: "11",
      volume: "250.00",
    });

    expect(candle.volume).toBe("250");
    expect(() =>
      createMarketCandle({ ...candle, high: "10.5" }),
    ).toThrow("high must not be below");
    expect(() =>
      createMarketCandle({ ...candle, closeTime: candle.openTime }),
    ).toThrow("closeTime must be later");
  });

  it("normalizes a sorted order-book snapshot", () => {
    const snapshot = createOrderBookSnapshot({
      symbol,
      timestamp: "2026-01-01T00:00:00Z",
      sequence: 12,
      bids: [
        { price: "10.5", size: "2" },
        { price: "10", size: "1" },
      ],
      asks: [
        { price: "11", size: "1" },
        { price: "11.5", size: "3" },
      ],
    });

    expect(snapshot.sequence).toBe(12);
    expect(Object.isFrozen(snapshot.bids)).toBe(true);
    expect(Object.isFrozen(snapshot.bids[0])).toBe(true);
  });

  it("rejects unsorted, duplicate, zero-sized, and oversized snapshots", () => {
    const base = {
      symbol,
      timestamp: "2026-01-01T00:00:00Z",
      sequence: 1,
      asks: [] as const,
    };
    expect(() =>
      createOrderBookSnapshot({
        ...base,
        bids: [
          { price: "10", size: "1" },
          { price: "11", size: "1" },
        ],
      }),
    ).toThrow("descending");
    expect(() =>
      createOrderBookSnapshot({
        ...base,
        bids: [
          { price: "10", size: "1" },
          { price: "10.0", size: "2" },
        ],
      }),
    ).toThrow("duplicate price");
    expect(() =>
      createOrderBookSnapshot({
        ...base,
        bids: [{ price: "10", size: "0" }],
      }),
    ).toThrow("greater than zero");
    expect(() =>
      createOrderBookSnapshot(
        { ...base, bids: [{ price: "10", size: "1" }] },
        { maxLevels: 0 },
      ),
    ).toThrow("positive safe integer");
  });

  it("allows zero-sized levels in a delta to represent deletion", () => {
    const delta = createOrderBookDelta({
      symbol,
      timestamp: "2026-01-01T00:00:01Z",
      firstSequence: 13,
      lastSequence: 14,
      bids: [{ price: "10.5", size: "0" }],
      asks: [],
    });

    expect(delta.bids[0]).toEqual({ price: "10.5", size: "0" });
  });

  it("rejects reversed delta sequence ranges", () => {
    expect(() =>
      createOrderBookDelta({
        symbol,
        timestamp: "2026-01-01T00:00:01Z",
        firstSequence: 15,
        lastSequence: 14,
        bids: [],
        asks: [],
      }),
    ).toThrow("lastSequence must be at least firstSequence");
  });
});
