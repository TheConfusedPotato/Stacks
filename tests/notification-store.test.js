/**
 * notification-store.test.js
 *
 * Unit tests and edge cases for NotificationStore.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupMockEnvironment, loadScripts } = require('./test-helper');

setupMockEnvironment();
loadScripts(['constants.js', 'notification-store.js']);

describe('NotificationStore', () => {
  let store;

  beforeEach(() => {
    global.localStorage.clear();
    store = new NotificationStore();
  });

  describe('Default Initialization & Seeding', () => {
    it('seeds 4 default notifications with 1 unread alert', () => {
      const all = store.getAll();
      assert.strictEqual(all.length, 4);
      assert.strictEqual(store.getUnreadCount(), 1);
    });

    it('gracefully recovers from corrupted JSON in localStorage', () => {
      global.localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, '{BROKEN_JSON');
      const recovered = new NotificationStore();
      assert.strictEqual(recovered.getAll().length, 4);
      assert.strictEqual(recovered.getUnreadCount(), 1);
    });
  });

  describe('Reading & Marking Notifications', () => {
    it('marks all notifications as read and updates count to 0', () => {
      assert.strictEqual(store.getUnreadCount(), 1);
      store.markAllAsRead();
      assert.strictEqual(store.getUnreadCount(), 0);

      const persisted = JSON.parse(global.localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS));
      const hasUnread = persisted.some((n) => n.unread === true);
      assert.strictEqual(hasUnread, false);
    });

    it('returns notifications sorted descending by timestamp', () => {
      const all = store.getAll();
      for (let i = 0; i < all.length - 1; i++) {
        assert.ok(
          all[i].timestamp >= all[i + 1].timestamp,
          `Index ${i} (${all[i].timestamp}) should be >= Index ${i + 1} (${all[i + 1].timestamp})`
        );
      }
    });

    it('prevents external mutation from affecting internal notification list', () => {
      const all = store.getAll();
      all.length = 0;
      assert.strictEqual(store.getAll().length, 4);
    });
  });

  describe('Adding Notifications & Icon Mapping', () => {
    it('maps type to corresponding symbol icon: teal -> ✓, amber -> ＊, red -> !, gray -> ◐', () => {
      const tealNotif = store.add({ type: 'teal', title: 'Teal Title', desc: 'Teal Desc' });
      assert.strictEqual(tealNotif.icon, '✓');

      const amberNotif = store.add({ type: 'amber', title: 'Amber Title', desc: 'Amber Desc' });
      assert.strictEqual(amberNotif.icon, '＊');

      const redNotif = store.add({ type: 'red', title: 'Red Title', desc: 'Red Desc' });
      assert.strictEqual(redNotif.icon, '!');

      const grayNotif = store.add({ type: 'gray', title: 'Gray Title', desc: 'Gray Desc' });
      assert.strictEqual(grayNotif.icon, '◐');

      const customNotif = store.add({ type: 'unknown', icon: '★', title: 'Custom', desc: 'Custom Desc' });
      assert.strictEqual(customNotif.icon, '★');

      const fallbackNotif = store.add({ type: 'unknown', title: 'Fallback', desc: 'Fallback Desc' });
      assert.strictEqual(fallbackNotif.icon, '•');
    });

    it('increments unread count when a new unread notification is added', () => {
      const initialUnread = store.getUnreadCount();
      store.add({
        type: 'teal',
        title: 'New Booking',
        desc: 'Booking verified',
      });
      assert.strictEqual(store.getUnreadCount(), initialUnread + 1);
    });

    it('allows explicitly marking a new notification as read upon creation', () => {
      const initialUnread = store.getUnreadCount();
      const notif = store.add({
        type: 'teal',
        title: 'Background sync',
        desc: 'Already acknowledged',
        unread: false,
      });
      assert.strictEqual(notif.unread, false);
      assert.strictEqual(store.getUnreadCount(), initialUnread);
    });
  });
  describe('Platform Notifications & Audio Chime', () => {
    beforeEach(() => {
      if (global.Notification && typeof global.Notification.reset === 'function') {
        global.Notification.reset();
      }
      if (global.AudioContext && typeof global.AudioContext.reset === 'function') {
        global.AudioContext.reset();
      }
    });

    it('requests browser notification permission via Notification.requestPermission()', async () => {
      assert.strictEqual(global.Notification.permission, 'default');
      assert.strictEqual(store.hasPermission(), false);

      const perm = await store.requestPermission();
      assert.strictEqual(perm, 'granted');
      assert.strictEqual(global.Notification.permission, 'granted');
      assert.strictEqual(store.hasPermission(), true);
    });

    it('returns false for hasPermission when permission is denied', () => {
      global.Notification.permission = 'denied';
      assert.strictEqual(store.hasPermission(), false);
    });

    it('sends platform notification when permission is granted', () => {
      global.Notification.permission = 'granted';
      const notif = store.sendPlatformNotification('Stacks Library · Vacate', {
        body: 'Time is up for Seat A2.',
        tag: 'vacate-A2',
      });
      assert.ok(notif);
      assert.strictEqual(notif.title, 'Stacks Library · Vacate');
      assert.strictEqual(notif.body, 'Time is up for Seat A2.');
      assert.strictEqual(notif.tag, 'vacate-A2');
      assert.strictEqual(global.Notification.instances.length, 1);
    });

    it('returns null and suppresses error when permission is denied', () => {
      global.Notification.permission = 'denied';
      const notif = store.sendPlatformNotification('Test', { body: 'Denied' });
      assert.strictEqual(notif, null);
      assert.strictEqual(global.Notification.instances.length, 0);
    });

    it('plays synthesized two-tone audio chime (587Hz & 880Hz)', () => {
      const res = store.playAudioChime();
      assert.strictEqual(res, true);
      const events = global.AudioContext.audioEvents;
      assert.ok(events.length >= 2, 'Should schedule multiple audio tones');
      const starts = events.filter((e) => e.type === 'start');
      assert.strictEqual(starts.length, 2);
      assert.strictEqual(starts[0].freq, 587.33);
      assert.strictEqual(starts[1].freq, 880.0);
    });

    it('notifyVacate coordinates audio chime, platform notification, and in-app feed', () => {
      global.Notification.permission = 'granted';
      const result = store.notifyVacate('B2');
      assert.ok(result);
      assert.strictEqual(result.seatId, 'B2');
      assert.strictEqual(result.chimePlayed, true);
      assert.strictEqual(result.platformSent, true);
      assert.strictEqual(result.notificationInstance.title, 'Time to vacate Seat B2');
      assert.ok(result.inAppRecord);
      assert.strictEqual(result.inAppRecord.type, 'red');
      assert.ok(result.inAppRecord.title.includes('Seat B2') || result.inAppRecord.title.includes('seat B2'));

      // Test debouncing: immediate second call within 30s reuses result without extra notifications
      const secondCall = store.notifyVacate('B2');
      assert.strictEqual(secondCall.timestamp, result.timestamp);
      assert.strictEqual(global.Notification.instances.length, 1);
    });
  });
});
