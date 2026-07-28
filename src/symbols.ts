export type MarketKind = "spot" | "perpetual";

export interface MarketSymbol {
  readonly kind: MarketKind;
  readonly base: string;
  readonly quote: string;
}

export interface SymbolAdapter {
  toCanonical(value: string): MarketSymbol;
  fromCanonical(symbol: MarketSymbol): string;
}

const ASSET_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;
const CANONICAL_PATTERN =
  /^(spot|perpetual):([A-Za-z0-9][A-Za-z0-9._-]{0,31})\/([A-Za-z0-9][A-Za-z0-9._-]{0,31})$/;
const ADAPTER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function normalizeAsset(value: string, field: "base" | "quote"): string {
  const normalized = value.toUpperCase();
  if (!ASSET_PATTERN.test(normalized)) {
    throw new TypeError(
      `${field} must be 1-32 ASCII letters, digits, dots, underscores, or hyphens`,
    );
  }
  return normalized;
}

function normalizeSymbol(symbol: MarketSymbol): MarketSymbol {
  if (symbol.kind !== "spot" && symbol.kind !== "perpetual") {
    throw new TypeError('kind must be "spot" or "perpetual"');
  }

  return Object.freeze({
    kind: symbol.kind,
    base: normalizeAsset(symbol.base, "base"),
    quote: normalizeAsset(symbol.quote, "quote"),
  });
}

export function parseMarketSymbol(value: string): MarketSymbol {
  if (value.trim() !== value) {
    throw new TypeError("market symbol must not contain surrounding whitespace");
  }

  const match = CANONICAL_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(
      'market symbol must use the canonical form "spot:BASE/QUOTE" or "perpetual:BASE/QUOTE"',
    );
  }

  return normalizeSymbol({
    kind: match[1] as MarketKind,
    base: match[2]!,
    quote: match[3]!,
  });
}

export function formatMarketSymbol(symbol: MarketSymbol): string {
  const normalized = normalizeSymbol(symbol);
  return `${normalized.kind}:${normalized.base}/${normalized.quote}`;
}

export class SymbolAdapterRegistry {
  readonly #adapters = new Map<string, SymbolAdapter>();

  register(name: string, adapter: SymbolAdapter): void {
    if (!ADAPTER_NAME_PATTERN.test(name)) {
      throw new TypeError(
        "adapter name must be a lowercase identifier containing only letters, digits, dots, underscores, or hyphens",
      );
    }
    if (
      typeof adapter?.toCanonical !== "function" ||
      typeof adapter.fromCanonical !== "function"
    ) {
      throw new TypeError(
        "adapter must implement toCanonical and fromCanonical",
      );
    }
    if (this.#adapters.has(name)) {
      throw new Error(`adapter "${name}" is already registered`);
    }

    this.#adapters.set(name, adapter);
  }

  get(name: string): SymbolAdapter {
    const adapter = this.#adapters.get(name);
    if (!adapter) {
      throw new Error(`adapter "${name}" is not registered`);
    }
    return adapter;
  }
}
