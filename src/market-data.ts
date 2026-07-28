import {
  formatMarketSymbol,
  parseMarketSymbol,
  type MarketSymbol,
} from "./symbols.js";

export interface PriceLevel {
  readonly price: string;
  readonly size: string;
}

export interface MarketQuote {
  readonly symbol: MarketSymbol;
  readonly timestamp: string;
  readonly bid?: string;
  readonly bidSize?: string;
  readonly ask?: string;
  readonly askSize?: string;
}

export interface MarketTrade {
  readonly symbol: MarketSymbol;
  readonly timestamp: string;
  readonly price: string;
  readonly size: string;
  readonly side?: "buy" | "sell";
  readonly tradeId?: string;
}

export interface MarketCandle {
  readonly symbol: MarketSymbol;
  readonly interval: string;
  readonly openTime: string;
  readonly closeTime: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

export interface OrderBookSnapshot {
  readonly symbol: MarketSymbol;
  readonly timestamp: string;
  readonly sequence: number;
  readonly bids: readonly PriceLevel[];
  readonly asks: readonly PriceLevel[];
}

export interface OrderBookDelta {
  readonly symbol: MarketSymbol;
  readonly timestamp: string;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly bids: readonly PriceLevel[];
  readonly asks: readonly PriceLevel[];
}

export interface OrderBookOptions {
  readonly maxLevels?: number;
}

const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const INTERVAL_PATTERN = /^[1-9][0-9]*(?:ms|s|m|h|d|w)$/;
const DEFAULT_MAX_LEVELS = 10_000;

function normalizeSymbol(symbol: MarketSymbol): MarketSymbol {
  return parseMarketSymbol(formatMarketSymbol(symbol));
}

function normalizeTimestamp(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a timestamp string`);
  }
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError(`${field} must be a valid timestamp`);
  }
  return timestamp.toISOString();
}

function normalizeDecimal(
  value: string,
  field: string,
  allowZero: boolean,
): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a decimal string`);
  }

  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(
      `${field} must be a non-negative base-10 decimal without signs or exponents`,
    );
  }

  const fraction = match[2]?.replace(/0+$/, "");
  const normalized = fraction ? `${match[1]}.${fraction}` : match[1]!;
  if (!allowZero && normalized === "0") {
    throw new RangeError(`${field} must be greater than zero`);
  }
  return normalized;
}

function compareDecimals(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  if (leftInteger!.length !== rightInteger!.length) {
    return leftInteger!.length < rightInteger!.length ? -1 : 1;
  }
  if (leftInteger !== rightInteger) {
    return leftInteger! < rightInteger! ? -1 : 1;
  }

  const width = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(width, "0");
  const paddedRight = rightFraction.padEnd(width, "0");
  return paddedLeft === paddedRight ? 0 : paddedLeft < paddedRight ? -1 : 1;
}

function assertSequence(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

function resolveMaxLevels(options: OrderBookOptions): number {
  const maxLevels = options.maxLevels ?? DEFAULT_MAX_LEVELS;
  if (!Number.isSafeInteger(maxLevels) || maxLevels <= 0) {
    throw new RangeError("maxLevels must be a positive safe integer");
  }
  return maxLevels;
}

function normalizeLevels(
  values: readonly PriceLevel[],
  field: "bids" | "asks",
  maxLevels: number,
  allowZeroSize: boolean,
): readonly PriceLevel[] {
  if (!Array.isArray(values)) {
    throw new TypeError(`${field} must be an array`);
  }
  if (values.length > maxLevels) {
    throw new RangeError(`${field} exceeds maxLevels of ${maxLevels}`);
  }

  const prices = new Set<string>();
  const normalized = values.map((level, index) => {
    const price = normalizeDecimal(
      level?.price,
      `${field}[${index}].price`,
      false,
    );
    const size = normalizeDecimal(
      level?.size,
      `${field}[${index}].size`,
      allowZeroSize,
    );
    if (prices.has(price)) {
      throw new TypeError(`${field} contains duplicate price ${price}`);
    }
    prices.add(price);
    return Object.freeze({ price, size });
  });

  for (let index = 1; index < normalized.length; index += 1) {
    const comparison = compareDecimals(
      normalized[index - 1]!.price,
      normalized[index]!.price,
    );
    const correctlySorted = field === "bids" ? comparison > 0 : comparison < 0;
    if (!correctlySorted) {
      throw new TypeError(
        `${field} must be sorted by price ${field === "bids" ? "descending" : "ascending"}`,
      );
    }
  }

  return Object.freeze(normalized);
}

function normalizeOptionalIdentifier(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 256
  ) {
    throw new TypeError(
      `${field} must be 1-256 characters without surrounding whitespace`,
    );
  }
  return value;
}

export function createMarketQuote(input: MarketQuote): MarketQuote {
  if (input.bid === undefined && input.ask === undefined) {
    throw new TypeError("quote must contain a bid, an ask, or both");
  }
  if (input.bidSize !== undefined && input.bid === undefined) {
    throw new TypeError("bidSize requires bid");
  }
  if (input.askSize !== undefined && input.ask === undefined) {
    throw new TypeError("askSize requires ask");
  }

  const bid =
    input.bid === undefined
      ? undefined
      : normalizeDecimal(input.bid, "bid", false);
  const ask =
    input.ask === undefined
      ? undefined
      : normalizeDecimal(input.ask, "ask", false);
  if (bid !== undefined && ask !== undefined && compareDecimals(bid, ask) > 0) {
    throw new RangeError("bid must not exceed ask");
  }

  return Object.freeze({
    symbol: normalizeSymbol(input.symbol),
    timestamp: normalizeTimestamp(input.timestamp, "timestamp"),
    ...(bid === undefined ? {} : { bid }),
    ...(input.bidSize === undefined
      ? {}
      : { bidSize: normalizeDecimal(input.bidSize, "bidSize", true) }),
    ...(ask === undefined ? {} : { ask }),
    ...(input.askSize === undefined
      ? {}
      : { askSize: normalizeDecimal(input.askSize, "askSize", true) }),
  });
}

export function createMarketTrade(input: MarketTrade): MarketTrade {
  if (
    input.side !== undefined &&
    input.side !== "buy" &&
    input.side !== "sell"
  ) {
    throw new TypeError('side must be "buy" or "sell"');
  }
  const tradeId = normalizeOptionalIdentifier(input.tradeId, "tradeId");

  return Object.freeze({
    symbol: normalizeSymbol(input.symbol),
    timestamp: normalizeTimestamp(input.timestamp, "timestamp"),
    price: normalizeDecimal(input.price, "price", false),
    size: normalizeDecimal(input.size, "size", false),
    ...(input.side === undefined ? {} : { side: input.side }),
    ...(tradeId === undefined ? {} : { tradeId }),
  });
}

export function createMarketCandle(input: MarketCandle): MarketCandle {
  if (
    typeof input.interval !== "string" ||
    !INTERVAL_PATTERN.test(input.interval)
  ) {
    throw new TypeError(
      "interval must be a positive integer followed by ms, s, m, h, d, or w",
    );
  }

  const openTime = normalizeTimestamp(input.openTime, "openTime");
  const closeTime = normalizeTimestamp(input.closeTime, "closeTime");
  if (Date.parse(closeTime) <= Date.parse(openTime)) {
    throw new RangeError("closeTime must be later than openTime");
  }

  const open = normalizeDecimal(input.open, "open", false);
  const high = normalizeDecimal(input.high, "high", false);
  const low = normalizeDecimal(input.low, "low", false);
  const close = normalizeDecimal(input.close, "close", false);
  if (
    compareDecimals(low, open) > 0 ||
    compareDecimals(low, close) > 0 ||
    compareDecimals(low, high) > 0
  ) {
    throw new RangeError("low must not exceed open, high, or close");
  }
  if (
    compareDecimals(high, open) < 0 ||
    compareDecimals(high, close) < 0
  ) {
    throw new RangeError("high must not be below open or close");
  }

  return Object.freeze({
    symbol: normalizeSymbol(input.symbol),
    interval: input.interval,
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume: normalizeDecimal(input.volume, "volume", true),
  });
}

export function createOrderBookSnapshot(
  input: OrderBookSnapshot,
  options: OrderBookOptions = {},
): OrderBookSnapshot {
  assertSequence(input.sequence, "sequence");
  const maxLevels = resolveMaxLevels(options);
  return Object.freeze({
    symbol: normalizeSymbol(input.symbol),
    timestamp: normalizeTimestamp(input.timestamp, "timestamp"),
    sequence: input.sequence,
    bids: normalizeLevels(input.bids, "bids", maxLevels, false),
    asks: normalizeLevels(input.asks, "asks", maxLevels, false),
  });
}

export function createOrderBookDelta(
  input: OrderBookDelta,
  options: OrderBookOptions = {},
): OrderBookDelta {
  assertSequence(input.firstSequence, "firstSequence");
  assertSequence(input.lastSequence, "lastSequence");
  if (input.lastSequence < input.firstSequence) {
    throw new RangeError("lastSequence must be at least firstSequence");
  }

  const maxLevels = resolveMaxLevels(options);
  return Object.freeze({
    symbol: normalizeSymbol(input.symbol),
    timestamp: normalizeTimestamp(input.timestamp, "timestamp"),
    firstSequence: input.firstSequence,
    lastSequence: input.lastSequence,
    bids: normalizeLevels(input.bids, "bids", maxLevels, true),
    asks: normalizeLevels(input.asks, "asks", maxLevels, true),
  });
}
