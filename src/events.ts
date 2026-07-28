import {
  formatMarketSymbol,
  parseMarketSymbol,
  type MarketSymbol,
} from "./symbols.js";

export type MarketEventMetadataValue = string | number | boolean | null;
export type MarketEventMetadata = Readonly<
  Record<string, MarketEventMetadataValue>
>;

export interface MarketEvent<TType extends string, TPayload> {
  readonly id: string;
  readonly type: TType;
  readonly source: string;
  readonly symbol?: MarketSymbol;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly sequence?: number;
  readonly payload: TPayload;
  readonly metadata?: MarketEventMetadata;
}

export interface CreateMarketEventOptions {
  readonly maxPayloadBytes?: number;
  readonly maxMetadataEntries?: number;
  readonly maxPayloadDepth?: number;
  readonly maxPayloadNodes?: number;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const DEFAULT_MAX_PAYLOAD_BYTES = 65_536;
const DEFAULT_MAX_METADATA_ENTRIES = 32;
const DEFAULT_MAX_PAYLOAD_DEPTH = 64;
const DEFAULT_MAX_PAYLOAD_NODES = 10_000;
const textEncoder = new TextEncoder();

interface PayloadTraversalState {
  readonly maxDepth: number;
  readonly maxNodes: number;
  nodesVisited: number;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} must be nonempty without surrounding whitespace`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError(`${field} must be a valid timestamp`);
  }
  return timestamp.toISOString();
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer`);
  }
}

function assertTraversalLimit(
  value: number,
  field: string,
  safeMaximum: number,
): void {
  assertPositiveInteger(value, field);
  if (value > safeMaximum) {
    throw new RangeError(`${field} must be no greater than ${safeMaximum}`);
  }
}

function assertPayloadDepth(
  depth: number,
  state: PayloadTraversalState,
): void {
  if (depth > state.maxDepth) {
    throw new RangeError(
      `payload exceeds maxPayloadDepth of ${state.maxDepth}`,
    );
  }
}

function consumePayloadNode(state: PayloadTraversalState): void {
  if (state.nodesVisited >= state.maxNodes) {
    throw new RangeError(
      `payload exceeds maxPayloadNodes of ${state.maxNodes}`,
    );
  }
  state.nodesVisited += 1;
}

function assertContainerFits(
  childCount: number,
  state: PayloadTraversalState,
): void {
  if (childCount > state.maxNodes - state.nodesVisited) {
    throw new RangeError(
      `payload exceeds maxPayloadNodes of ${state.maxNodes}`,
    );
  }
}

function normalizeJson(
  value: unknown,
  seen: Set<object>,
  path: string,
  depth: number,
  state: PayloadTraversalState,
): JsonValue {
  assertPayloadDepth(depth, state);
  consumePayloadNode(state);

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must not contain non-finite numbers`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} must contain only JSON-compatible values`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${path} must not contain circular references`);
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      assertContainerFits(value.length, state);
      const normalized: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError(`${path} must not contain sparse array entries`);
        }
        const childDepth = depth + 1;
        assertPayloadDepth(childDepth, state);
        normalized.push(
          normalizeJson(
            value[index],
            seen,
            `${path}[${index}]`,
            childDepth,
            state,
          ),
        );
      }
      return Object.freeze(normalized);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain objects and arrays`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`${path} must not contain symbol-keyed properties`);
    }

    const keys = Object.keys(value);
    assertContainerFits(keys.length, state);
    const normalized: Record<string, JsonValue> = {};
    for (const key of keys.sort()) {
      const childDepth = depth + 1;
      assertPayloadDepth(childDepth, state);
      Object.defineProperty(normalized, key, {
        configurable: true,
        enumerable: true,
        value: normalizeJson(
          (value as Record<string, unknown>)[key],
          seen,
          `${path}.${key}`,
          childDepth,
          state,
        ),
        writable: true,
      });
    }
    return Object.freeze(normalized);
  } finally {
    seen.delete(value);
  }
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, JsonValue>)[key]!,
        )}`,
    )
    .join(",")}}`;
}

function deterministicId(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of textEncoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `evt_${hash.toString(16).padStart(16, "0")}`;
}

function normalizeMetadata(
  metadata: MarketEventMetadata | undefined,
  maxEntries: number,
): MarketEventMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const entries = Object.entries(metadata);
  if (entries.length > maxEntries) {
    throw new RangeError(
      `metadata contains ${entries.length} entries; maximum is ${maxEntries}`,
    );
  }

  const normalized: Record<string, MarketEventMetadataValue> = {};
  for (const [key, value] of entries.sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    assertNonEmpty(key, "metadata key");
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new TypeError(
        "metadata values must be strings, finite numbers, booleans, or null",
      );
    }
    Object.defineProperty(normalized, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
  return Object.freeze(normalized);
}

export function createMarketEvent<TType extends string, TPayload>(
  input: Omit<MarketEvent<TType, TPayload>, "id">,
  options: CreateMarketEventOptions = {},
): MarketEvent<TType, TPayload> {
  const maxPayloadBytes =
    options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxMetadataEntries =
    options.maxMetadataEntries ?? DEFAULT_MAX_METADATA_ENTRIES;
  const maxPayloadDepth =
    options.maxPayloadDepth ?? DEFAULT_MAX_PAYLOAD_DEPTH;
  const maxPayloadNodes =
    options.maxPayloadNodes ?? DEFAULT_MAX_PAYLOAD_NODES;
  assertTraversalLimit(
    maxPayloadDepth,
    "maxPayloadDepth",
    DEFAULT_MAX_PAYLOAD_DEPTH,
  );
  assertTraversalLimit(
    maxPayloadNodes,
    "maxPayloadNodes",
    DEFAULT_MAX_PAYLOAD_NODES,
  );
  assertPositiveInteger(maxPayloadBytes, "maxPayloadBytes");
  assertPositiveInteger(maxMetadataEntries, "maxMetadataEntries");
  assertNonEmpty(input.type, "type");
  assertNonEmpty(input.source, "source");

  if (
    input.sequence !== undefined &&
    (!Number.isSafeInteger(input.sequence) || input.sequence < 0)
  ) {
    throw new RangeError("sequence must be a non-negative safe integer");
  }

  const payload = normalizeJson(input.payload, new Set(), "payload", 0, {
    maxDepth: maxPayloadDepth,
    maxNodes: maxPayloadNodes,
    nodesVisited: 0,
  });
  const payloadBytes = textEncoder.encode(stableStringify(payload)).byteLength;
  if (payloadBytes > maxPayloadBytes) {
    throw new RangeError(
      `payload is ${payloadBytes} bytes; maximum is ${maxPayloadBytes}`,
    );
  }

  const symbol =
    input.symbol === undefined
      ? undefined
      : parseMarketSymbol(formatMarketSymbol(input.symbol));
  const occurredAt = normalizeTimestamp(input.occurredAt, "occurredAt");
  const receivedAt = normalizeTimestamp(input.receivedAt, "receivedAt");
  const metadata = normalizeMetadata(input.metadata, maxMetadataEntries);

  const identity: Record<string, JsonValue> = {
    type: input.type,
    source: input.source,
    occurredAt,
    receivedAt,
    payload,
  };
  if (symbol !== undefined) {
    identity.symbol = formatMarketSymbol(symbol);
  }
  if (input.sequence !== undefined) {
    identity.sequence = input.sequence;
  }
  if (metadata !== undefined) {
    identity.metadata = metadata as Record<string, JsonValue>;
  }

  return Object.freeze({
    id: deterministicId(stableStringify(identity)),
    type: input.type,
    source: input.source,
    ...(symbol === undefined ? {} : { symbol }),
    occurredAt,
    receivedAt,
    ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
    payload: payload as TPayload,
    ...(metadata === undefined ? {} : { metadata }),
  });
}
