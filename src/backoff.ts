export interface BackoffPolicy {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly factor?: number;
  readonly jitter?: number;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

export function calculateBackoffDelay(
  attempt: number,
  policy: BackoffPolicy,
  random: () => number = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new RangeError("attempt must be a non-negative safe integer");
  }

  assertFiniteNonNegative(policy.initialDelayMs, "initialDelayMs");
  assertFiniteNonNegative(policy.maxDelayMs, "maxDelayMs");
  if (policy.maxDelayMs < policy.initialDelayMs) {
    throw new RangeError("maxDelayMs must be at least initialDelayMs");
  }

  const factor = policy.factor ?? 2;
  if (!Number.isFinite(factor) || factor < 1) {
    throw new RangeError("factor must be a finite number greater than or equal to 1");
  }

  const jitter = policy.jitter ?? 0;
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
    throw new RangeError("jitter must be between 0 and 1");
  }

  const exponentialDelay =
    policy.initialDelayMs === 0
      ? 0
      : policy.initialDelayMs * factor ** attempt;
  const baseDelay = Math.min(policy.maxDelayMs, exponentialDelay);
  if (jitter === 0) {
    return Math.round(baseDelay);
  }

  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample > 1) {
    throw new RangeError("random must return a finite number between 0 and 1");
  }

  const jittered = baseDelay * (1 - jitter + 2 * jitter * sample);
  return Math.round(Math.min(policy.maxDelayMs, Math.max(0, jittered)));
}

export interface RequestBudgetOptions {
  readonly capacity: number;
  readonly refillPerSecond: number;
  readonly now?: () => number;
}

export class RequestBudget {
  readonly #capacity: number;
  readonly #refillPerMillisecond: number;
  readonly #now: () => number;
  #tokens: number;
  #lastUpdatedAt: number;

  constructor(options: RequestBudgetOptions) {
    if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
      throw new RangeError("capacity must be a finite positive number");
    }
    assertFiniteNonNegative(options.refillPerSecond, "refillPerSecond");

    this.#capacity = options.capacity;
    this.#refillPerMillisecond = options.refillPerSecond / 1_000;
    this.#now = options.now ?? Date.now;
    this.#tokens = options.capacity;
    this.#lastUpdatedAt = this.#readTime();
  }

  tryConsume(tokens = 1): boolean {
    this.#assertTokenCount(tokens);
    this.#refill();
    if (tokens > this.#tokens) {
      return false;
    }
    this.#tokens -= tokens;
    return true;
  }

  available(): number {
    this.#refill();
    return this.#tokens;
  }

  timeUntilAvailable(tokens = 1): number {
    this.#assertTokenCount(tokens);
    this.#refill();
    if (tokens <= this.#tokens) {
      return 0;
    }
    if (tokens > this.#capacity || this.#refillPerMillisecond === 0) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.ceil((tokens - this.#tokens) / this.#refillPerMillisecond);
  }

  #assertTokenCount(tokens: number): void {
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new RangeError("tokens must be a finite positive number");
    }
  }

  #readTime(): number {
    const value = this.#now();
    if (!Number.isFinite(value)) {
      throw new RangeError("now must return a finite millisecond timestamp");
    }
    return value;
  }

  #refill(): void {
    const currentTime = this.#readTime();
    if (currentTime < this.#lastUpdatedAt) {
      throw new RangeError("now must be monotonic");
    }

    const elapsed = currentTime - this.#lastUpdatedAt;
    this.#tokens = Math.min(
      this.#capacity,
      this.#tokens + elapsed * this.#refillPerMillisecond,
    );
    this.#lastUpdatedAt = currentTime;
  }
}
