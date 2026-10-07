/**
 * min-heap.test.js
 *
 * Unit tests and edge cases for MinHeap priority queue.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { setupMockEnvironment, loadScripts } = require('./test-helper');

setupMockEnvironment();
loadScripts(['min-heap.js']);

describe('MinHeap', () => {
  it('initializes as empty with size 0', () => {
    const heap = new MinHeap((a, b) => a - b);
    assert.strictEqual(heap.size, 0);
    assert.strictEqual(heap.isEmpty(), true);
    assert.strictEqual(heap.peek(), undefined);
    assert.strictEqual(heap.pop(), undefined);
  });

  it('handles single item push and pop', () => {
    const heap = new MinHeap((a, b) => a - b);
    heap.push(42);
    assert.strictEqual(heap.size, 1);
    assert.strictEqual(heap.isEmpty(), false);
    assert.strictEqual(heap.peek(), 42);
    assert.strictEqual(heap.pop(), 42);
    assert.strictEqual(heap.size, 0);
    assert.strictEqual(heap.isEmpty(), true);
    assert.strictEqual(heap.peek(), undefined);
  });

  it('pops items in ascending order when inserted in descending order', () => {
    const heap = new MinHeap((a, b) => a - b);
    heap.push(50);
    heap.push(40);
    heap.push(30);
    heap.push(20);
    heap.push(10);

    assert.strictEqual(heap.size, 5);
    assert.strictEqual(heap.pop(), 10);
    assert.strictEqual(heap.pop(), 20);
    assert.strictEqual(heap.pop(), 30);
    assert.strictEqual(heap.pop(), 40);
    assert.strictEqual(heap.pop(), 50);
    assert.strictEqual(heap.pop(), undefined);
  });

  it('handles duplicate values correctly', () => {
    const heap = new MinHeap((a, b) => a - b);
    heap.push(5);
    heap.push(2);
    heap.push(5);
    heap.push(2);
    heap.push(1);

    assert.strictEqual(heap.pop(), 1);
    assert.strictEqual(heap.pop(), 2);
    assert.strictEqual(heap.pop(), 2);
    assert.strictEqual(heap.pop(), 5);
    assert.strictEqual(heap.pop(), 5);
    assert.strictEqual(heap.isEmpty(), true);
  });

  it('handles complex objects with custom comparator', () => {
    const heap = new MinHeap((a, b) => a.expiresAt - b.expiresAt);
    const item1 = { id: 'seat-1', expiresAt: 500 };
    const item2 = { id: 'seat-2', expiresAt: 200 };
    const item3 = { id: 'seat-3', expiresAt: 350 };
    const item4 = { id: 'seat-4', expiresAt: 100 };

    heap.push(item1);
    heap.push(item2);
    heap.push(item3);
    heap.push(item4);

    assert.strictEqual(heap.peek().id, 'seat-4');
    assert.strictEqual(heap.pop().id, 'seat-4');
    assert.strictEqual(heap.pop().id, 'seat-2');
    assert.strictEqual(heap.pop().id, 'seat-3');
    assert.strictEqual(heap.pop().id, 'seat-1');
    assert.strictEqual(heap.pop(), undefined);
  });

  it('maintains heap invariants with interleaved push and pop operations', () => {
    const heap = new MinHeap((a, b) => a - b);
    heap.push(10);
    heap.push(30);
    assert.strictEqual(heap.pop(), 10);

    heap.push(5);
    heap.push(25);
    assert.strictEqual(heap.peek(), 5);
    assert.strictEqual(heap.pop(), 5);

    heap.push(15);
    assert.strictEqual(heap.pop(), 15);
    assert.strictEqual(heap.pop(), 25);
    assert.strictEqual(heap.pop(), 30);
    assert.strictEqual(heap.isEmpty(), true);
  });

  it('stress test: 1,000 random elements are popped in sorted order', () => {
    const heap = new MinHeap((a, b) => a - b);
    const count = 1000;
    const values = [];

    for (let i = 0; i < count; i++) {
      const v = Math.floor(Math.random() * 100000);
      values.push(v);
      heap.push(v);
    }

    assert.strictEqual(heap.size, count);
    values.sort((a, b) => a - b);

    for (let i = 0; i < count; i++) {
      assert.strictEqual(heap.pop(), values[i]);
    }
    assert.strictEqual(heap.isEmpty(), true);
  });
});
