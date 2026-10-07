/**
 * timer-queue.js
 * MinHeap-backed deadline scheduler.
 */
var TIMER_TYPE = Object.freeze({
  NO_SHOW: 'no_show',
  OVERSTAY: 'overstay',
});

class TimerQueue {
  constructor() {
    const HeapClass = typeof MinHeap !== 'undefined' ? MinHeap : (typeof globalThis !== 'undefined' ? globalThis.MinHeap : null);
    this._heap = HeapClass ? new HeapClass((a, b) => a.expiresAt - b.expiresAt) : null;
    this._activeVersion = new Map();
    this._wakeTimeoutId = null;
  }
  schedule(seatId, type, delayMs, onExpire) {
    if (!this._heap) return;
    const key = `${type}:${seatId}`;
    const version = (this._activeVersion.get(key) || 0) + 1;
    this._activeVersion.set(key, version);
    this._heap.push({
      key, seatId, type, version,
      expiresAt: Date.now() + Math.max(0, delayMs),
      onExpire,
    });
    this._rearmWakeup();
  }
  cancel(seatId, type) {
    const key = `${type}:${seatId}`;
    this._activeVersion.set(key, (this._activeVersion.get(key) || 0) + 1);
  }
  _isStale(entry) {
    return this._activeVersion.get(entry.key) !== entry.version;
  }
  _processDue() {
    if (!this._heap) return;
    const now = Date.now();
    while (!this._heap.isEmpty()) {
      const top = this._heap.peek();
      if (this._isStale(top)) { this._heap.pop(); continue; }
      if (top.expiresAt > now) break;
      this._heap.pop();
      if (typeof top.onExpire === 'function') top.onExpire(top.seatId);
    }
    this._rearmWakeup();
  }
  _rearmWakeup() {
    if (!this._heap) return;
    if (this._wakeTimeoutId !== null) {
      clearTimeout(this._wakeTimeoutId);
      this._wakeTimeoutId = null;
    }
    while (!this._heap.isEmpty() && this._isStale(this._heap.peek())) {
      this._heap.pop();
    }
    if (this._heap.isEmpty()) return;
    const next = this._heap.peek();
    const delay = Math.max(0, next.expiresAt - Date.now());
    this._wakeTimeoutId = setTimeout(() => this._processDue(), delay);
  }
}

var timerQueue = new TimerQueue();

function scheduleNoShowClear(seatId, customDelayMs) {
  const delay = customDelayMs !== undefined ? customDelayMs : TIMER_RULES.SCAN_WINDOW_MS;
  timerQueue.schedule(seatId, TIMER_TYPE.NO_SHOW, delay, (id) => {
    if (typeof seatStore !== 'undefined') seatStore.expireBooking(id);
  });
}

function cancelNoShowClear(seatId) {
  timerQueue.cancel(seatId, TIMER_TYPE.NO_SHOW);
}

function scheduleOverstayFlag(seatId, customDelayMs) {
  const delay = customDelayMs !== undefined ? customDelayMs : TIMER_RULES.VACATE_WINDOW_MS;
  timerQueue.schedule(seatId, TIMER_TYPE.OVERSTAY, delay, (id) => {
    if (typeof seatStore !== 'undefined') seatStore.flagOverstay(id);
  });
}

function cancelOverstayFlag(seatId) {
  timerQueue.cancel(seatId, TIMER_TYPE.OVERSTAY);
}

function syncSeatTimers() {
  if (typeof seatStore === 'undefined') return;
  const now = Date.now();
  const seats = seatStore.getAll();
  for (const seat of seats) {
    if (seat.status === SEAT_STATUS.PENDING) {
      const bookedAt = seat.bookedAt || now;
      const elapsed = now - bookedAt;
      if (elapsed >= TIMER_RULES.SCAN_WINDOW_MS) {
        seatStore.expireBooking(seat.id);
      } else {
        scheduleNoShowClear(seat.id, TIMER_RULES.SCAN_WINDOW_MS - elapsed);
      }
    } else if (seat.status === SEAT_STATUS.OCCUPIED) {
      if (seat.sessionEndsAt && now >= seat.sessionEndsAt) {
        const overstayElapsed = now - seat.sessionEndsAt;
        if (overstayElapsed >= TIMER_RULES.VACATE_WINDOW_MS) {
          seatStore.flagOverstay(seat.id);
        } else {
          scheduleOverstayFlag(seat.id, TIMER_RULES.VACATE_WINDOW_MS - overstayElapsed);
        }
      }
    }
  }
}

if (typeof window !== 'undefined') syncSeatTimers();

if (typeof window !== 'undefined') {
  window.timerQueue = timerQueue;
  window.scheduleNoShowClear = scheduleNoShowClear;
  window.cancelNoShowClear = cancelNoShowClear;
  window.scheduleOverstayFlag = scheduleOverstayFlag;
  window.cancelOverstayFlag = cancelOverstayFlag;
}
if (typeof globalThis !== 'undefined') {
  globalThis.timerQueue = timerQueue;
  globalThis.scheduleNoShowClear = scheduleNoShowClear;
  globalThis.cancelNoShowClear = cancelNoShowClear;
  globalThis.scheduleOverstayFlag = scheduleOverstayFlag;
  globalThis.cancelOverstayFlag = cancelOverstayFlag;
}
