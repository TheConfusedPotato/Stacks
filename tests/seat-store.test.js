/**
 * seat-store.test.js
 *
 * Unit tests and edge cases for SeatStore.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupMockEnvironment, loadScripts } = require('./test-helper');

setupMockEnvironment();
loadScripts(['constants.js', 'min-heap.js', 'history-store.js', 'notification-store.js', 'timer-queue.js', 'seat-store.js']);

describe('SeatStore', () => {
  let store;

  beforeEach(() => {
    global.localStorage.clear();
    store = new SeatStore();
  });

  it('seeds default seats on first run', () => {
    const all = store.getAll();
    assert.strictEqual(all.length, 100);
    assert.strictEqual(store.has('A1'), true);
    assert.strictEqual(store.has('B1'), true);
    assert.strictEqual(store.has('C1'), true);
  });

  it('normalizes lookups with case insensitivity and whitespace trimming', () => {
    const seatA1 = store.get('A1');
    assert.ok(seatA1);
    assert.strictEqual(store.get('a1')?.id, 'A1');
    assert.strictEqual(store.get('  A1  ')?.id, 'A1');
    assert.strictEqual(store.get(' a1 ')?.id, 'A1');
    assert.strictEqual(store.has('a1'), true);
    assert.strictEqual(store.has(' a1 '), true);
  });

  it('returns undefined for non-existent seats without throwing', () => {
    assert.strictEqual(store.get('Z99'), undefined);
    assert.strictEqual(store.get(''), undefined);
    assert.strictEqual(store.get(null), undefined);
    assert.strictEqual(store.has('Z99'), false);
    assert.strictEqual(store.has(''), false);
    assert.strictEqual(store.has(null), false);
  });

  it('returns undefined when updating a non-existent seat without crashing', () => {
    const res = store.update('NONEXISTENT', { status: SEAT_STATUS.OCCUPIED });
    assert.strictEqual(res, undefined);
  });

  it('recovers cleanly when localStorage contains corrupted JSON', () => {
    global.localStorage.setItem(STORAGE_KEYS.SEATS, '{invalid-json: corrupted');
    const resilientStore = new SeatStore();
    // Falls back to empty or seeded Map without throwing
    assert.ok(resilientStore);
    assert.strictEqual(typeof resilientStore.getAll, 'function');
  });

  it('performs full booking lifecycle transitions: FREE -> PENDING -> OCCUPIED -> FREE', () => {
    // 1. Reset A1 to FREE
    store.update('A1', { status: SEAT_STATUS.FREE, bookedBy: null, bookedAt: null, sessionEndsAt: null });
    assert.strictEqual(store.get('A1').status, SEAT_STATUS.FREE);

    // 2. Book seat (PENDING)
    const userId = 'USR-TEST-01';
    const booked = store.bookSeat('A1', userId, 2);
    assert.strictEqual(booked.status, SEAT_STATUS.PENDING);
    assert.strictEqual(booked.bookedBy, userId);
    assert.ok(booked.bookedAt);
    assert.strictEqual(booked.durationHours, 2);

    // Verify active seat lookup
    const activeSeat = store.getUserActiveSeat(userId);
    assert.ok(activeSeat);
    assert.strictEqual(activeSeat.id, 'A1');

    // 3. Confirm QR scan (OCCUPIED)
    const confirmed = store.confirmSeatScan('A1', userId);
    assert.strictEqual(confirmed.status, SEAT_STATUS.OCCUPIED);
    assert.ok(confirmed.sessionEndsAt);
    assert.ok(confirmed.sessionEndsAt > Date.now());

    // 4. Vacate seat (FREE)
    const vacated = store.vacateSeat('A1');
    assert.strictEqual(vacated.status, SEAT_STATUS.FREE);
    assert.strictEqual(vacated.bookedBy, null);
    assert.strictEqual(vacated.sessionEndsAt, null);

    // Verify active seat lookup now returns undefined
    assert.strictEqual(store.getUserActiveSeat(userId), undefined);
  });

  it('handles expireBooking by resetting seat to FREE', () => {
    store.bookSeat('A4', 'USR-EXPIRE', 1);
    assert.strictEqual(store.get('A4').status, SEAT_STATUS.PENDING);

    store.expireBooking('A4');
    assert.strictEqual(store.get('A4').status, SEAT_STATUS.FREE);
    assert.strictEqual(store.get('A4').bookedBy, null);
  });

  it('flags seat as OVERSTAY upon grace period expiry', () => {
    store.flagOverstay('B4');
    assert.strictEqual(store.get('B4').status, SEAT_STATUS.OVERSTAY);
  });

  it('filters seats correctly by zone and status', () => {
    const silentSeats = store.getByZone('Silent zone');
    assert.ok(silentSeats.length >= 4);
    silentSeats.forEach((s) => assert.strictEqual(s.zone, 'Silent zone'));

    const allByZone = store.getByZone('all');
    assert.strictEqual(allByZone.length, store.getAll().length);

    const freeSeats = store.getByStatus(SEAT_STATUS.FREE);
    assert.ok(freeSeats.length > 0);
    freeSeats.forEach((s) => assert.strictEqual(s.status, SEAT_STATUS.FREE));
  });

  it('deletes seat and persists deletion to localStorage', () => {
    store.delete('C4');
    assert.strictEqual(store.has('C4'), false);
    assert.strictEqual(store.get('C4'), undefined);

    // Verify persistence in new store instance
    const store2 = new SeatStore();
    assert.strictEqual(store2.has('C4'), false);
  });
});
