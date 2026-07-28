import { describe, expect, it } from "vitest";

import { BoundedPriorityQueue } from "../src/priority-queue.js";

interface Item {
  name: string;
  priority: number;
}

const priority = (item: Item) => item.priority;

describe("BoundedPriorityQueue", () => {
  it("dequeues highest priority first and preserves FIFO ties", () => {
    const queue = new BoundedPriorityQueue<Item>({ capacity: 4, priority });
    queue.enqueue({ name: "low", priority: 1 });
    queue.enqueue({ name: "high-first", priority: 3 });
    queue.enqueue({ name: "high-second", priority: 3 });

    expect(queue.peek()?.name).toBe("high-first");
    expect(queue.dequeue()?.name).toBe("high-first");
    expect(queue.dequeue()?.name).toBe("high-second");
    expect(queue.dequeue()?.name).toBe("low");
    expect(queue.dequeue()).toBeUndefined();
  });

  it("rejects new values under reject-new overflow", () => {
    const queue = new BoundedPriorityQueue<Item>({ capacity: 1, priority });
    queue.enqueue({ name: "kept", priority: 1 });

    expect(queue.enqueue({ name: "rejected", priority: 9 })).toEqual({
      accepted: false,
    });
    expect(queue.peek()?.name).toBe("kept");
  });

  it("drops the oldest value under drop-oldest overflow", () => {
    const queue = new BoundedPriorityQueue<Item>({
      capacity: 2,
      priority,
      overflow: "drop-oldest",
    });
    queue.enqueue({ name: "oldest", priority: 9 });
    queue.enqueue({ name: "newer", priority: 1 });

    expect(queue.enqueue({ name: "newest", priority: 2 })).toEqual({
      accepted: true,
      dropped: { name: "oldest", priority: 9 },
    });
    expect(queue.size).toBe(2);
  });

  it("admits only higher-priority values under drop-lowest overflow", () => {
    const queue = new BoundedPriorityQueue<Item>({
      capacity: 2,
      priority,
      overflow: "drop-lowest",
    });
    queue.enqueue({ name: "low", priority: 1 });
    queue.enqueue({ name: "high", priority: 3 });

    expect(queue.enqueue({ name: "too-low", priority: 1 })).toEqual({
      accepted: false,
    });
    expect(queue.enqueue({ name: "middle", priority: 2 })).toEqual({
      accepted: true,
      dropped: { name: "low", priority: 1 },
    });
    expect(queue.dequeue()?.name).toBe("high");
    expect(queue.dequeue()?.name).toBe("middle");
  });

  it("rejects invalid capacities and priorities", () => {
    expect(
      () => new BoundedPriorityQueue({ capacity: 0, priority }),
    ).toThrow("capacity");

    const queue = new BoundedPriorityQueue<Item>({
      capacity: 1,
      priority: () => Number.NaN,
    });
    expect(() => queue.enqueue({ name: "bad", priority: 0 })).toThrow(
      "finite",
    );
  });
});
