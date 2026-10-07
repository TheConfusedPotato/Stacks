/**
 * auth-store.test.js
 *
 * Unit tests and edge cases for AuthStore (Student and Admin authentication).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupMockEnvironment, loadScripts } = require('./test-helper');

setupMockEnvironment();
loadScripts(['constants.js', 'auth-store.js']);

describe('AuthStore', () => {
  let store;

  beforeEach(() => {
    global.localStorage.clear();
    store = new AuthStore();
  });

  describe('Default Initialization', () => {
    it('seeds default student on empty storage and establishes active session', () => {
      const user = store.getCurrentUser();
      assert.ok(user, 'Default user should be set');
      assert.strictEqual(user.email.toLowerCase(), DEFAULT_STUDENT.email.toLowerCase());
      assert.strictEqual(user.name, DEFAULT_STUDENT.name);
    });

    it('recovers gracefully when localStorage has corrupted JSON', () => {
      global.localStorage.setItem(STORAGE_KEYS.USERS, 'INVALID{JSON');
      global.localStorage.setItem(STORAGE_KEYS.CURRENT_USER, '{CORRUPT');

      const corruptedStore = new AuthStore();
      const user = corruptedStore.getCurrentUser();
      assert.ok(user);
      assert.strictEqual(user.email.toLowerCase(), DEFAULT_STUDENT.email.toLowerCase());
    });
  });

  describe('Student Login & Session', () => {
    it('logs in default student successfully with matching credentials', () => {
      const res = store.login('ananya@pict.edu', 'password123');
      assert.strictEqual(res.success, true);
      assert.strictEqual(store.getCurrentUser().email, 'ananya@pict.edu');
    });

    it('normalizes email with mixed case and leading/trailing whitespace', () => {
      const res = store.login('  ANANYA@PICT.EDU  ', 'password123');
      assert.strictEqual(res.success, true);
      assert.strictEqual(store.getCurrentUser().email, 'ananya@pict.edu');
    });

    it('provisions a new student account when logging in with valid email and password', () => {
      const res = store.login('newstudent@pict.edu', 'secretPass');
      assert.strictEqual(res.success, true);
      const user = store.getCurrentUser();
      assert.strictEqual(user.email, 'newstudent@pict.edu');
      assert.ok(user.id.startsWith('USR-'));
    });

    it('rejects invalid email formats or empty passwords for non-existent users', () => {
      const res = store.login('not-an-email', '');
      assert.strictEqual(res.success, false);
      assert.match(res.message, /Account not found/i);
    });

    it('signs out the student and removes session from localStorage', () => {
      store.signOut();
      assert.strictEqual(store.getCurrentUser(), null);
      assert.strictEqual(global.localStorage.getItem(STORAGE_KEYS.CURRENT_USER), null);
    });
  });

  describe('Student Registration & OTP', () => {
    it('initiates signup and stores pending registration in storage', () => {
      const pending = store.startSignup({
        name: 'Rahul Sharma',
        email: 'rahul@pict.edu',
        password: 'mypassword',
      });

      assert.strictEqual(pending.otp, '419419');
      assert.strictEqual(store.getPendingSignup().email, 'rahul@pict.edu');
    });

    it('verifies OTP, creates verified user, and logs user in', () => {
      store.startSignup({
        name: 'Pooja Verma',
        email: 'pooja@pict.edu',
        password: 'pass1234',
      });

      const verified = store.verifyOtp('419419');
      assert.strictEqual(verified, true);

      const current = store.getCurrentUser();
      assert.strictEqual(current.name, 'Pooja Verma');
      assert.strictEqual(current.email, 'pooja@pict.edu');
      assert.strictEqual(store.getPendingSignup(), null);
    });

    it('falls back to default profile when verifying OTP without pending signup', () => {
      global.localStorage.removeItem(STORAGE_KEYS.PENDING_SIGNUP);
      const verified = store.verifyOtp('419419');
      assert.strictEqual(verified, true);
      assert.strictEqual(store.getCurrentUser().name, 'Ananya Rao');
    });
  });

  describe('Profile Updates', () => {
    it('patches current user profile fields and persists changes', () => {
      const updated = store.updateProfile({ preferredZone: 'Window row' });
      assert.strictEqual(updated.preferredZone, 'Window row');
      assert.strictEqual(store.getCurrentUser().preferredZone, 'Window row');
    });

    it('returns undefined if updateProfile is called with no active user', () => {
      store.signOut();
      const updated = store.updateProfile({ preferredZone: 'Silent zone' });
      assert.strictEqual(updated, undefined);
    });
  });

  describe('Staff Admin Authentication', () => {
    it('authenticates default staff credentials (LIB-0042 / admin123)', () => {
      const res = store.loginAdmin('LIB-0042', 'admin123');
      assert.strictEqual(res.success, true);
      assert.ok(store.getAdminSession());
      assert.strictEqual(store.getAdminSession().staffId, 'LIB-0042');
    });

    it('normalizes staff ID case and whitespace (e.g. lib-0042)', () => {
      const res = store.loginAdmin('  lib-0042  ', 'admin123');
      assert.strictEqual(res.success, true);
      assert.strictEqual(store.getAdminSession().staffId, 'LIB-0042');
    });

    it('authenticates any LIB- prefix with admin or admin123', () => {
      const res = store.loginAdmin('LIB-9999', 'admin');
      assert.strictEqual(res.success, true);
      assert.strictEqual(store.getAdminSession().staffId, 'LIB-9999');
    });

    it('rejects invalid staff credentials', () => {
      const res = store.loginAdmin('STUDENT-01', 'badpass');
      assert.strictEqual(res.success, false);
      assert.strictEqual(store.getAdminSession(), null);
      assert.match(res.message, /Invalid Staff ID/i);
    });

    it('logs out admin and removes admin session from storage', () => {
      store.loginAdmin('LIB-0042', 'admin123');
      assert.ok(store.getAdminSession());

      store.logoutAdmin();
      assert.strictEqual(store.getAdminSession(), null);
      assert.strictEqual(global.localStorage.getItem(STORAGE_KEYS.ADMIN_SESSION), null);
    });

    it('restores admin session across page reloads (new AuthStore instances)', () => {
      store.loginAdmin('LIB-0042', 'admin123');
      assert.ok(store.getAdminSession());

      // Simulate a brand new page load where AuthStore is re-instantiated
      const freshStore = new AuthStore();
      const session = freshStore.getAdminSession();
      assert.ok(session, 'Fresh AuthStore must restore admin session from localStorage');
      assert.strictEqual(session.staffId, 'LIB-0042');
      assert.strictEqual(session.role, 'admin');
    });
  });
});
