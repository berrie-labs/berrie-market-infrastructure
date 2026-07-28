import { describe, expect, it } from "vitest";

import { createMarketEvent } from "../src/events.js";

const baseInput = {
  type: "quote.updated",
  source: "fixture",
  symbol: { kind: "spot" as const, base: "abc", quote: "usd" },
  occurredAt: "2026-07-27T12:00:00Z",
  receivedAt: "2026-07-27T12:00:00.250Z",
  sequence: 7,
};

describe("createMarketEvent", () => {
  it("produces deterministic envelopes independent of object key order", () => {
    const first = createMarketEvent({
      ...baseInput,
      payload: { bid: 10, ask: 11, levels: [1, 2] },
      metadata: { replay: false, partition: 2 },
    });
    const second = createMarketEvent({
      ...baseInput,
      payload: { levels: [1, 2], ask: 11, bid: 10 },
      metadata: { partition: 2, replay: false },
    });

    expect(first.id).toBe(second.id);
    expect(first.id).toMatch(/^evt_[0-9a-f]{16}$/);
    expect(first.symbol).toEqual({
      kind: "spot",
      base: "ABC",
      quote: "USD",
    });
    expect(first.occurredAt).toBe("2026-07-27T12:00:00.000Z");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.payload)).toBe(true);
  });

  it("changes the identifier when envelope content changes", () => {
    const first = createMarketEvent({ ...baseInput, payload: { value: 1 } });
    const second = createMarketEvent({ ...baseInput, payload: { value: 2 } });

    expect(first.id).not.toBe(second.id);
  });

  it("enforces payload and metadata bounds", () => {
    expect(() =>
      createMarketEvent(
        { ...baseInput, payload: { value: "too large" } },
        { maxPayloadBytes: 4 },
      ),
    ).toThrow("maximum is 4");

    expect(() =>
      createMarketEvent(
        {
          ...baseInput,
          payload: null,
          metadata: { one: 1, two: 2 },
        },
        { maxMetadataEntries: 1 },
      ),
    ).toThrow("maximum is 1");

    expect(() =>
      createMarketEvent(
        { ...baseInput, payload: null },
        { maxPayloadDepth: 0 },
      ),
    ).toThrow("maxPayloadDepth must be a positive safe integer");
    expect(() =>
      createMarketEvent(
        { ...baseInput, payload: null },
        { maxPayloadNodes: 1.5 },
      ),
    ).toThrow("maxPayloadNodes must be a positive safe integer");
  });

  it("rejects deeply nested payloads with a controlled traversal error", () => {
    let payload: unknown = null;
    for (let depth = 0; depth < 20_000; depth += 1) {
      payload = [payload];
    }

    let thrown: unknown;
    try {
      createMarketEvent(
        { ...baseInput, payload },
        { maxPayloadBytes: 16 },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RangeError);
    expect((thrown as Error).message).toBe(
      "payload exceeds maxPayloadDepth of 64",
    );
    expect((thrown as Error).message).not.toContain(
      "Maximum call stack size exceeded",
    );
  });

  it("rejects traversal settings above the non-overridable safe ceilings", () => {
    let payload: unknown = null;
    for (let depth = 0; depth < 20_000; depth += 1) {
      payload = [payload];
    }

    let depthError: unknown;
    try {
      createMarketEvent(
        { ...baseInput, payload },
        { maxPayloadDepth: 20_000 },
      );
    } catch (error) {
      depthError = error;
    }

    expect(depthError).toBeInstanceOf(RangeError);
    expect((depthError as Error).message).toBe(
      "maxPayloadDepth must be no greater than 64",
    );
    expect((depthError as Error).message).not.toContain(
      "Maximum call stack size exceeded",
    );

    expect(() =>
      createMarketEvent(
        { ...baseInput, payload: null },
        { maxPayloadNodes: 10_001 },
      ),
    ).toThrow("maxPayloadNodes must be no greater than 10000");
  });

  it("rejects wide payloads before iterating beyond the node budget", () => {
    const payload = [0, 1, 2, 3];
    Object.defineProperty(payload, 0, {
      enumerable: true,
      get() {
        throw new Error("payload entry must not be visited");
      },
    });

    expect(() =>
      createMarketEvent(
        { ...baseInput, payload },
        { maxPayloadNodes: 4 },
      ),
    ).toThrow("payload exceeds maxPayloadNodes of 4");
  });

  it("rejects unsafe payloads and invalid envelope fields", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const sparse = new Array(1);
    const symbolKeyed = { visible: true, [Symbol("hidden")]: true };

    expect(() =>
      createMarketEvent({ ...baseInput, payload: circular }),
    ).toThrow("circular");
    expect(() =>
      createMarketEvent({ ...baseInput, payload: { value: Number.NaN } }),
    ).toThrow("non-finite");
    expect(() =>
      createMarketEvent({
        ...baseInput,
        occurredAt: "not-a-timestamp",
        payload: null,
      }),
    ).toThrow("valid timestamp");
    expect(() =>
      createMarketEvent({ ...baseInput, sequence: -1, payload: null }),
    ).toThrow("sequence");
    expect(() =>
      createMarketEvent({ ...baseInput, payload: sparse }),
    ).toThrow("sparse");
    expect(() =>
      createMarketEvent({ ...baseInput, payload: symbolKeyed }),
    ).toThrow("symbol-keyed");
  });

  it("preserves special JSON object keys without prototype mutation", () => {
    const payload = JSON.parse('{"__proto__":{"safe":true}}') as Record<
      string,
      unknown
    >;

    const event = createMarketEvent({ ...baseInput, payload });

    expect(Object.hasOwn(event.payload, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(event.payload)).toBe(Object.prototype);
    expect(({} as { safe?: boolean }).safe).toBeUndefined();
  });
});
