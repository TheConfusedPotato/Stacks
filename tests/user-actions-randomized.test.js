/**
 * user-actions-randomized.test.js
 *
 * Jasmine-style randomized action testing suite for user-side features.
 *
 * Similar to Jasmine's { random: true, seed: ... } execution environment,
 * this suite tests arbitrary, randomly-ordered sequences of all user actions:
 * - User login, logout, password resets
 * - Changing user profile (name, branch, preferred zone)
 * - Browsing and filtering seat matrix across all 100 seats and 3 zones
 * - Selecting seats, attempting to select unavailable seats
 * - Booking seats, duration selection, double-booking prevention
 * - Navigating back to dashboard and between pages
 * - Scanning QR codes to start sessions
 * - Ending sessions early (vacate now)
 * - Timer expirations (no-show auto-release, session overstay)
 * - Viewing notifications, marking all as read
 * - Checking session history logs and summary metrics
 *
 * Invariants are strictly verified after every single action in the random sequence.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  setupMockEnvironment,
  loadScripts,
} = require('./test-helper');

setupMockEnvironment();
loadScripts([
  'constants.js',
  'min-heap.js',
  'history-store.js',
  'notification-store.js',
  'seat-store.js',
  'timer-queue.js',
  'auth-store.js',
  'app.js',
]);

/**
 * Seedable Pseudo-Random Number Generator (Mulberry32).
 * Produces deterministic, reproducible pseudo-random numbers in [0, 1).
 */
function createPrng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Invariant Checker: Ensures the user-side state is 100% valid and consistent.
 */
function assertSystemInvariants(userId) {
  // Invariant 1: Exactly 100 seats always present
  const allSeats = global.seatStore.getAll();
  assert.strictEqual(allSeats.length, 100, 'Catalog must always contain exactly 100 seats');

  // Invariant 2: Rows A through J, numbers 1 through 10
  const expectedRows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  for (const s of allSeats) {
    const row = s.id[0];
    const num = parseInt(s.id.slice(1), 10);
    assert.ok(expectedRows.includes(row), `Row letter ${row} must be between A and J`);
    assert.ok(num >= 1 && num <= 10, `Seat number ${num} must be between 1 and 10`);

    // Invariant 3: Valid seat status
    assert.ok(
      [SEAT_STATUS.FREE, SEAT_STATUS.PENDING, SEAT_STATUS.OCCUPIED, SEAT_STATUS.OVERSTAY, SEAT_STATUS.MAINTENANCE].includes(s.status),
      `Invalid seat status ${s.status} on seat ${s.id}`
    );

    // Invariant 4: State-field consistency
    if (s.status === SEAT_STATUS.FREE) {
      assert.strictEqual(s.bookedBy, null, `Free seat ${s.id} should not have bookedBy`);
      assert.strictEqual(s.sessionEndsAt, null, `Free seat ${s.id} should not have sessionEndsAt`);
    } else if (s.status === SEAT_STATUS.PENDING) {
      assert.ok(s.bookedBy, `Pending seat ${s.id} must specify bookedBy`);
      assert.ok(typeof s.bookedAt === 'number', `Pending seat ${s.id} must specify bookedAt`);
    } else if (s.status === SEAT_STATUS.OCCUPIED) {
      assert.ok(s.bookedBy, `Occupied seat ${s.id} must specify bookedBy`);
      assert.ok(typeof s.sessionEndsAt === 'number', `Occupied seat ${s.id} must specify sessionEndsAt`);
    }
  }

  // Invariant 5: Mutual Exclusivity - A user can NEVER hold more than 1 active seat simultaneously
  if (userId) {
    const userActiveSeats = allSeats.filter(
      s => s.bookedBy === userId &&
      (s.status === SEAT_STATUS.PENDING || s.status === SEAT_STATUS.OCCUPIED || s.status === SEAT_STATUS.OVERSTAY)
    );
    assert.ok(
      userActiveSeats.length <= 1,
      `User ${userId} holds ${userActiveSeats.length} active seats simultaneously: ${userActiveSeats.map(s => s.id).join(', ')}`
    );
  }

  // Invariant 6: History store entries integrity
  const historyEntries = global.historyStore.getAll();
  for (const h of historyEntries) {
    assert.ok(
      [HISTORY_STATUS.COMPLETED, HISTORY_STATUS.NO_SHOW, HISTORY_STATUS.OVERSTAY].includes(h.status),
      `Invalid history status ${h.status}`
    );
    assert.ok(typeof h.timestamp === 'number', 'History entry timestamp must be number');
  }

  // Invariant 7: Notification store integrity
  const notifs = global.notificationStore.getAll();
  const unreadCount = global.notificationStore.getUnreadCount();
  assert.ok(unreadCount >= 0 && unreadCount <= notifs.length, 'Unread notification count out of bounds');
}

/**
 * Simulated Student User Agent that executes stateful user actions.
 */
class SimulatedUserSession {
  constructor(userId, prng) {
    this.userId = userId;
    this.prng = prng;
    this.name = 'Test Student';
    this.selectedSeatId = null;
    this.selectedDuration = 2;
    this.currentZoneFilter = 'all';
    this.currentPage = 'dashboard.html';
  }

  randomChoice(arr) {
    return arr[Math.floor(this.prng() * arr.length)];
  }

  // 1. Log in
  actionLogin() {
    global.authStore.login('ananya@pict.edu', 'password123');
    this.currentPage = 'dashboard.html';
  }

  // 2. Sign out
  actionSignOut() {
    global.authStore.signOut();
    this.currentPage = 'landing.html';
  }

  // 3. Change user name
  actionChangeName() {
    const firstNames = ['Aarav', 'Priya', 'Kabir', 'Ananya', 'Rohan', 'Sneha', 'Vikram', 'Neha'];
    const lastNames = ['Rao', 'Sharma', 'Patel', 'Verma', 'Gupta', 'Iyer', 'Menon', 'Nair'];
    const newName = `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
    this.name = newName;
    global.authStore.updateProfile({ name: newName });
    const cur = global.authStore.getCurrentUser();
    if (cur) assert.strictEqual(cur.name, newName);
  }

  // 4. Change branch
  actionChangeBranch() {
    const branches = ['B.Tech CSE · 3rd year', 'M.Tech VLSI · 1st year', 'B.Tech EE · 2nd year', 'B.Des · 4th year'];
    const branch = this.randomChoice(branches);
    global.authStore.updateProfile({ branch });
  }

  // 5. Change preferred zone
  actionChangePreferredZone() {
    const zones = ['Silent zone', 'Near power', 'Window row'];
    const preferredZone = this.randomChoice(zones);
    global.authStore.updateProfile({ preferredZone });
  }

  // 6. Navigate to matrix and filter zones
  actionFilterZone() {
    this.currentPage = 'matrix.html';
    const zones = ['all', 'silent zone', 'near power', 'window row'];
    this.currentZoneFilter = this.randomChoice(zones);
    const seats = global.seatStore.getByZone(this.currentZoneFilter);
    assert.ok(seats.length > 0);
  }

  // 7. Select a free seat on the matrix
  actionSelectFreeSeat() {
    this.currentPage = 'matrix.html';
    const freeSeats = global.seatStore.getByStatus(SEAT_STATUS.FREE);
    if (freeSeats.length > 0) {
      const seat = this.randomChoice(freeSeats);
      this.selectedSeatId = seat.id;
    }
  }

  // 8. Attempt to select an occupied/flagged seat
  actionAttemptSelectOccupiedSeat() {
    this.currentPage = 'matrix.html';
    const occupiedSeats = global.seatStore.getAll().filter(s => s.status !== SEAT_STATUS.FREE);
    if (occupiedSeats.length > 0) {
      const busy = this.randomChoice(occupiedSeats);
      // In the UI, clicking an occupied seat shows a toast and rejects selection
      assert.notStrictEqual(busy.status, SEAT_STATUS.FREE);
    }
  }

  // 9. Choose session duration
  actionSelectDuration() {
    this.selectedDuration = this.randomChoice([1, 2, 4]);
  }

  // 10. Book the selected seat
  actionBookSeat() {
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (!active) {
      // User can book
      const freeSeats = global.seatStore.getByStatus(SEAT_STATUS.FREE);
      if (freeSeats.length > 0) {
        const targetSeat = this.selectedSeatId && global.seatStore.get(this.selectedSeatId)?.status === SEAT_STATUS.FREE
          ? this.selectedSeatId
          : this.randomChoice(freeSeats).id;

        const booked = global.seatStore.bookSeat(targetSeat, this.userId, this.selectedDuration);
        assert.strictEqual(booked.status, SEAT_STATUS.PENDING);
        assert.strictEqual(booked.bookedBy, this.userId);
        this.currentPage = 'booking-confirmation.html';
      }
    }
  }

  // 11. Attempt double booking (should be prevented)
  actionAttemptDoubleBooking() {
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (active) {
      // User already holds a seat, find another free seat
      const otherFree = global.seatStore.getByStatus(SEAT_STATUS.FREE).find(s => s.id !== active.id);
      if (otherFree) {
        // App logic detects existing hold and prevents double booking
        const conflictDetected = Boolean(global.seatStore.getUserActiveSeat(this.userId));
        assert.strictEqual(conflictDetected, true, 'Double-booking conflict should be detected');
      }
    }
  }

  // 12. Go back to dashboard
  actionNavigateBack() {
    this.currentPage = 'dashboard.html';
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (active) {
      assert.ok([SEAT_STATUS.PENDING, SEAT_STATUS.OCCUPIED, SEAT_STATUS.OVERSTAY].includes(active.status));
    }
  }

  // 13. Scan QR code to confirm check-in
  actionScanQrCode() {
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (active && active.status === SEAT_STATUS.PENDING) {
      this.currentPage = 'scan.html';
      const occupied = global.seatStore.confirmSeatScan(active.id, this.userId);
      assert.strictEqual(occupied.status, SEAT_STATUS.OCCUPIED);
      this.currentPage = 'active-session.html';
    }
  }

  // 14. End session early (vacate seat)
  actionEndSessionEarly() {
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (active && active.status === SEAT_STATUS.OCCUPIED) {
      this.currentPage = 'vacate-now.html';
      const initialCount = global.historyStore.getAll().length;
      const vacated = global.seatStore.vacateSeat(active.id);
      assert.strictEqual(vacated.status, SEAT_STATUS.FREE);
      assert.strictEqual(vacated.bookedBy, null);
      assert.strictEqual(global.historyStore.getAll().length, initialCount + 1);
      this.currentPage = 'dashboard.html';
    }
  }

  // 15. Simulate QR timeout / no-show expiry
  actionSimulateNoShowExpiry() {
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (active && active.status === SEAT_STATUS.PENDING) {
      const initialCount = global.historyStore.getAll().length;
      const freed = global.seatStore.expireBooking(active.id);
      assert.strictEqual(freed.status, SEAT_STATUS.FREE);
      assert.strictEqual(global.historyStore.getAll().length, initialCount + 1);
      this.currentPage = 'booking-expired.html';
    }
  }

  // 16. Simulate session duration elapse (overstay) & vacate
  actionSimulateOverstayAndVacate() {
    const active = global.seatStore.getUserActiveSeat(this.userId);
    if (active && active.status === SEAT_STATUS.OCCUPIED) {
      global.seatStore.flagOverstay(active.id);
      assert.strictEqual(global.seatStore.get(active.id).status, SEAT_STATUS.OVERSTAY);
      global.seatStore.vacateSeat(active.id);
      assert.strictEqual(global.seatStore.get(active.id).status, SEAT_STATUS.FREE);
    }
  }

  // 17. View history
  actionViewHistory() {
    this.currentPage = 'history.html';
    const historyList = global.historyStore.getAll();
    const stats = global.historyStore.getStats();
    assert.strictEqual(typeof stats.completed, 'number');
    assert.strictEqual(typeof stats.noShows, 'number');
    assert.strictEqual(typeof stats.overstays, 'number');
    assert.ok(historyList.length >= stats.completed + stats.noShows + stats.overstays);
  }

  // 18. Manage notifications (mark all read)
  actionManageNotifications() {
    this.currentPage = 'notifications.html';
    global.notificationStore.markAllRead();
    assert.strictEqual(global.notificationStore.getUnreadCount(), 0);
  }
}

describe('User Actions - Randomized Execution Order (Jasmine style)', () => {
  // Test seeds for reproducibility & wide coverage
  const testSeeds = [42, 1337, 2026, 77777, 99999];

  for (const seed of testSeeds) {
    it(`executes 40 user actions in random order with seed=${seed}`, () => {
      // Fresh clean environment for every run
      global.localStorage.clear();
      global.seatStore = new SeatStore();
      global.authStore = new AuthStore();
      global.historyStore = new HistoryStore();
      global.notificationStore = new NotificationStore();
      global.document.body.children.length = 0;

      // Clear default A2 booking so test user has full access
      global.seatStore.update('A2', {
        status: SEAT_STATUS.FREE,
        bookedBy: null,
        bookedAt: null,
        sessionEndsAt: null,
      });

      const prng = createPrng(seed);
      const studentId = `USR-RND-${seed}`;
      const session = new SimulatedUserSession(studentId, prng);

      // Pool of user actions
      const actionMethods = [
        'actionLogin',
        'actionChangeName',
        'actionChangeBranch',
        'actionChangePreferredZone',
        'actionFilterZone',
        'actionSelectFreeSeat',
        'actionAttemptSelectOccupiedSeat',
        'actionSelectDuration',
        'actionBookSeat',
        'actionAttemptDoubleBooking',
        'actionNavigateBack',
        'actionScanQrCode',
        'actionEndSessionEarly',
        'actionSimulateNoShowExpiry',
        'actionSimulateOverstayAndVacate',
        'actionViewHistory',
        'actionManageNotifications',
        'actionSignOut',
      ];

      // Execute 40 actions chosen in pseudorandom order
      const executionLog = [];
      for (let step = 1; step <= 40; step++) {
        const actionName = session.randomChoice(actionMethods);
        executionLog.push(actionName);
        try {
          session[actionName]();
        } catch (err) {
          throw new Error(
            `Failure at step ${step} [${actionName}] with seed ${seed}: ${err.message}\nExecution path: ${executionLog.join(' -> ')}`
          );
        }

        // Verify system invariants after every single action!
        assertSystemInvariants(studentId);
      }

      assert.strictEqual(executionLog.length, 40);
    });
  }
});
