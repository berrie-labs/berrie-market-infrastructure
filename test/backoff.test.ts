import { describe, expect, it } from "vitest";

import { RequestBudget, calculateBackoffDelay } from "../src/backoff.js";

describe("calculateBackoffDelay", () => {
  it("calculates capped exponential delays", () => {
    const policy = { initialDelayMs: 100, maxDelayMs: 1_000, factor: 2 };

    expect(calculateBackoffDelay(0, policy)).toBe(100);
    expect(calculateBackoffDelay(3, policy)).toBe(800);
    expect(calculateBackoffDelay(8, policy)).toBe(1_000);
    expect(
      calculateBackoffDelay(Number.MAX_SAFE_INTEGER, {
        initialDelayMs: 0,
        maxDelayMs: 1_000,
      }),
    ).toBe(0);
  });

  it("uses injected randomness for deterministic jitter", () => {
    const policy = {
      initialDelayMs: 100,
      maxDelayMs: 1_000,
      jitter: 0.25,
    };

    expect(calculateBackoffDelay(1, policy, () => 0)).toBe(150);
    expect(calculateBackoffDelay(1, policy, () => 0.5)).toBe(200);
    expect(calculateBackoffDelay(1, policy, () => 1)).toBe(250);
  });

  it("rejects invalid attempts, policies, and random samples", () => {
    expect(() =>
      calculateBackoffDelay(-1, {
        initialDelayMs: 1,
        maxDelayMs: 2,
      }),
    ).toThrow("attempt");
    expect(() =>
      calculateBackoffDelay(0, {
        initialDelayMs: 2,
        maxDelayMs: 1,
      }),
    ).toThrow("maxDelayMs");
    expect(() =>
      calculateBackoffDelay(
        0,
        { initialDelayMs: 1, maxDelayMs: 2, jitter: 1 },
        () => 2,
      ),
    ).toThrow("random");
  });
});

describe("RequestBudget", () => {
  it("refills against an injected monotonic clock", () => {
    let now = 1_000;
    const budget = new RequestBudget({
      capacity: 4,
      refillPerSecond: 2,
      now: () => now,
    });

    expect(budget.tryConsume(4)).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.timeUntilAvailable()).toBe(500);

    now += 250;
    expect(budget.available()).toBe(0.5);
    expect(budget.timeUntilAvailable()).toBe(250);

    now += 250;
    expect(budget.tryConsume()).toBe(true);
    expect(budget.available()).toBe(0);
  });

  it("reports impossible waits and rejects backwards time", () => {
    let now = 10;
    const budget = new RequestBudget({
      capacity: 2,
      refillPerSecond: 0,
      now: () => now,
    });

    expect(budget.tryConsume(2)).toBe(true);
    expect(budget.timeUntilAvailable()).toBe(Number.POSITIVE_INFINITY);
    expect(budget.timeUntilAvailable(3)).toBe(Number.POSITIVE_INFINITY);

    now = 9;
    expect(() => budget.available()).toThrow("monotonic");
  });
});
