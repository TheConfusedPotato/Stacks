/**
 * history-store.test.js
 *
 * Unit tests and edge cases for HistoryStore.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupMockEnvironment, loadScripts } = require('./test-helper');

setupMockEnvironment();
loadScripts(['constants.js', 'history-store.js']);

describe('HistoryStore', () => {
  let store;

  beforeEach(() => {
    global.localStorage.clear();
    store = new HistoryStore();
  });

  describe('Default Initialization & Seeding', () => {
    it('seeds 6 default history records when storage is empty', () => {
      const all = store.getAll();
      assert.strictEqual(all.length, 6);
    });

    it('calculates correct summary statistics for seeded history', () => {
      const stats = store.getStats();
      assert.strictEqual(stats.total, 6);
      assert.strictEqual(stats.completed, 5);
      assert.strictEqual(stats.noShows, 1);
      assert.strictEqual(stats.overstays, 0);
    });

    it('gracefully handles corrupted JSON in localStorage', () => {
      global.localStorage.setItem(STORAGE_KEYS.HISTORY, 'CORRUPTED_{DATA');
      const recoveredStore = new HistoryStore();
      const all = recoveredStore.getAll();
      assert.strictEqual(all.length, 6);
    });
  });

  describe('Ordering & Immutability', () => {
    it('returns entries sorted descending by timestamp', () => {
      const all = store.getAll();
      for (let i = 0; i < all.length - 1; i++) {
        assert.ok(
          all[i].timestamp >= all[i + 1].timestamp,
          `Index ${i} (${all[i].timestamp}) should be >= Index ${i + 1} (${all[i + 1].timestamp})`
        );
      }
    });

    it('getAll returns a shallow copy preventing direct mutation of internal storage', () => {
      const list = store.getAll();
      list.pop();
      assert.strictEqual(store.getAll().length, 6);
    });
  });

  describe('Adding Entries', () => {
    it('adds a completed entry with default fallbacks and persists to storage', () => {
      const newEntry = store.addEntry({
        seatId: 'Seat D1',
      });

      assert.ok(newEntry.id.startsWith('HIST-'));
      assert.strictEqual(newEntry.seatId, 'Seat D1');
      assert.strictEqual(newEntry.zone, 'Silent zone');
      assert.strictEqual(newEntry.duration, '2 hrs');
      assert.strictEqual(newEntry.status, HISTORY_STATUS.COMPLETED);
      assert.strictEqual(newEntry.group, 'Today');

      // Check stats updated
      const stats = store.getStats();
      assert.strictEqual(stats.total, 7);
      assert.strictEqual(stats.completed, 6);

      // Verify persistence
      const persisted = JSON.parse(global.localStorage.getItem(STORAGE_KEYS.HISTORY));
      assert.strictEqual(persisted.length, 7);
      assert.strictEqual(persisted[0].seatId, 'Seat D1');
    });

    it('adds an overstay entry with custom timeLabel', () => {
      store.addEntry({
        seatId: 'Seat B4',
        zone: 'Window row',
        status: HISTORY_STATUS.OVERSTAY,
        timeLabel: 'Today · overstay flagged',
      });

      const stats = store.getStats();
      assert.strictEqual(stats.overstays, 1);
      const latest = store.getAll()[0];
      assert.strictEqual(latest.status, HISTORY_STATUS.OVERSTAY);
      assert.strictEqual(latest.timeLabel, 'Today · overstay flagged');
    });

    it('adds a no-show entry accurately updating no-show counter', () => {
      store.addEntry({
        seatId: 'Seat C2',
        zone: 'Near power',
        status: HISTORY_STATUS.NO_SHOW,
        timeLabel: 'Booked, not scanned',
      });

      const stats = store.getStats();
      assert.strictEqual(stats.noShows, 2);
    });
  });
});
