import { describe, expect, it } from "vitest";

import {
  SymbolAdapterRegistry,
  formatMarketSymbol,
  parseMarketSymbol,
  type SymbolAdapter,
} from "../src/symbols.js";

describe("market symbols", () => {
  it("parses and formats canonical spot and perpetual symbols", () => {
    expect(parseMarketSymbol("spot:btc/usd")).toEqual({
      kind: "spot",
      base: "BTC",
      quote: "USD",
    });
    expect(
      formatMarketSymbol({
        kind: "perpetual",
        base: "eth",
        quote: "usdc",
      }),
    ).toBe("perpetual:ETH/USDC");
  });

  it.each([
    "",
    " BTC/USD",
    "BTC/USD",
    "future:BTC/USD",
    "spot:/USD",
    "spot:BTC/",
    "spot:BT C/USD",
  ])("rejects malformed canonical input: %s", (value) => {
    expect(() => parseMarketSymbol(value)).toThrow(TypeError);
  });
});

describe("SymbolAdapterRegistry", () => {
  const adapter: SymbolAdapter = {
    toCanonical(value) {
      const [base, quote] = value.split("-");
      return { kind: "spot", base: base!, quote: quote! };
    },
    fromCanonical(symbol) {
      return `${symbol.base}-${symbol.quote}`;
    },
  };

  it("stores caller-supplied adapters without built-in mappings", () => {
    const registry = new SymbolAdapterRegistry();
    registry.register("sample", adapter);

    expect(registry.get("sample").toCanonical("ABC-XYZ")).toEqual({
      kind: "spot",
      base: "ABC",
      quote: "XYZ",
    });
  });

  it("rejects duplicate, invalid, and unknown adapter names", () => {
    const registry = new SymbolAdapterRegistry();
    registry.register("sample", adapter);

    expect(() => registry.register("sample", adapter)).toThrow(
      "already registered",
    );
    expect(() => registry.register("Sample", adapter)).toThrow(TypeError);
    expect(() => registry.get("missing")).toThrow("not registered");
  });
});
