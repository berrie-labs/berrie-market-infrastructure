export type OverflowPolicy = "reject-new" | "drop-oldest" | "drop-lowest";

export interface BoundedPriorityQueueOptions<T> {
  readonly capacity: number;
  readonly priority: (value: T) => number;
  readonly overflow?: OverflowPolicy;
}

export interface EnqueueResult<T> {
  readonly accepted: boolean;
  readonly dropped?: T;
}

interface QueueEntry<T> {
  readonly value: T;
  readonly priority: number;
  readonly sequence: number;
}

export class BoundedPriorityQueue<T> {
  readonly #capacity: number;
  readonly #priority: (value: T) => number;
  readonly #overflow: OverflowPolicy;
  readonly #entries: QueueEntry<T>[] = [];
  #nextSequence = 0;

  constructor(options: BoundedPriorityQueueOptions<T>) {
    if (!Number.isSafeInteger(options.capacity) || options.capacity <= 0) {
      throw new RangeError("capacity must be a positive safe integer");
    }
    if (typeof options.priority !== "function") {
      throw new TypeError("priority must be a function");
    }
    if (
      options.overflow !== undefined &&
      options.overflow !== "reject-new" &&
      options.overflow !== "drop-oldest" &&
      options.overflow !== "drop-lowest"
    ) {
      throw new TypeError("overflow must be a supported overflow policy");
    }

    this.#capacity = options.capacity;
    this.#priority = options.priority;
    this.#overflow = options.overflow ?? "reject-new";
  }

  get size(): number {
    return this.#entries.length;
  }

  enqueue(value: T): EnqueueResult<T> {
    const priority = this.#priority(value);
    if (!Number.isFinite(priority)) {
      throw new RangeError("priority must return a finite number");
    }

    if (this.#entries.length < this.#capacity) {
      this.#append(value, priority);
      return { accepted: true };
    }

    if (this.#overflow === "reject-new") {
      return { accepted: false };
    }

    if (this.#overflow === "drop-oldest") {
      const oldestIndex = this.#findOldestIndex();
      const dropped = this.#entries.splice(oldestIndex, 1)[0]!.value;
      this.#append(value, priority);
      return { accepted: true, dropped };
    }

    const lowestIndex = this.#findLowestIndex();
    const lowest = this.#entries[lowestIndex]!;
    if (priority <= lowest.priority) {
      return { accepted: false };
    }

    const dropped = this.#entries.splice(lowestIndex, 1)[0]!.value;
    this.#append(value, priority);
    return { accepted: true, dropped };
  }

  dequeue(): T | undefined {
    const index = this.#findHighestIndex();
    return index === -1 ? undefined : this.#entries.splice(index, 1)[0]!.value;
  }

  peek(): T | undefined {
    const index = this.#findHighestIndex();
    return index === -1 ? undefined : this.#entries[index]!.value;
  }

  #append(value: T, priority: number): void {
    this.#entries.push({
      value,
      priority,
      sequence: this.#nextSequence++,
    });
  }

  #findHighestIndex(): number {
    let selected = -1;
    for (let index = 0; index < this.#entries.length; index += 1) {
      const entry = this.#entries[index]!;
      const current = selected === -1 ? undefined : this.#entries[selected]!;
      if (
        current === undefined ||
        entry.priority > current.priority ||
        (entry.priority === current.priority &&
          entry.sequence < current.sequence)
      ) {
        selected = index;
      }
    }
    return selected;
  }

  #findOldestIndex(): number {
    let selected = 0;
    for (let index = 1; index < this.#entries.length; index += 1) {
      if (
        this.#entries[index]!.sequence <
        this.#entries[selected]!.sequence
      ) {
        selected = index;
      }
    }
    return selected;
  }

  #findLowestIndex(): number {
    let selected = 0;
    for (let index = 1; index < this.#entries.length; index += 1) {
      const entry = this.#entries[index]!;
      const current = this.#entries[selected]!;
      if (
        entry.priority < current.priority ||
        (entry.priority === current.priority &&
          entry.sequence < current.sequence)
      ) {
        selected = index;
      }
    }
    return selected;
  }
}
