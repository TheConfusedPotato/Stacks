/**
 * history-store.js
 * Read-only view of the student's `seat_history` rows in Supabase.
 * History is WRITTEN by the database (vacate_seat / expire_seats), so it cannot be
 * forged from the browser and follows the student across devices.
 * Call `await historyStore.load()` before reading (app.js does this on history pages).
 */
class HistoryStore {
  constructor() {
    this._entries = [];
    try {
      localStorage.removeItem('stacks.history.v1');
      if (typeof STORAGE_KEYS !== 'undefined') localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch (_) {}
  }

  async load() {
    const helper = typeof window !== 'undefined' ? window.StacksSupabase : null;
    if (!helper) return;
    try {
      const rows = await helper.fetchHistory();
      this._entries = rows.map((r) => this._fromRow(r));
    } catch (e) {
      console.warn('[HistoryStore] load failed:', e);
    }
  }

  getAll() {
    return [...this._entries].sort((a, b) => b.timestamp - a.timestamp);
  }

  getStats() {
    let completed = 0, noShows = 0, overstays = 0;
    for (const item of this._entries) {
      if (item.status === HISTORY_STATUS.COMPLETED) completed++;
      else if (item.status === HISTORY_STATUS.NO_SHOW) noShows++;
      else if (item.status === HISTORY_STATUS.OVERSTAY) overstays++;
    }
    return { completed, noShows, overstays, total: this._entries.length };
  }

  // Kept so older callers do not crash. The database already logged it.
  addEntry() {
    return null;
  }

  _zoneFor(seatId) {
    const r = String(seatId || '')[0];
    if (['E', 'F', 'G'].includes(r)) return 'Near power';
    if (['H', 'I', 'J'].includes(r)) return 'Window row';
    return 'Silent zone';
  }

  _clock(d) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  }

  _fromRow(r) {
    const ended = new Date(r.ended_at);
    const started = new Date(r.started_at);
    const now = new Date();
    const dayMs = 86400000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const age = startOfToday - new Date(ended.getFullYear(), ended.getMonth(), ended.getDate()).getTime();

    let group = 'Older';
    if (age <= 0) group = 'Today';
    else if (age < 7 * dayMs) group = 'This week';

    const day =
      group === 'Today'
        ? ''
        : group === 'This week'
        ? ended.toLocaleDateString([], { weekday: 'short' }) + ' · '
        : ended.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' · ';

    const hours = r.duration_hours || 2;
    const timeLabel =
      r.status === HISTORY_STATUS.NO_SHOW
        ? `${day}booked, not scanned`
        : `${day}${this._clock(started)} – ${this._clock(ended)}${group === 'Today' ? ` · ${hours} hrs` : ''}`;

    return {
      id: 'HIST-' + r.id,
      seatId: `Seat ${r.seat_id}`,
      zone: this._zoneFor(r.seat_id),
      duration: `${hours} hrs`,
      timeLabel,
      status: r.status,
      group,
      timestamp: ended.getTime(),
    };
  }
}

var historyStore = new HistoryStore();
if (typeof window !== 'undefined') window.historyStore = historyStore;
if (typeof globalThis !== 'undefined') globalThis.historyStore = historyStore;