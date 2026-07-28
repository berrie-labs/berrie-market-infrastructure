import { performance } from "node:perf_hooks";

import { BoundedPriorityQueue } from "../dist/index.js";

const iterations = 100_000;
const capacity = 1_000;
const queue = new BoundedPriorityQueue({
  capacity,
  overflow: "drop-lowest",
  priority: (item) => item.priority,
});

const startedAt = performance.now();
for (let index = 0; index < iterations; index += 1) {
  queue.enqueue({
    id: index,
    priority: (index * 48271) % 997,
  });
  if (index % 3 === 0) {
    queue.dequeue();
  }
}
while (queue.dequeue() !== undefined) {
  // Drain the fixed-capacity queue.
}
const durationMs = performance.now() - startedAt;

console.log(
  JSON.stringify({
    workload: "bounded-priority-queue",
    iterations,
    capacity,
    durationMs: Number(durationMs.toFixed(2)),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  }),
);
