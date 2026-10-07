/**
 * timer-queue.test.js
 *
 * Unit tests and edge cases for TimerQueue and syncSeatTimers.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupMockEnvironment, loadScripts } = require('./test-helper');

setupMockEnvironment();
loadScripts(['constants.js', 'min-heap.js', 'history-store.js', 'notification-store.js', 'seat-store.js', 'timer-queue.js']);

describe('TimerQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new TimerQueue();
  });

  it('schedules a deadline and executes callback when delay expires', async () => {
    let fired = false;
    let firedId = null;

    queue.schedule('A1', TIMER_TYPE.NO_SHOW, 10, (id) => {
      fired = true;
      firedId = id;
    });

    await new Promise((r) => setTimeout(r, 25));
    assert.strictEqual(fired, true);
    assert.strictEqual(firedId, 'A1');
  });

  it('executes multiple deadlines in ascending order of expiration', async () => {
    const order = [];

    queue.schedule('SEAT-3', 'type1', 60, (id) => order.push(id));
    queue.schedule('SEAT-1', 'type1', 10, (id) => order.push(id));
    queue.schedule('SEAT-2', 'type1', 30, (id) => order.push(id));

    await new Promise((r) => setTimeout(r, 80));
    assert.deepStrictEqual(order, ['SEAT-1', 'SEAT-2', 'SEAT-3']);
  });

  it('cancelling a deadline invalidates it so callback never executes', async () => {
    let fired = false;

    queue.schedule('B1', TIMER_TYPE.NO_SHOW, 15, () => {
      fired = true;
    });

    queue.cancel('B1', TIMER_TYPE.NO_SHOW);

    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(fired, false);
  });

  it('rescheduling an active deadline supersedes the previous deadline', async () => {
    const log = [];

    // Schedule initial deadline at 15ms
    queue.schedule('C1', TIMER_TYPE.NO_SHOW, 15, () => log.push('first'));

    // Reschedule deadline for 40ms later
    queue.schedule('C1', TIMER_TYPE.NO_SHOW, 40, () => log.push('second'));

    await new Promise((r) => setTimeout(r, 25));
    // At 25ms, first should NOT have fired
    assert.deepStrictEqual(log, []);

    await new Promise((r) => setTimeout(r, 30));
    // At 55ms, second should have fired
    assert.deepStrictEqual(log, ['second']);
  });

  it('handles negative or zero delay by executing immediately', async () => {
    let fired = false;

    queue.schedule('D1', TIMER_TYPE.NO_SHOW, -100, () => {
      fired = true;
    });

    await new Promise((r) => setTimeout(r, 15));
    assert.strictEqual(fired, true);
  });

  it('syncSeatTimers automatically clears overdue PENDING seats on startup', () => {
    // Create a pending seat booked 15 minutes ago (exceeding 10m window)
    seatStore.update('A1', {
      status: SEAT_STATUS.PENDING,
      bookedBy: 'USR-OVERDUE',
      bookedAt: Date.now() - 15 * 60 * 1000,
    });

    syncSeatTimers();

    // Seat A1 should have auto-expired to FREE
    assert.strictEqual(seatStore.get('A1').status, SEAT_STATUS.FREE);
    assert.strictEqual(seatStore.get('A1').bookedBy, null);
  });

  it('syncSeatTimers automatically flags overdue OCCUPIED seats as OVERSTAY on startup', () => {
    // Create an occupied seat whose session ended 10 minutes ago (exceeding 5m grace window)
    seatStore.update('B1', {
      status: SEAT_STATUS.OCCUPIED,
      bookedBy: 'USR-OVERSTAY',
      sessionEndsAt: Date.now() - 10 * 60 * 1000,
    });

    syncSeatTimers();

    // Seat B1 should have been flagged as OVERSTAY
    assert.strictEqual(seatStore.get('B1').status, SEAT_STATUS.OVERSTAY);
  });
});
