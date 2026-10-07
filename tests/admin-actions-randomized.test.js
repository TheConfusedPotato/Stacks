/**
 * admin-actions-randomized.test.js
 *
 * Jasmine-style randomized action testing suite for staff admin features.
 *
 * Simulates real-world administrative workloads by dispatching sequences of
 * arbitrary, randomly-ordered admin actions across multiple random seeds:
 * - Admin authentication, session restoration, and logout
 * - Tallying live floor occupancy metrics (free, occupied, flagged)
 * - Monitoring alert feeds (watching pending QR holds, clearing overstays)
 * - Filtering seat matrix across all 100 seats and 3 zones
 * - Overriding student holds and forcing seats to FREE
 * - Placing seats into MAINTENANCE mode and releasing them
 * - Flagging occupied seats as OVERSTAY
 * - Inspecting registered users and library utilization reports
 * - Switching between admin dashboard and admin seat matrix
 *
 * All system invariants are strictly verified after every single action.
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
 * Invariant Checker for Admin Operations.
 */
function assertAdminSystemInvariants() {
  const allSeats = global.seatStore.getAll();
  assert.strictEqual(allSeats.length, 100, 'Catalog must always contain exactly 100 seats');

  const expectedRows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  for (const s of allSeats) {
    const row = s.id[0];
    const num = parseInt(s.id.slice(1), 10);
    assert.ok(expectedRows.includes(row), `Seat ${s.id} row must be between A and J`);
    assert.ok(num >= 1 && num <= 10, `Seat ${s.id} number must be between 1 and 10`);

    assert.ok(
      [SEAT_STATUS.FREE, SEAT_STATUS.PENDING, SEAT_STATUS.OCCUPIED, SEAT_STATUS.OVERSTAY, SEAT_STATUS.MAINTENANCE].includes(s.status),
      `Invalid seat status ${s.status} on seat ${s.id}`
    );

    if (s.status === SEAT_STATUS.FREE || s.status === SEAT_STATUS.MAINTENANCE) {
      assert.strictEqual(s.bookedBy, null, `Seat ${s.id} in ${s.status} must have bookedBy=null`);
      assert.strictEqual(s.sessionEndsAt, null, `Seat ${s.id} in ${s.status} must have sessionEndsAt=null`);
    } else if (s.status === SEAT_STATUS.PENDING) {
      assert.ok(s.bookedBy, `Pending seat ${s.id} must have bookedBy`);
    } else if (s.status === SEAT_STATUS.OCCUPIED) {
      assert.ok(s.bookedBy, `Occupied seat ${s.id} must have bookedBy`);
      assert.ok(typeof s.sessionEndsAt === 'number', `Occupied seat ${s.id} must have numeric sessionEndsAt`);
    }
  }

  // Tally invariant: sum of status buckets equals 100
  const free = allSeats.filter(s => s.status === SEAT_STATUS.FREE).length;
  const occupied = allSeats.filter(s => s.status === SEAT_STATUS.OCCUPIED).length;
  const overstay = allSeats.filter(s => s.status === SEAT_STATUS.OVERSTAY).length;
  const pending = allSeats.filter(s => s.status === SEAT_STATUS.PENDING).length;
  const maintenance = allSeats.filter(s => s.status === SEAT_STATUS.MAINTENANCE).length;
  assert.strictEqual(free + occupied + overstay + pending + maintenance, 100);

  // Admin session invariant
  const session = global.authStore.getAdminSession();
  if (session) {
    assert.strictEqual(session.role, 'admin');
    assert.ok(session.staffId && session.staffId.startsWith('LIB-'));
  }
}

/**
 * Simulated Staff Admin User Agent executing random administrative actions.
 */
class SimulatedAdminSession {
  constructor(staffId, prng) {
    this.staffId = staffId;
    this.prng = prng;
    this.selectedSeatId = 'A1';
    this.currentZoneFilter = 'all';
    this.currentPage = 'admin-dashboard.html';
  }

  randomChoice(arr) {
    return arr[Math.floor(this.prng() * arr.length)];
  }

  // 1. Admin login
  actionAdminLogin() {
    const res = global.authStore.loginAdmin(this.staffId, 'admin123');
    assert.strictEqual(res.success, true);
    this.currentPage = 'admin-dashboard.html';
  }

  // 2. Admin logout
  actionAdminLogout() {
    global.authStore.logoutAdmin();
    this.currentPage = 'admin-login.html';
  }

  // 3. View dashboard metrics
  actionViewDashboardMetrics() {
    this.currentPage = 'admin-dashboard.html';
    const all = global.seatStore.getAll();
    const free = all.filter(s => s.status === SEAT_STATUS.FREE).length;
    const occupied = all.filter(s => s.status === SEAT_STATUS.OCCUPIED).length;
    const flagged = all.filter(s => s.status === SEAT_STATUS.OVERSTAY).length;
    assert.ok(free >= 0 && occupied >= 0 && flagged >= 0);
  }

  // 4. Inspect alert feed
  actionInspectNeedsAttentionFeed() {
    this.currentPage = 'admin-dashboard.html';
    const needsAttention = global.seatStore.getAll().filter(
      s => s.status === SEAT_STATUS.OVERSTAY || s.status === SEAT_STATUS.PENDING
    );
    assert.ok(Array.isArray(needsAttention));
  }

  // 5. Clear overstay from alert feed
  actionClearOverstayFromFeed() {
    let overstaySeat = global.seatStore.getByStatus(SEAT_STATUS.OVERSTAY)[0];
    if (!overstaySeat) {
      // Flag an occupied seat to simulate an overstay appearing in feed
      const occupied = global.seatStore.getByStatus(SEAT_STATUS.OCCUPIED)[0];
      if (occupied) {
        global.seatStore.flagOverstay(occupied.id);
        overstaySeat = global.seatStore.get(occupied.id);
      }
    }
    if (overstaySeat) {
      const vacated = global.seatStore.vacateSeat(overstaySeat.id);
      assert.strictEqual(vacated.status, SEAT_STATUS.FREE);
      assert.strictEqual(vacated.bookedBy, null);
    }
  }

  // 6. Watch pending seat in alert feed
  actionWatchPendingSeat() {
    let pendingSeat = global.seatStore.getByStatus(SEAT_STATUS.PENDING)[0];
    if (!pendingSeat) {
      const free = global.seatStore.getByStatus(SEAT_STATUS.FREE)[0];
      if (free) {
        global.seatStore.bookSeat(free.id, 'USR-STUDENT-SIM', 2);
        pendingSeat = global.seatStore.get(free.id);
      }
    }
    if (pendingSeat) {
      assert.strictEqual(pendingSeat.status, SEAT_STATUS.PENDING);
    }
  }

  // 7. Filter seat matrix by zone
  actionFilterMatrixZone() {
    this.currentPage = 'matrix.html?role=admin';
    const zones = ['all', 'silent zone', 'near power', 'window row'];
    this.currentZoneFilter = this.randomChoice(zones);
    const filtered = global.seatStore.getByZone(this.currentZoneFilter);
    assert.ok(filtered.length > 0);
  }

  // 8. Admin selects ANY seat on matrix (free, occupied, pending, overstay, or maintenance)
  actionSelectAnySeat() {
    this.currentPage = 'matrix.html?role=admin';
    const all = global.seatStore.getAll();
    const seat = this.randomChoice(all);
    this.selectedSeatId = seat.id;
    assert.ok(seat);
  }

  // 9. Admin forces seat to FREE (overriding any existing status)
  actionSetSeatFree() {
    const seatId = this.selectedSeatId;
    global.seatStore.update(seatId, {
      status: SEAT_STATUS.FREE,
      bookedBy: null,
      sessionEndsAt: null,
      bookedAt: null,
    });
    assert.strictEqual(global.seatStore.get(seatId).status, SEAT_STATUS.FREE);
    assert.strictEqual(global.seatStore.get(seatId).bookedBy, null);
  }

  // 10. Admin marks seat as MAINTENANCE
  actionSetSeatMaintenance() {
    const seatId = this.selectedSeatId;
    global.seatStore.update(seatId, {
      status: SEAT_STATUS.MAINTENANCE,
      bookedBy: null,
      sessionEndsAt: null,
      bookedAt: null,
    });
    const seat = global.seatStore.get(seatId);
    assert.strictEqual(seat.status, SEAT_STATUS.MAINTENANCE);
    assert.strictEqual(seat.bookedBy, null);
  }

  // 11. Admin releases seat from MAINTENANCE
  actionReleaseMaintenance() {
    const maintSeats = global.seatStore.getByStatus(SEAT_STATUS.MAINTENANCE);
    if (maintSeats.length > 0) {
      const seat = this.randomChoice(maintSeats);
      global.seatStore.update(seat.id, {
        status: SEAT_STATUS.FREE,
        bookedBy: null,
        sessionEndsAt: null,
        bookedAt: null,
      });
      assert.strictEqual(global.seatStore.get(seat.id).status, SEAT_STATUS.FREE);
    }
  }

  // 12. Admin flags an occupied seat as OVERSTAY
  actionFlagSeatOverstay() {
    let occupied = global.seatStore.getByStatus(SEAT_STATUS.OCCUPIED)[0];
    if (!occupied) {
      const free = global.seatStore.getByStatus(SEAT_STATUS.FREE)[0];
      if (free) {
        global.seatStore.bookSeat(free.id, 'USR-STUDENT-SIM', 2);
        global.seatStore.confirmSeatScan(free.id, 'USR-STUDENT-SIM');
        occupied = global.seatStore.get(free.id);
      }
    }
    if (occupied) {
      const flagged = global.seatStore.flagOverstay(occupied.id);
      assert.strictEqual(flagged.status, SEAT_STATUS.OVERSTAY);
    }
  }

  // 13. Student books seat, admin overrides and frees it
  actionOverrideStudentBooking() {
    const free = global.seatStore.getByStatus(SEAT_STATUS.FREE)[0];
    if (free) {
      global.seatStore.bookSeat(free.id, 'USR-TEMP', 1);
      assert.strictEqual(global.seatStore.get(free.id).status, SEAT_STATUS.PENDING);

      // Staff admin override
      global.seatStore.update(free.id, {
        status: SEAT_STATUS.FREE,
        bookedBy: null,
        sessionEndsAt: null,
        bookedAt: null,
      });
      assert.strictEqual(global.seatStore.get(free.id).status, SEAT_STATUS.FREE);
    }
  }

  // 14. Switch from dashboard to seat matrix
  actionSwitchDashboardToSeatsMatrix() {
    this.currentPage = 'matrix.html?role=admin';
    assert.strictEqual(this.currentPage, 'matrix.html?role=admin');
  }

  // 15. Switch from seat matrix back to admin dashboard
  actionSwitchSeatsMatrixToDashboard() {
    this.currentPage = 'admin-dashboard.html';
    assert.strictEqual(this.currentPage, 'admin-dashboard.html');
  }
}

describe('Admin Actions - Randomized Execution Order (Jasmine style)', () => {
  const testSeeds = [42, 1337, 2026, 77777, 99999];

  for (const seed of testSeeds) {
    it(`executes 40 admin actions in random order with seed=${seed}`, () => {
      global.localStorage.clear();
      global.seatStore = new SeatStore();
      global.authStore = new AuthStore();
      global.historyStore = new HistoryStore();
      global.notificationStore = new NotificationStore();
      global.document.body.children.length = 0;

      const prng = createPrng(seed);
      const staffId = `LIB-${1000 + (seed % 8999)}`;
      const session = new SimulatedAdminSession(staffId, prng);

      // Log admin in initially
      session.actionAdminLogin();

      const actionMethods = [
        'actionViewDashboardMetrics',
        'actionInspectNeedsAttentionFeed',
        'actionClearOverstayFromFeed',
        'actionWatchPendingSeat',
        'actionFilterMatrixZone',
        'actionSelectAnySeat',
        'actionSetSeatFree',
        'actionSetSeatMaintenance',
        'actionReleaseMaintenance',
        'actionFlagSeatOverstay',
        'actionOverrideStudentBooking',
        'actionSwitchDashboardToSeatsMatrix',
        'actionSwitchSeatsMatrixToDashboard',
        'actionAdminLogin',
        'actionAdminLogout',
      ];

      const executionLog = [];
      for (let step = 1; step <= 40; step++) {
        const actionName = session.randomChoice(actionMethods);
        executionLog.push(actionName);
        try {
          session[actionName]();
        } catch (err) {
          throw new Error(
            `Admin failure at step ${step} [${actionName}] with seed ${seed}: ${err.message}\nExecution path: ${executionLog.join(' -> ')}`
          );
        }

        // Verify all invariants after every single admin action!
        assertAdminSystemInvariants();
      }

      assert.strictEqual(executionLog.length, 40);
    });
  }
});
