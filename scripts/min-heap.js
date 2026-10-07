/**
 * min-heap.js
 * Generic binary min-heap priority queue.
 */
var MinHeap = class MinHeap {
  constructor(compareFn) {
    this._items = [];
    this._compare = compareFn;
  }
  get size() { return this._items.length; }
  isEmpty() { return this._items.length === 0; }
  peek() { return this._items[0]; }
  push(item) {
    this._items.push(item);
    this._siftUp(this._items.length - 1);
  }
  pop() {
    if (this._items.length === 0) return undefined;
    const top = this._items[0];
    const last = this._items.pop();
    if (this._items.length > 0) {
      this._items[0] = last;
      this._siftDown(0);
    }
    return top;
  }
  _siftUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this._compare(this._items[index], this._items[parent]) >= 0) break;
      this._swap(index, parent);
      index = parent;
    }
  }
  _siftDown(index) {
    const n = this._items.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;
      if (left < n && this._compare(this._items[left], this._items[smallest]) < 0) smallest = left;
      if (right < n && this._compare(this._items[right], this._items[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      this._swap(index, smallest);
      index = smallest;
    }
  }
  _swap(i, j) {
    const tmp = this._items[i];
    this._items[i] = this._items[j];
    this._items[j] = tmp;
  }
};

if (typeof window !== 'undefined') window.MinHeap = MinHeap;
if (typeof globalThis !== 'undefined') globalThis.MinHeap = MinHeap;
