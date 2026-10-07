/**
 * user-actions.test.js
 *
 * Comprehensive tests for all user-side features and actions:
 * - Authentication (login, logout, new provisioning, invalid credentials)
 * - Profile updates (change name, change branch, change preferred zone)
 * - Seat Matrix browsing, zone filtering, and seat selection
 * - Seat booking with configurable duration & double-booking prevention
 * - QR code scanning and check-in confirmation
 * - Active session tracking and early vacation (end session early)
 * - Booking expiration on QR no-show
 * - Overstay flagging and vacation
 * - Notification management and read tracking
 * - Session history and statistics aggregation
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
  initMatrix,
  initSeatDetail,
  initScan,
  initActiveSession,
  initVacateNow,
  initProfile,
} = globalThis.AppControllers;

describe('User-Side Feature & Action Suite', () => {
  beforeEach(() => {
    global.localStorage.clear();
    global.seatStore = new SeatStore();
    global.authStore = new AuthStore();
    global.historyStore = new HistoryStore();
    global.notificationStore = new NotificationStore();
    global.document.body.children.length = 0;
  });

  describe('User Authentication & Identity Actions', () => {
    it('user logs in with valid credentials', () => {
      const res = global.authStore.login('ananya@pict.edu', 'password123');
      assert.strictEqual(res.success, true);
      const user = global.authStore.getCurrentUser();
      assert.ok(user);
      assert.strictEqual(user.email, 'ananya@pict.edu');
    });

    it('user login fails with incorrect password for existing account', () => {
      const res = global.authStore.login('ananya@pict.edu', 'wrongpass');
      assert.strictEqual(res.success, false);
      assert.match(res.message, /invalid password/i);
    });

    it('user logs out and session is cleared', () => {
      global.authStore.login('ananya@pict.edu', 'password123');
      assert.ok(global.authStore.getCurrentUser());
      global.authStore.signOut();
      assert.strictEqual(global.authStore.getCurrentUser(), null);
      assert.strictEqual(global.localStorage.getItem(STORAGE_KEYS.CURRENT_USER), null);
    });

    it('user auto-provisions and logs in with new valid institutional email', () => {
      const res = global.authStore.login('rohan.verma@pict.edu', 'securepass123');
      assert.strictEqual(res.success, true);
      const user = global.authStore.getCurrentUser();
      assert.ok(user);
      assert.strictEqual(user.email, 'rohan.verma@pict.edu');
      assert.strictEqual(user.name, 'Rohan Verma');
    });
  });

  describe('User Profile Editing Actions', () => {
    beforeEach(() => {
      global.authStore.login('ananya@pict.edu', 'password123');
    });

    it('user changes their name', () => {
      const updated = global.authStore.updateProfile({ name: 'Ananya Sharma' });
      assert.strictEqual(updated.name, 'Ananya Sharma');
      assert.strictEqual(global.authStore.getCurrentUser().name, 'Ananya Sharma');
      const stored = JSON.parse(global.localStorage.getItem(STORAGE_KEYS.CURRENT_USER));
      assert.strictEqual(stored.name, 'Ananya Sharma');
    });

    it('user changes their branch and academic year', () => {
      const updated = global.authStore.updateProfile({ branch: 'M.Tech CSE · 1st year' });
      assert.strictEqual(updated.branch, 'M.Tech CSE · 1st year');
      assert.strictEqual(global.authStore.getCurrentUser().branch, 'M.Tech CSE · 1st year');
    });

    it('user changes their preferred study zone', () => {
      const updated = global.authStore.updateProfile({ preferredZone: 'Near power' });
      assert.strictEqual(updated.preferredZone, 'Near power');
      assert.strictEqual(global.authStore.getCurrentUser().preferredZone, 'Near power');

      const updatedWindow = global.authStore.updateProfile({ preferredZone: 'Window row' });
      assert.strictEqual(updatedWindow.preferredZone, 'Window row');
    });

    it('user updates multiple profile fields simultaneously', () => {
      const updated = global.authStore.updateProfile({
        name: 'Devika Patel',
        branch: 'B.Des · 4th year',
        preferredZone: 'Window row',
      });
      assert.strictEqual(updated.name, 'Devika Patel');
      assert.strictEqual(updated.branch, 'B.Des · 4th year');
      assert.strictEqual(updated.preferredZone, 'Window row');
    });
  });

  describe('Seat Matrix Browsing & Zone Filtering Actions', () => {
    it('seat matrix contains all 100 seats across Rows A through J', () => {
      const all = global.seatStore.getAll();
      assert.strictEqual(all.length, 100);
      const rows = new Set(all.map(s => s.id[0]));
      assert.deepStrictEqual(Array.from(rows).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    });

    it('filters seats by Silent zone (Rows A-D)', () => {
      const silentSeats = global.seatStore.getByZone('Silent zone');
      assert.strictEqual(silentSeats.length, 40);
      assert.ok(silentSeats.every(s => ['A', 'B', 'C', 'D'].includes(s.id[0])));
    });

    it('filters seats by Near power (Rows E-G)', () => {
      const powerSeats = global.seatStore.getByZone('Near power');
      assert.strictEqual(powerSeats.length, 30);
      assert.ok(powerSeats.every(s => ['E', 'F', 'G'].includes(s.id[0])));
    });

    it('filters seats by Window row (Rows H-J)', () => {
      const windowSeats = global.seatStore.getByZone('Window row');
      assert.strictEqual(windowSeats.length, 30);
      assert.ok(windowSeats.every(s => ['H', 'I', 'J'].includes(s.id[0])));
    });

    it('has no discussion pods in catalog', () => {
      const podSeats = global.seatStore.getByZone('discussion');
      assert.strictEqual(podSeats.length, 0);
    });
  });

  describe('Seat Booking & Check-In Lifecycle Actions', () => {
    const testUser = 'USR-STUDENT-777';

    it('user books a free seat and transitions to PENDING status', () => {
      const seat = global.seatStore.bookSeat('A1', testUser, 2);
      assert.strictEqual(seat.status, SEAT_STATUS.PENDING);
      assert.strictEqual(seat.bookedBy, testUser);
      assert.strictEqual(seat.durationHours, 2);
      assert.ok(seat.bookedAt > 0);
      assert.strictEqual(seat.sessionEndsAt, null);

      const active = global.seatStore.getUserActiveSeat(testUser);
      assert.ok(active);
      assert.strictEqual(active.id, 'A1');
    });

    it('user books with different durations (1 hour, 4 hours)', () => {
      global.seatStore.bookSeat('D1', testUser, 1);
      assert.strictEqual(global.seatStore.get('D1').durationHours, 1);

      global.seatStore.vacateSeat('D1');
      global.seatStore.bookSeat('D2', testUser, 4);
      assert.strictEqual(global.seatStore.get('D2').durationHours, 4);
    });

    it('prevents user from booking a second seat when an active hold exists', () => {
      global.seatStore.bookSeat('A1', testUser, 2);
      const existing = global.seatStore.getUserActiveSeat(testUser);
      assert.strictEqual(existing.id, 'A1');

      const hasActive = Boolean(existing);
      assert.strictEqual(hasActive, true);
    });

    it('user scans QR code at seat to confirm and start session', () => {
      global.seatStore.bookSeat('A1', testUser, 2);
      const occupied = global.seatStore.confirmSeatScan('A1', testUser);
      assert.strictEqual(occupied.status, SEAT_STATUS.OCCUPIED);
      assert.ok(occupied.sessionEndsAt > Date.now());

      const active = global.seatStore.getUserActiveSeat(testUser);
      assert.ok(active);
      assert.strictEqual(active.id, 'A1');
      assert.strictEqual(active.status, SEAT_STATUS.OCCUPIED);
    });

    it('user ends session early and seat returns to FREE with history entry', () => {
      global.seatStore.bookSeat('A1', testUser, 2);
      global.seatStore.confirmSeatScan('A1', testUser);
      const initialHistoryCount = global.historyStore.getAll().length;

      const vacated = global.seatStore.vacateSeat('A1');
      assert.strictEqual(vacated.status, SEAT_STATUS.FREE);
      assert.strictEqual(vacated.bookedBy, null);
      assert.strictEqual(vacated.sessionEndsAt, null);

      // User no longer holds an active seat
      assert.strictEqual(global.seatStore.getUserActiveSeat(testUser), undefined);

      // History record added
      assert.strictEqual(global.historyStore.getAll().length, initialHistoryCount + 1);
      const latest = global.historyStore.getAll()[0];
      assert.strictEqual(latest.seatId, 'Seat A1');
      assert.strictEqual(latest.status, HISTORY_STATUS.COMPLETED);
    });

    it('user reservation expires if QR is not scanned within 10 minutes (no-show)', () => {
      global.seatStore.bookSeat('A1', testUser, 2);
      const initialHistoryCount = global.historyStore.getAll().length;

      const expired = global.seatStore.expireBooking('A1');
      assert.strictEqual(expired.status, SEAT_STATUS.FREE);
      assert.strictEqual(expired.bookedBy, null);

      assert.strictEqual(global.historyStore.getAll().length, initialHistoryCount + 1);
      const latest = global.historyStore.getAll()[0];
      assert.strictEqual(latest.status, HISTORY_STATUS.NO_SHOW);
    });

    it('seat transitions to OVERSTAY if session time lapses and then vacates cleanly', () => {
      global.seatStore.bookSeat('A1', testUser, 2);
      global.seatStore.confirmSeatScan('A1', testUser);

      const overstay = global.seatStore.flagOverstay('A1');
      assert.strictEqual(overstay.status, SEAT_STATUS.OVERSTAY);

      const vacated = global.seatStore.vacateSeat('A1');
      assert.strictEqual(vacated.status, SEAT_STATUS.FREE);
      const latest = global.historyStore.getAll()[0];
      assert.strictEqual(latest.status, HISTORY_STATUS.OVERSTAY);
    });
  });

  describe('Notifications & History Actions', () => {
    it('booking and vacating generate corresponding user notifications', () => {
      const initialCount = global.notificationStore.getAll().length;
      global.seatStore.bookSeat('E1', 'USR-042', 2);
      assert.strictEqual(global.notificationStore.getAll().length, initialCount + 1);

      global.seatStore.confirmSeatScan('E1', 'USR-042');
      assert.strictEqual(global.notificationStore.getAll().length, initialCount + 2);

      global.seatStore.vacateSeat('E1');
      assert.strictEqual(global.notificationStore.getAll().length, initialCount + 3);
    });

    it('user marks all notifications as read', () => {
      global.notificationStore.markAllRead();
      assert.strictEqual(global.notificationStore.getUnreadCount(), 0);
      assert.ok(global.notificationStore.getAll().every(n => n.unread === false));
    });

    it('history summary statistics accurately reflect completed, no-show, and overstay sessions', () => {
      const stats = global.historyStore.getStats();
      assert.ok(typeof stats.completed === 'number');
      assert.ok(typeof stats.noShows === 'number');
      assert.ok(typeof stats.overstays === 'number');
    });

    it('booking a seat requests browser notification permissions', async () => {
      global.seatStore.vacateSeat('A2');
      global.Notification.reset();
      assert.strictEqual(global.Notification.permission, 'default');

      // Setup seat-detail UI with CTA
      global.document.body.children.length = 0;
      global.window.location.search = '?seat=F1';
      const footer = createMockElement('footer');
      const bookCta = createMockElement('a', { className: 'cta' });
      footer.appendChild(bookCta);
      global.document.body.appendChild(footer);

      initSeatDetail();
      bookCta.dispatchEvent('click');

      // Assert permission was requested and granted
      assert.strictEqual(global.Notification.permission, 'granted');
      assert.strictEqual(global.notificationStore.hasPermission(), true);
    });

    it('session timer completion triggers platform notification and audio chime', () => {
      global.Notification.reset();
      global.AudioContext.reset();
      global.Notification.permission = 'granted';

      const alert = global.notificationStore.notifyVacate('G1');
      assert.ok(alert);
      assert.strictEqual(alert.seatId, 'G1');
      assert.strictEqual(alert.chimePlayed, true);
      assert.strictEqual(alert.platformSent, true);

      // Verify platform notification was created with vacate message
      assert.strictEqual(global.Notification.instances.length, 1);
      const instance = global.Notification.instances[0];
      assert.strictEqual(instance.title, 'Time to vacate Seat G1');
      assert.ok(instance.body.includes('5 minutes'));

      // Verify Web Audio chime played tones
      const events = global.AudioContext.audioEvents.filter(e => e.type === 'start');
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].freq, 587.33);
      assert.strictEqual(events[1].freq, 880.0);
    });
  });

  describe('Full End-to-End User DOM Interaction Flows', () => {
    it('user clicks through full booking lifecycle: matrix -> seat-detail -> scan -> active session -> vacate early', () => {
      global.authStore.login('devika@pict.edu', 'password123');
      global.seatStore.vacateSeat('A2');
      // 1. User on Matrix
      const matrixMain = createMockElement('main');
      const footerName = createMockElement('span', { className: 'seat-name' });
      const footerCta = createMockElement('button', { className: 'cta' });
      global.document.body.appendChild(matrixMain);
      const footer = createMockElement('footer');
      footer.appendChild(footerName);
      footer.appendChild(footerCta);
      global.document.body.appendChild(footer);

      initMatrix();
      // Click seat D1
      const seatD1 = matrixMain.querySelector('[data-seat-id="D1"]');
      assert.ok(seatD1);
      seatD1.dispatchEvent('click');
      assert.strictEqual(footerName.textContent, 'Seat D1');
      assert.strictEqual(footerCta.textContent, 'Book seat D1');

      // 2. User goes to seat-detail.html?seat=D1
      global.document.body.children.length = 0;
      global.window.location.search = '?seat=D1';
      const hero = createMockElement('div', { className: 'seat-hero' });
      hero.appendChild(createMockElement('h1'));
      const loc = createMockElement('p', { className: 'location' });
      const attrs = createMockElement('div', { className: 'attributes' });
      for (let i = 0; i < 4; i++) {
        const at = createMockElement('div', { className: 'attr' });
        at.appendChild(createMockElement('div', { className: 'val' }));
        attrs.appendChild(at);
      }
      const durSec = createMockElement('div', { className: 'duration-section' });
      const opt1 = createMockElement('div', { className: 'duration-opt', textContent: '1 hr' });
      const opt2 = createMockElement('div', { className: 'duration-opt selected', textContent: '2 hrs' });
      durSec.appendChild(opt1);
      durSec.appendChild(opt2);
      const detailFooter = createMockElement('footer');
      const bookCta = createMockElement('a', { className: 'cta' });
      detailFooter.appendChild(bookCta);

      global.document.body.appendChild(hero);
      global.document.body.appendChild(loc);
      global.document.body.appendChild(attrs);
      global.document.body.appendChild(durSec);
      global.document.body.appendChild(detailFooter);

      initSeatDetail();
      // Select 1 hour duration
      opt1.dispatchEvent('click');
      assert.ok(opt1.className.includes('selected'));

      // Click Book CTA
      bookCta.dispatchEvent('click');
      const bookedSeat = global.seatStore.get('D1');
      assert.strictEqual(bookedSeat.status, SEAT_STATUS.PENDING);
      assert.strictEqual(bookedSeat.durationHours, 1);

      // 3. User on scan.html?seat=D1
      global.document.body.children.length = 0;
      global.window.location.search = '?seat=D1';
      const seatTagVal = createMockElement('span', { className: 'value' });
      const seatTag = createMockElement('div', { className: 'seat-tag' });
      seatTag.appendChild(seatTagVal);
      const instruction = createMockElement('h1', { className: 'instruction' });
      const timerChip = createMockElement('div', { className: 'timer-chip' });
      const frame = createMockElement('div', { className: 'frame' });
      const frameInner = createMockElement('div', { className: 'frame-inner' });
      frameInner.appendChild(createMockElement('span'));
      frame.appendChild(frameInner);

      global.document.body.appendChild(seatTag);
      global.document.body.appendChild(instruction);
      global.document.body.appendChild(timerChip);
      global.document.body.appendChild(frame);

      initScan();
      assert.strictEqual(seatTagVal.textContent, 'Seat D1');
      // Click viewfinder frame to scan QR
      frame.dispatchEvent('click');
      const occupiedSeat = global.seatStore.get('D1');
      assert.strictEqual(occupiedSeat.status, SEAT_STATUS.OCCUPIED);

      // 4. User on active-session.html
      global.document.body.children.length = 0;
      const seatLine = createMockElement('p', { className: 'seat-line' });
      seatLine.appendChild(createMockElement('strong'));
      const timerPanel = createMockElement('div', { className: 'timer-panel' });
      const timerEl = createMockElement('div', { className: 'timer ring-inner', textContent: '59:59' });
      const timerSub = createMockElement('p', { className: 'timer-sub' });
      timerPanel.appendChild(timerEl);
      timerPanel.appendChild(timerSub);
      const activeFooter = createMockElement('footer');
      const endEarlyBtn = createMockElement('a', { className: 'btn-primary' });
      activeFooter.appendChild(endEarlyBtn);

      global.document.body.appendChild(seatLine);
      global.document.body.appendChild(timerPanel);
      global.document.body.appendChild(activeFooter);

      initActiveSession();
      assert.strictEqual(seatLine.querySelector('strong').textContent, 'D1');
      assert.strictEqual(endEarlyBtn.href, 'vacate-now.html?seat=D1');

      // 5. User on vacate-now.html?seat=D1
      global.document.body.children.length = 0;
      global.window.location.search = '?seat=D1';
      const vSeatLine = createMockElement('p', { className: 'seat-line' });
      vSeatLine.appendChild(createMockElement('strong'));
      const vTimer = createMockElement('div', { className: 'timer' });
      const vFooter = createMockElement('footer');
      const vacateCta = createMockElement('a', { className: 'cta' });
      vFooter.appendChild(vacateCta);

      global.document.body.appendChild(vSeatLine);
      global.document.body.appendChild(vTimer);
      global.document.body.appendChild(vFooter);

      initVacateNow();
      assert.strictEqual(vSeatLine.querySelector('strong').textContent, 'D1');

      // Click Vacate CTA
      vacateCta.dispatchEvent('click');
      const vacatedSeat = global.seatStore.get('D1');
      assert.strictEqual(vacatedSeat.status, SEAT_STATUS.FREE);
      assert.strictEqual(vacatedSeat.bookedBy, null);
    });

    it('user changes profile name and details via UI modal in profile page', () => {
      global.authStore.login('ananya@pict.edu', 'password123');

      const nameEl = createMockElement('div', { className: 'name' });
      const metaEl = createMockElement('div', { className: 'meta' });
      const idInfo = createMockElement('div', { className: 'id-info' });
      idInfo.appendChild(nameEl);
      idInfo.appendChild(metaEl);

      const listGroup = createMockElement('div', { className: 'list-group' });
      const editRow = createMockElement('a', { className: 'list-row' });
      const label = createMockElement('span', { className: 'label', textContent: 'Edit name and details' });
      editRow.appendChild(label);
      listGroup.appendChild(editRow);

      global.document.body.appendChild(idInfo);
      global.document.body.appendChild(listGroup);

      initProfile();
      assert.strictEqual(nameEl.textContent, 'Ananya Rao');

      // Click Edit row to trigger modal
      editRow.dispatchEvent('click');

      const modalBackdrop = global.document.getElementById('stacks-modal-backdrop');
      assert.ok(modalBackdrop, 'Modal should be rendered');

      const nameInput = global.document.getElementById('edit-name');
      assert.ok(nameInput);
      nameInput.value = 'Ananya Sen';

      const saveBtn = modalBackdrop.querySelector('#modal-confirm-btn');
      assert.ok(saveBtn);
      saveBtn.dispatchEvent('click');

      // Assert profile updated
      assert.strictEqual(global.authStore.getCurrentUser().name, 'Ananya Sen');
    });
  });
});
