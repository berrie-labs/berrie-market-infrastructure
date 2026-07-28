export type SequenceStatus = "accepted" | "duplicate" | "stale" | "gap";

export interface SequenceObservation {
  readonly status: SequenceStatus;
  readonly received: number;
  readonly previous?: number;
  readonly expected?: number;
}

export class SequenceTracker {
  #lastSequence: number | undefined;

  get lastSequence(): number | undefined {
    return this.#lastSequence;
  }

  observe(sequence: number): SequenceObservation {
    assertSequence(sequence);
    const previous = this.#lastSequence;
    if (previous === undefined) {
      this.#lastSequence = sequence;
      return { status: "accepted", received: sequence };
    }
    if (sequence === previous) {
      return { status: "duplicate", received: sequence, previous };
    }
    if (sequence < previous) {
      return { status: "stale", received: sequence, previous };
    }

    const expected = previous + 1;
    if (sequence !== expected) {
      return { status: "gap", received: sequence, previous, expected };
    }

    this.#lastSequence = sequence;
    return { status: "accepted", received: sequence, previous };
  }

  reset(sequence?: number): void {
    if (sequence !== undefined) {
      assertSequence(sequence);
    }
    this.#lastSequence = sequence;
  }
}

export class BoundedEventDeduplicator {
  readonly #capacity: number;
  readonly #ids = new Map<string, undefined>();

  constructor(capacity = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive safe integer");
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#ids.size;
  }

  remember(id: string): boolean {
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.trim() !== id ||
      id.length > 512
    ) {
      throw new TypeError(
        "id must be 1-512 characters without surrounding whitespace",
      );
    }
    if (this.#ids.has(id)) {
      return false;
    }

    this.#ids.set(id, undefined);
    if (this.#ids.size > this.#capacity) {
      const oldest = this.#ids.keys().next().value as string | undefined;
      if (oldest !== undefined) {
        this.#ids.delete(oldest);
      }
    }
    return true;
  }

  clear(): void {
    this.#ids.clear();
  }
}

export type FreshnessStatus = "unknown" | "fresh" | "stale";

export interface FreshnessSnapshot {
  readonly status: FreshnessStatus;
  readonly ageMs?: number;
  readonly updatedAt?: number;
}

export interface FreshnessMonitorOptions {
  readonly staleAfterMs: number;
  readonly now?: () => number;
}

export class FreshnessMonitor {
  readonly #staleAfterMs: number;
  readonly #now: () => number;
  #updatedAt: number | undefined;
  #lastReadAt = Number.NEGATIVE_INFINITY;

  constructor(options: FreshnessMonitorOptions) {
    if (
      !Number.isFinite(options.staleAfterMs) ||
      options.staleAfterMs < 0
    ) {
      throw new RangeError("staleAfterMs must be a finite non-negative number");
    }
    this.#staleAfterMs = options.staleAfterMs;
    this.#now = options.now ?? Date.now;
    this.#lastReadAt = this.#readTime();
  }

  update(timestamp = this.#readTime()): void {
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new RangeError("timestamp must be a finite non-negative number");
    }
    const now = this.#readTime();
    if (timestamp > now) {
      throw new RangeError("timestamp must not be in the future");
    }
    if (this.#updatedAt !== undefined && timestamp < this.#updatedAt) {
      throw new RangeError("timestamp must not move backward");
    }
    this.#updatedAt = timestamp;
  }

  snapshot(): FreshnessSnapshot {
    const now = this.#readTime();
    if (this.#updatedAt === undefined) {
      return { status: "unknown" };
    }
    const ageMs = now - this.#updatedAt;
    return {
      status: ageMs > this.#staleAfterMs ? "stale" : "fresh",
      ageMs,
      updatedAt: this.#updatedAt,
    };
  }

  clear(): void {
    this.#updatedAt = undefined;
  }

  #readTime(): number {
    const value = this.#now();
    if (!Number.isFinite(value) || value < this.#lastReadAt) {
      throw new RangeError("now must return monotonic finite timestamps");
    }
    this.#lastReadAt = value;
    return value;
  }
}

function assertSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("sequence must be a non-negative safe integer");
  }
}
