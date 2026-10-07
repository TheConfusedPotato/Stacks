/**
 * app-controllers.test.js
 *
 * Unit and integration tests for UI controllers, navigation, forms, and client backend wiring.
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
  getQueryParam,
  getPageName,
  formatTimeDigits,
  formatMmSs,
  formatHms,
  formatClockTime,
  showToast,
  showModal,
  initSignin,
  initSignup,
  initOtpVerification,
  initMatrix,
  initSeatDetail,
  initScan,
  initActiveSession,
  initVacateNow,
} = globalThis.AppControllers;

describe('App Controllers & UI Wiring', () => {
  beforeEach(() => {
    global.localStorage.clear();
    global.seatStore = new SeatStore();
    global.authStore = new AuthStore();
    global.historyStore = new HistoryStore();
    global.notificationStore = new NotificationStore();
    global.document.body.children.length = 0;
  });

  describe('Utility & Formatting Helpers', () => {
    it('formatTimeDigits pads single-digit integers with leading zero', () => {
      assert.strictEqual(formatTimeDigits(0), '00');
      assert.strictEqual(formatTimeDigits(7), '07');
      assert.strictEqual(formatTimeDigits(10), '10');
      assert.strictEqual(formatTimeDigits(59), '59');
    });

    it('formatMmSs converts millisecond durations into MM:SS format and handles zero/negative', () => {
      assert.strictEqual(formatMmSs(5 * 60 * 1000), '05:00');
      assert.strictEqual(formatMmSs(90 * 1000), '01:30');
      assert.strictEqual(formatMmSs(0), '00:00');
      assert.strictEqual(formatMmSs(-5000), '00:00');
    });

    it('formatHms separates millisecond durations into hours, minutes, and seconds', () => {
      assert.deepStrictEqual(formatHms(0), { hours: '00', minutes: '00', seconds: '00', formatted: '00:00:00' });
      assert.deepStrictEqual(formatHms(-10000), { hours: '00', minutes: '00', seconds: '00', formatted: '00:00:00' });
      assert.deepStrictEqual(formatHms(45 * 1000), { hours: '00', minutes: '00', seconds: '45', formatted: '00:00:45' });
      assert.deepStrictEqual(formatHms((52 * 60 + 18) * 1000), { hours: '00', minutes: '52', seconds: '18', formatted: '00:52:18' });
      assert.deepStrictEqual(formatHms(3600 * 1000), { hours: '01', minutes: '00', seconds: '00', formatted: '01:00:00' });
      assert.deepStrictEqual(formatHms((2 * 3600 + 15 * 60 + 9) * 1000), { hours: '02', minutes: '15', seconds: '09', formatted: '02:15:09' });
    });

    it('formatClockTime formats epoch timestamps into readable time', () => {
      const ts = new Date('2026-01-01T15:30:00').getTime();
      const formatted = formatClockTime(ts);
      assert.ok(formatted.includes('3:30') || formatted.includes('15:30'));
    });

    it('getQueryParam extracts URL query parameter from window.location', () => {
      global.window.location.search = '?seat=C2&duration=3';
      assert.strictEqual(getQueryParam('seat'), 'C2');
      assert.strictEqual(getQueryParam('duration'), '3');
      assert.strictEqual(getQueryParam('nonexistent'), null);
    });

    it('getPageName extracts filename or defaults to index.html', () => {
      global.window.location.pathname = '/dashboard.html';
      assert.strictEqual(getPageName(), 'dashboard.html');

      global.window.location.pathname = '/';
      assert.strictEqual(getPageName(), 'index.html');
    });
  });

  describe('UI Toast and Modal Helpers', () => {
    it('showToast creates container and appends styled toast element', () => {
      showToast('Booking saved', 'teal');
      const container = global.document.getElementById('stacks-toast-container');
      assert.ok(container, 'Toast container must exist');
      assert.strictEqual(container.children.length, 1);
      assert.strictEqual(container.children[0].textContent, 'Booking saved');
    });

    it('showModal creates dialog backdrop, renders message, and triggers confirm callback', () => {
      let confirmed = false;
      showModal('Confirmation', '<p>Confirm vacate?</p>', 'Confirm', () => {
        confirmed = true;
      });

      const btn = global.document.querySelector('#modal-confirm-btn');
      assert.ok(btn, 'Confirm button must be present in modal');
      assert.strictEqual(btn.textContent, 'Confirm');

      btn.dispatchEvent('click');
      assert.strictEqual(confirmed, true);
    });
  });

  describe('Signin Page Controller (initSignin)', () => {
    it('updates status strip with live free seat count', () => {
      const strip = createMockElement('div', { className: 'status-strip' });
      const span1 = createMockElement('span', { textContent: 'Live:' });
      const span2 = createMockElement('span', { textContent: 'loading...' });
      strip.appendChild(span1);
      strip.appendChild(span2);
      global.document.body.appendChild(strip);

      initSignin();

      const freeCount = seatStore.getByStatus(SEAT_STATUS.FREE).length;
      assert.strictEqual(span2.textContent, `${freeCount} seats free right now across 3 floors`);
    });

    it('displays error toast when submitted with invalid credentials', () => {
      const form = createMockElement('form');
      const emailInput = createMockElement('input', { id: 'email', value: 'bad@user.com' });
      const passInput = createMockElement('input', { id: 'password', value: '12' });
      form.appendChild(emailInput);
      form.appendChild(passInput);
      global.document.body.appendChild(form);

      initSignin();

      form.dispatchEvent('submit');

      const container = global.document.getElementById('stacks-toast-container');
      assert.ok(container);
      assert.match(container.children[0].textContent, /Account not found|Invalid password/i);
    });

    it('signs in student and prepares redirect upon valid credentials', () => {
      const form = createMockElement('form');
      const emailInput = createMockElement('input', { id: 'email', value: DEFAULT_STUDENT.email });
      const passInput = createMockElement('input', { id: 'password', value: DEFAULT_STUDENT.password });
      form.appendChild(emailInput);
      form.appendChild(passInput);
      global.document.body.appendChild(form);

      initSignin();

      form.dispatchEvent('submit');

      assert.strictEqual(authStore.getCurrentUser().email, DEFAULT_STUDENT.email);
      const container = global.document.getElementById('stacks-toast-container');
      assert.ok(container.children.length > 0);
      assert.strictEqual(container.children[0].textContent, 'Signed in successfully');
    });
  });

  describe('Signup Page Controller (initSignup)', () => {
    it('rejects form when required fields are missing', () => {
      const form = createMockElement('form');
      const nameInput = createMockElement('input', { id: 'name', value: '' });
      const emailInput = createMockElement('input', { id: 'email', value: '' });
      const passInput = createMockElement('input', { id: 'password', value: '' });
      const confirmInput = createMockElement('input', { id: 'confirm', value: '' });
      form.appendChild(nameInput);
      form.appendChild(emailInput);
      form.appendChild(passInput);
      form.appendChild(confirmInput);
      global.document.body.appendChild(form);

      initSignup();
      form.dispatchEvent('submit');

      const container = global.document.getElementById('stacks-toast-container');
      assert.match(container.children[0].textContent, /fill out all fields/i);
    });

    it('rejects form when passwords do not match', () => {
      const form = createMockElement('form');
      const nameInput = createMockElement('input', { id: 'name', value: 'Aarav' });
      const emailInput = createMockElement('input', { id: 'email', value: 'aarav@pict.edu' });
      const passInput = createMockElement('input', { id: 'password', value: 'password123' });
      const confirmInput = createMockElement('input', { id: 'confirm', value: 'mismatch456' });
      form.appendChild(nameInput);
      form.appendChild(emailInput);
      form.appendChild(passInput);
      form.appendChild(confirmInput);
      global.document.body.appendChild(form);

      initSignup();
      form.dispatchEvent('submit');

      const container = global.document.getElementById('stacks-toast-container');
      assert.match(container.children[0].textContent, /do not match/i);
    });

    it('rejects password shorter than 6 characters', () => {
      const form = createMockElement('form');
      const nameInput = createMockElement('input', { id: 'name', value: 'Aarav' });
      const emailInput = createMockElement('input', { id: 'email', value: 'aarav@pict.edu' });
      const passInput = createMockElement('input', { id: 'password', value: '123' });
      const confirmInput = createMockElement('input', { id: 'confirm', value: '123' });
      form.appendChild(nameInput);
      form.appendChild(emailInput);
      form.appendChild(passInput);
      form.appendChild(confirmInput);
      global.document.body.appendChild(form);

      initSignup();
      form.dispatchEvent('submit');

      const container = global.document.getElementById('stacks-toast-container');
      assert.match(container.children[0].textContent, /at least 6 characters/i);
    });

    it('initiates signup and stores pending registration on valid inputs', () => {
      const form = createMockElement('form');
      const nameInput = createMockElement('input', { id: 'name', value: 'Kiran Patel' });
      const emailInput = createMockElement('input', { id: 'email', value: 'kiran@pict.edu' });
      const passInput = createMockElement('input', { id: 'password', value: 'securePass789' });
      const confirmInput = createMockElement('input', { id: 'confirm', value: 'securePass789' });
      form.appendChild(nameInput);
      form.appendChild(emailInput);
      form.appendChild(passInput);
      form.appendChild(confirmInput);
      global.document.body.appendChild(form);

      initSignup();
      form.dispatchEvent('submit');

      const pending = authStore.getPendingSignup();
      assert.ok(pending);
      assert.strictEqual(pending.email, 'kiran@pict.edu');
      assert.strictEqual(pending.otp, '419419');
    });
  });

  describe('Matrix Seat Map Controller (initMatrix)', () => {
    it('renders seat grid and allows selecting free seats', () => {
      const main = createMockElement('main');
      const footerName = createMockElement('span', { className: 'seat-name' });
      const footerCta = createMockElement('button', { className: 'cta' });
      const footer = createMockElement('footer');
      footer.appendChild(footerName);
      footer.appendChild(footerCta);

      global.document.body.appendChild(main);
      global.document.body.appendChild(footer);

      initMatrix();

      // Ensure seats were rendered in main
      const seatEls = main.querySelectorAll('.seat');
      assert.ok(seatEls.length > 0, 'Seats should be rendered into grid');

      // Click seat A1 (which is free)
      const seatA1 = seatEls.find((s) => s.getAttribute('data-seat-id') === 'A1');
      assert.ok(seatA1, 'Seat A1 must exist');
      seatA1.dispatchEvent('click');

      assert.strictEqual(footerName.textContent, 'Seat A1');
      assert.strictEqual(footerCta.textContent, 'Book seat A1');

      // Clicking footer CTA navigates to seat-detail.html
      footerCta.dispatchEvent('click');
      assert.strictEqual(global.window.location.href, 'seat-detail.html?seat=A1');
    });

    it('clicking occupied seat warns user and does not select it', () => {
      const main = createMockElement('main');
      const footerName = createMockElement('span', { className: 'seat-name' });
      const footerCta = createMockElement('button', { className: 'cta' });
      const footer = createMockElement('footer');
      footer.appendChild(footerName);
      footer.appendChild(footerCta);

      global.document.body.appendChild(main);
      global.document.body.appendChild(footer);

      initMatrix();

      const seatEls = main.querySelectorAll('.seat');
      // Seat A2 is seeded as OCCUPIED
      const seatA2 = seatEls.find((s) => s.getAttribute('data-seat-id') === 'A2');
      assert.ok(seatA2);
      seatA2.dispatchEvent('click');

      const container = global.document.getElementById('stacks-toast-container');
      assert.ok(container);
      assert.match(container.children[0].textContent, /occupied until/i);
    });
  });

  describe('Seat Detail & Booking Flow (initSeatDetail)', () => {
    it('populates seat details and executes booking on CTA click', () => {
      global.window.location.search = '?seat=A4';
      // Ensure current user has no active seats
      seatStore.vacateSeat('A2');

      const heroH1 = createMockElement('h1');
      const seatHero = createMockElement('div', { className: 'seat-hero' });
      seatHero.appendChild(heroH1);

      const loc = createMockElement('div', { className: 'location' });
      const cta = createMockElement('button', { className: 'cta' });
      const footer = createMockElement('footer');
      footer.appendChild(cta);

      global.document.body.appendChild(seatHero);
      global.document.body.appendChild(loc);
      global.document.body.appendChild(footer);

      initSeatDetail();

      assert.strictEqual(heroH1.textContent, 'Seat A4');
      assert.strictEqual(cta.textContent, 'Book seat A4');

      // Click Book
      cta.dispatchEvent('click');

      // Verify seat is now PENDING and assigned to current student
      const seat = seatStore.get('A4');
      assert.strictEqual(seat.status, SEAT_STATUS.PENDING);
      assert.strictEqual(seat.bookedBy, DEFAULT_STUDENT.id);
      assert.strictEqual(
        global.window.location.href,
        'booking-confirmation.html?seat=A4&duration=2'
      );
    });

    it('prevents booking if user already holds another active seat', () => {
      global.window.location.search = '?seat=A1';
      // Default student already holds occupied Seat A2
      const heroH1 = createMockElement('h1');
      const seatHero = createMockElement('div', { className: 'seat-hero' });
      seatHero.appendChild(heroH1);

      const cta = createMockElement('button', { className: 'cta' });
      const footer = createMockElement('footer');
      footer.appendChild(cta);

      global.document.body.appendChild(seatHero);
      global.document.body.appendChild(footer);

      initSeatDetail();
      cta.dispatchEvent('click');

      const container = global.document.getElementById('stacks-toast-container');
      assert.ok(container);
      assert.match(container.children[0].textContent, /already have an active hold on Seat A2/i);
    });
  });

  describe('QR Scan & Check-In Controller (initScan)', () => {
    it('viewfinder click confirms QR scan, transitions seat to OCCUPIED and redirects', () => {
      // Create a pending seat D2
      seatStore.bookSeat('A1', DEFAULT_STUDENT.id, 2);
      global.window.location.search = '?seat=A1';

      const tagVal = createMockElement('div', { className: 'value' });
      const seatTag = createMockElement('div', { className: 'seat-tag' });
      seatTag.appendChild(tagVal);

      const instruction = createMockElement('div', { className: 'instruction' });
      const timerChip = createMockElement('div', { className: 'timer-chip' });

      const frameSpan = createMockElement('span');
      const frameInner = createMockElement('div', { className: 'frame-inner' });
      frameInner.appendChild(frameSpan);
      const frame = createMockElement('div', { className: 'frame' });
      frame.appendChild(frameInner);

      global.document.body.appendChild(seatTag);
      global.document.body.appendChild(instruction);
      global.document.body.appendChild(timerChip);
      global.document.body.appendChild(frame);

      initScan();

      assert.strictEqual(tagVal.textContent, 'Seat A1');
      assert.strictEqual(instruction.textContent, 'Scan the QR at seat A1');
      assert.strictEqual(frameSpan.textContent, 'tap to scan QR');

      // Click viewfinder to simulate scan
      frame.dispatchEvent('click');

      const updated = seatStore.get('A1');
      assert.strictEqual(updated.status, SEAT_STATUS.OCCUPIED);
      assert.ok(updated.sessionEndsAt > Date.now());
    });
  });

  describe('Vacate Controller (initVacateNow)', () => {
    it('vacate CTA releases seat, creates history entry, and redirects to dashboard', () => {
      global.window.location.search = '?seat=A2';

      const seatStrong = createMockElement('strong');
      const seatLine = createMockElement('div', { className: 'seat-line' });
      seatLine.appendChild(seatStrong);

      const timerEl = createMockElement('div', { className: 'timer' });
      const cta = createMockElement('button', { className: 'cta' });
      const footer = createMockElement('footer');
      footer.appendChild(cta);

      global.document.body.appendChild(seatLine);
      global.document.body.appendChild(timerEl);
      global.document.body.appendChild(footer);

      initVacateNow();

      assert.strictEqual(seatStrong.textContent, 'A2');

      // Click Vacate CTA
      cta.dispatchEvent('click');

      // Verify seat is freed up
      const seat = seatStore.get('A2');
      assert.strictEqual(seat.status, SEAT_STATUS.FREE);
      assert.strictEqual(seat.bookedBy, null);

      // Verify notification created
      const notifs = notificationStore.getAll();
      assert.ok(notifs.some((n) => n.title.includes('Seat A2 vacated')));
    });
  });

  describe('Active Session Controller (initActiveSession)', () => {
    it('populates separated hours, minutes, and seconds units as well as ring-inner', () => {
      global.window.location.search = '?seat=C4';
      seatStore.bookSeat('C4', 'USR-001', 2);
      seatStore.confirmSeatScan('C4', 'USR-001');

      const seatStrong = createMockElement('strong');
      const seatLine = createMockElement('p', { className: 'seat-line' });
      seatLine.appendChild(seatStrong);

      const hoursEl = createMockElement('span', { className: 'unit-val timer-hours', textContent: '00' });
      const minsEl = createMockElement('span', { className: 'unit-val timer-minutes', textContent: '00' });
      const secsEl = createMockElement('span', { className: 'unit-val timer-seconds', textContent: '00' });
      const ringInner = createMockElement('div', { className: 'timer ring-inner', textContent: '00:00:00' });
      const timerSub = createMockElement('p', { className: 'timer-sub' });
      const endEarlyBtn = createMockElement('a', { className: 'btn-primary' });

      global.document.body.appendChild(seatLine);
      global.document.body.appendChild(hoursEl);
      global.document.body.appendChild(minsEl);
      global.document.body.appendChild(secsEl);
      global.document.body.appendChild(ringInner);
      global.document.body.appendChild(timerSub);
      global.document.body.appendChild(endEarlyBtn);

      initActiveSession();

      assert.strictEqual(seatStrong.textContent, 'C4');
      assert.strictEqual(endEarlyBtn.href, 'vacate-now.html?seat=C4');
      assert.ok(hoursEl.textContent === '01' || hoursEl.textContent === '02');
      assert.strictEqual(minsEl.textContent.length, 2);
      assert.strictEqual(secsEl.textContent.length, 2);
      assert.ok(ringInner.textContent.includes(':'));
    });
  });

  describe('OTP Verification Controller & Template (initOtpVerification)', () => {
    it('verifies that otp-verification.html does not contain hardcoded 419 values', () => {
      const fs = require('fs');
      const html = fs.readFileSync('otp-verification.html', 'utf8');
      assert.strictEqual(html.includes('value="4"'), false, 'Should not contain hardcoded value="4"');
      assert.strictEqual(html.includes('value="1"'), false, 'Should not contain hardcoded value="1"');
      assert.strictEqual(html.includes('value="9"'), false, 'Should not contain hardcoded value="9"');
      const placeholderMatches = html.match(/placeholder="·"/g);
      assert.strictEqual(placeholderMatches ? placeholderMatches.length : 0, 6);
    });

    it('handles typing auto-advance and backspace navigation across empty OTP inputs', () => {
      const form = createMockElement('form');
      const otpRow = createMockElement('div', { className: 'otp-row' });
      const inputs = [];
      for (let i = 0; i < 6; i++) {
        const inp = createMockElement('input', { type: 'text', value: '' });
        let isFocused = false;
        inp.focus = () => { isFocused = true; };
        inp.isFocused = () => isFocused;
        inputs.push(inp);
        otpRow.appendChild(inp);
      }
      form.appendChild(otpRow);
      global.document.body.appendChild(form);

      initOtpVerification();

      // Enter digit in slot 0 -> auto advances to slot 1
      inputs[0].value = '7';
      inputs[0].dispatchEvent({ type: 'input', target: inputs[0] });
      assert.strictEqual(inputs[1].isFocused(), true);

      // Backspace in empty slot 1 -> focuses slot 0
      inputs[1].value = '';
      inputs[1].dispatchEvent({ type: 'keydown', key: 'Backspace', target: inputs[1] });
      assert.strictEqual(inputs[0].isFocused(), true);
    });

    it('supports pasting a 6-digit code to populate all input slots', () => {
      const form = createMockElement('form');
      const otpRow = createMockElement('div', { className: 'otp-row' });
      const inputs = [];
      for (let i = 0; i < 6; i++) {
        const inp = createMockElement('input', { type: 'text', value: '' });
        let isFocused = false;
        inp.focus = () => { isFocused = true; };
        inputs.push(inp);
        otpRow.appendChild(inp);
      }
      form.appendChild(otpRow);
      global.document.body.appendChild(form);

      initOtpVerification();

      inputs[0].dispatchEvent({
        type: 'paste',
        clipboardData: {
          getData: () => '837192',
        },
      });

      assert.strictEqual(inputs[0].value, '8');
      assert.strictEqual(inputs[1].value, '3');
      assert.strictEqual(inputs[2].value, '7');
      assert.strictEqual(inputs[3].value, '1');
      assert.strictEqual(inputs[4].value, '9');
      assert.strictEqual(inputs[5].value, '2');
    });

    it('requires all 6 digits to verify and displays warning if incomplete', () => {
      authStore.startSignup({
        name: 'Rohan Sharma',
        email: 'rohan@pict.edu',
        password: 'password123',
      });

      const form = createMockElement('form');
      const otpRow = createMockElement('div', { className: 'otp-row' });
      const inputs = [];
      for (let i = 0; i < 6; i++) {
        const inp = createMockElement('input', { type: 'text', value: '' });
        inputs.push(inp);
        otpRow.appendChild(inp);
      }
      form.appendChild(otpRow);
      global.document.body.appendChild(form);

      initOtpVerification();

      // Enter only 3 digits
      inputs[0].value = '4';
      inputs[1].value = '1';
      inputs[2].value = '9';
      form.dispatchEvent('submit');

      const container = global.document.getElementById('stacks-toast-container');
      assert.ok(container.children.some((c) => c.textContent.includes('6-digit')));

      // Now enter the remaining 3 digits
      inputs[3].value = '4';
      inputs[4].value = '1';
      inputs[5].value = '9';
      form.dispatchEvent('submit');

      assert.ok(container.children.some((c) => c.textContent.includes('verified')));
      assert.ok(authStore.getCurrentUser());
      assert.strictEqual(authStore.getCurrentUser().email, 'rohan@pict.edu');
    });
  });
});
