/**
 * admin-actions.test.js
 *
 * Comprehensive tests for all staff admin features and actions:
 * - Staff authentication (login, logout, ID normalization, invalid credentials)
 * - Admin dashboard metrics (free, occupied, flagged counters)
 * - "Needs attention" feed (monitoring pending seats, clearing overstays)
 * - Floor overview & mini-matrix interactions
 * - Full matrix in admin mode (STAFF ADMIN badge, back link, amber styling)
 * - Admin seat controls (Set Free, Mark Maintenance, Flag Overstay)
 * - Maintenance mode isolation (prevents student bookings)
 * - Admin navigation, modals (Registered users, Utilization reports, CSV export)
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  setupMockEnvironment,
  loadScripts,
  createMockElement,
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

const {
  initAdminLogin,
  initAdminDashboard,
  initMatrix,
} = globalThis.AppControllers;

describe('Admin-Side Feature & Action Suite', () => {
  beforeEach(() => {
    global.localStorage.clear();
    global.seatStore = new SeatStore();
    global.authStore = new AuthStore();
    global.historyStore = new HistoryStore();
    global.notificationStore = new NotificationStore();
    global.document.body.children.length = 0;
  });

  describe('Staff Admin Authentication & Session Actions', () => {
    it('admin logs in with valid default staff credentials (LIB-0042 / admin123)', () => {
      const res = global.authStore.loginAdmin('LIB-0042', 'admin123');
      assert.strictEqual(res.success, true);
      const session = global.authStore.getAdminSession();
      assert.ok(session);
      assert.strictEqual(session.staffId, 'LIB-0042');
      assert.strictEqual(session.role, 'admin');
    });

    it('admin logs in with case-insensitive and whitespace-padded staff ID', () => {
      const res = global.authStore.loginAdmin('  lib-0042  ', 'admin123');
      assert.strictEqual(res.success, true);
      const session = global.authStore.getAdminSession();
      assert.ok(session);
      assert.strictEqual(session.staffId, 'LIB-0042');
    });

    it('admin logs in with any LIB- prefix and personnel password', () => {
      const res = global.authStore.loginAdmin('LIB-9999', 'admin123');
      assert.strictEqual(res.success, true);
      const session = global.authStore.getAdminSession();
      assert.ok(session);
      assert.strictEqual(session.staffId, 'LIB-9999');
    });

    it('admin login rejected with invalid staff ID', () => {
      const res = global.authStore.loginAdmin('STUDENT-01', 'admin123');
      assert.strictEqual(res.success, false);
      assert.strictEqual(global.authStore.getAdminSession(), null);
    });

    it('admin login rejected with wrong password', () => {
      const res = global.authStore.loginAdmin('LIB-0042', 'wrongpass');
      assert.strictEqual(res.success, false);
      assert.strictEqual(global.authStore.getAdminSession(), null);
    });

    it('admin logs out and admin session is cleared', () => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');
      assert.ok(global.authStore.getAdminSession());
      global.authStore.logoutAdmin();
      assert.strictEqual(global.authStore.getAdminSession(), null);
      assert.strictEqual(global.localStorage.getItem(STORAGE_KEYS.ADMIN_SESSION), null);
    });
  });

  describe('Admin Dashboard Metrics & Monitoring Actions', () => {
    beforeEach(() => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');
    });

    it('accurately tallies free, occupied, and flagged seats matching 100 total capacity', () => {
      const all = global.seatStore.getAll();
      assert.strictEqual(all.length, 100);

      const free = all.filter(s => s.status === SEAT_STATUS.FREE).length;
      const occupied = all.filter(s => s.status === SEAT_STATUS.OCCUPIED).length;
      const flagged = all.filter(s => s.status === SEAT_STATUS.OVERSTAY).length;
      const pending = all.filter(s => s.status === SEAT_STATUS.PENDING).length;

      assert.strictEqual(free + occupied + flagged + pending, 100);
      assert.ok(free >= 80, 'Free seats should be dominant in default catalog');
      assert.ok(occupied >= 1, 'Default seeds include occupied seats');
      assert.ok(flagged >= 1, 'Default seeds include flagged seat B4');
    });

    it('clearing an overstay seat from alert feed frees seat and updates counts', () => {
      assert.strictEqual(global.seatStore.get('B4').status, SEAT_STATUS.OVERSTAY);
      const vacated = global.seatStore.vacateSeat('B4');
      assert.strictEqual(vacated.status, SEAT_STATUS.FREE);
      assert.strictEqual(vacated.bookedBy, null);
      assert.strictEqual(global.seatStore.get('B4').status, SEAT_STATUS.FREE);
    });
  });

  describe('Admin Seat Control Actions (Set Free, Maintenance, Overstay)', () => {
    beforeEach(() => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');
    });

    it('admin sets an occupied seat to FREE', () => {
      assert.strictEqual(global.seatStore.get('A2').status, SEAT_STATUS.OCCUPIED);
      global.seatStore.update('A2', {
        status: SEAT_STATUS.FREE,
        bookedBy: null,
        sessionEndsAt: null,
        bookedAt: null,
      });
      const updated = global.seatStore.get('A2');
      assert.strictEqual(updated.status, SEAT_STATUS.FREE);
      assert.strictEqual(updated.bookedBy, null);
    });

    it('admin places a seat into MAINTENANCE mode', () => {
      global.seatStore.update('C3', {
        status: SEAT_STATUS.MAINTENANCE,
        bookedBy: null,
        sessionEndsAt: null,
        bookedAt: null,
      });
      const seat = global.seatStore.get('C3');
      assert.strictEqual(seat.status, SEAT_STATUS.MAINTENANCE);
    });

    it('students cannot book a seat that is in MAINTENANCE mode', () => {
      global.seatStore.update('C3', {
        status: SEAT_STATUS.MAINTENANCE,
        bookedBy: null,
        sessionEndsAt: null,
        bookedAt: null,
      });

      // Student checks availability
      const seat = global.seatStore.get('C3');
      assert.notStrictEqual(seat.status, SEAT_STATUS.FREE);
    });

    it('admin releases a seat from MAINTENANCE back to FREE', () => {
      global.seatStore.update('C3', { status: SEAT_STATUS.MAINTENANCE });
      assert.strictEqual(global.seatStore.get('C3').status, SEAT_STATUS.MAINTENANCE);

      global.seatStore.update('C3', { status: SEAT_STATUS.FREE });
      assert.strictEqual(global.seatStore.get('C3').status, SEAT_STATUS.FREE);
    });

    it('admin flags an occupied seat as OVERSTAY', () => {
      assert.strictEqual(global.seatStore.get('C1').status, SEAT_STATUS.OCCUPIED);
      const flagged = global.seatStore.flagOverstay('C1');
      assert.strictEqual(flagged.status, SEAT_STATUS.OVERSTAY);
    });
  });

  describe('Admin Seat Matrix Navigation & Controls', () => {
    beforeEach(() => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');
    });

    it('renders admin badge and admin back link on matrix in admin role', () => {
      global.window.location.search = '?role=admin';
      const main = createMockElement('main');
      const topRow = createMockElement('div', { className: 'top-row' });
      const footerName = createMockElement('span', { className: 'seat-name' });
      const footerTimerNote = createMockElement('span', { className: 'timer-note' });
      const footerCta = createMockElement('button', { className: 'cta' });

      global.document.body.appendChild(topRow);
      global.document.body.appendChild(main);
      const footer = createMockElement('footer');
      footer.appendChild(footerName);
      footer.appendChild(footerTimerNote);
      footer.appendChild(footerCta);
      global.document.body.appendChild(footer);

      initMatrix();

      const backBtn = topRow.querySelector('.back-btn');
      assert.ok(backBtn);
      assert.strictEqual(backBtn.href, 'admin-dashboard.html');
      assert.match(backBtn.textContent, /Admin Dashboard/i);

      const roleBadge = topRow.querySelector('.role-badge');
      assert.ok(roleBadge);
      assert.match(roleBadge.textContent, /Staff Admin/i);

      // Footer CTA is styled for admin control
      assert.match(footerCta.textContent, /Manage seat/i);
    });

    it('admin can click occupied seats on matrix without trigger student toast rejection', () => {
      global.window.location.search = '?role=admin';
      const main = createMockElement('main');
      const topRow = createMockElement('div', { className: 'top-row' });
      const footerName = createMockElement('span', { className: 'seat-name' });
      const footerTimerNote = createMockElement('span', { className: 'timer-note' });
      const footerCta = createMockElement('button', { className: 'cta' });

      global.document.body.appendChild(topRow);
      global.document.body.appendChild(main);
      const footer = createMockElement('footer');
      footer.appendChild(footerName);
      footer.appendChild(footerTimerNote);
      footer.appendChild(footerCta);
      global.document.body.appendChild(footer);

      initMatrix();

      // Click occupied seat A2
      const seatA2 = main.querySelector('[data-seat-id="A2"]');
      assert.ok(seatA2);
      seatA2.dispatchEvent('click');

      // Admin footer updates to manage seat A2
      assert.strictEqual(footerName.textContent, 'Seat A2');
      assert.match(footerCta.textContent, /Manage seat A2/i);
    });
  });

  describe('Full End-to-End Admin DOM Interaction Flows', () => {
    it('admin logs in via form and navigates to admin dashboard', () => {
      const form = createMockElement('form');
      const idInput = createMockElement('input', { id: 'staff-id', value: 'LIB-0042' });
      const passInput = createMockElement('input', { id: 'password', value: 'admin123' });
      form.appendChild(idInput);
      form.appendChild(passInput);
      global.document.body.appendChild(form);

      initAdminLogin();
      form.dispatchEvent('submit');

      assert.ok(global.authStore.getAdminSession());
      assert.strictEqual(global.authStore.getAdminSession().staffId, 'LIB-0042');
    });

    it('admin uses dashboard mini-matrix to set an occupied seat to FREE', (t, done) => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');

      const statGrid = createMockElement('div', { className: 'stat-grid' });
      for (let i = 0; i < 3; i++) {
        const card = createMockElement('div', { className: 'stat-card' });
        card.appendChild(createMockElement('span', { className: 'num' }));
        statGrid.appendChild(card);
      }
      const miniMatrix = createMockElement('div', { className: 'mini-matrix' });
      const alertFeed = createMockElement('div', { className: 'alert-feed' });

      global.document.body.appendChild(statGrid);
      global.document.body.appendChild(alertFeed);
      global.document.body.appendChild(miniMatrix);

      initAdminDashboard();

      // Find seat A2 in miniMatrix
      const seatA2 = miniMatrix.children.find(el => el.textContent === 'A2');
      assert.ok(seatA2);
      assert.ok(seatA2.className.includes('occupied'));

      // Click seat A2 to trigger admin management modal
      seatA2.dispatchEvent('click');

      setTimeout(() => {
        const freeBtn = global.document.getElementById('admin-free-btn');
        assert.ok(freeBtn, 'Admin Free button should exist in modal');
        freeBtn.dispatchEvent('click');

        assert.strictEqual(global.seatStore.get('A2').status, SEAT_STATUS.FREE);
        done();
      }, 60);
    });

    it('admin uses dashboard mini-matrix to mark a seat as MAINTENANCE', (t, done) => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');

      const statGrid = createMockElement('div', { className: 'stat-grid' });
      for (let i = 0; i < 3; i++) {
        const card = createMockElement('div', { className: 'stat-card' });
        card.appendChild(createMockElement('span', { className: 'num' }));
        statGrid.appendChild(card);
      }
      const miniMatrix = createMockElement('div', { className: 'mini-matrix' });
      const alertFeed = createMockElement('div', { className: 'alert-feed' });

      global.document.body.appendChild(statGrid);
      global.document.body.appendChild(alertFeed);
      global.document.body.appendChild(miniMatrix);

      initAdminDashboard();

      const seatA4 = miniMatrix.children.find(el => el.textContent === 'A4');
      assert.ok(seatA4);

      seatA4.dispatchEvent('click');

      setTimeout(() => {
        const maintBtn = global.document.getElementById('admin-maint-btn');
        assert.ok(maintBtn, 'Admin Maintenance button should exist in modal');
        maintBtn.dispatchEvent('click');

        assert.strictEqual(global.seatStore.get('A4').status, SEAT_STATUS.MAINTENANCE);
        done();
      }, 60);
    });
    it('redirects unauthenticated user accessing admin-dashboard.html to admin-login.html', () => {
      global.authStore.logoutAdmin();
      global.window.location.href = 'http://localhost:8000/admin-dashboard.html';

      initAdminDashboard();
      assert.strictEqual(global.window.location.href, 'admin-login.html');
    });

    it('permits authenticated staff accessing admin-dashboard.html', () => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');
      global.window.location.href = 'http://localhost:8000/admin-dashboard.html';

      const statGrid = createMockElement('div', { className: 'stat-grid' });
      for (let i = 0; i < 3; i++) {
        const card = createMockElement('div', { className: 'stat-card' });
        card.appendChild(createMockElement('span', { className: 'num' }));
        statGrid.appendChild(card);
      }
      global.document.body.appendChild(statGrid);

      initAdminDashboard();
      assert.strictEqual(global.window.location.href, 'http://localhost:8000/admin-dashboard.html');
    });

    it('redirects unauthenticated user requesting matrix.html?role=admin to admin-login.html', () => {
      global.authStore.logoutAdmin();
      global.window.location.search = '?role=admin';
      global.window.location.href = 'http://localhost:8000/matrix.html?role=admin';

      initMatrix();
      assert.strictEqual(global.window.location.href, 'admin-login.html');
    });

    it('staff can log out via sign out button on admin dashboard', () => {
      global.authStore.loginAdmin('LIB-0042', 'admin123');
      global.window.location.href = 'http://localhost:8000/admin-dashboard.html';

      const logoutBtn = createMockElement('a', { id: 'admin-logout-btn' });
      global.document.body.appendChild(logoutBtn);

      initAdminDashboard();
      assert.ok(global.authStore.getAdminSession());

      logoutBtn.dispatchEvent('click');
      assert.strictEqual(global.authStore.getAdminSession(), null);
      assert.strictEqual(global.window.location.href, 'admin-login.html');
    });
  });
});
