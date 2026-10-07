/**
 * history-store.js
 * History session management.
 */
class HistoryStore {
  constructor() {
    this._entries = [];
    this._load();
    const hasDiscussion = this._entries.some(e => e.zone && e.zone.toLowerCase().includes('discussion'));
    if (this._entries.length === 0 || hasDiscussion) {
      this._seedDefaults();
      this._save();
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
  addEntry(entry) {
    const record = {
      id: 'HIST-' + Date.now(),
      seatId: entry.seatId,
      zone: entry.zone || 'Silent zone',
      duration: entry.duration || '2 hrs',
      timeLabel: entry.timeLabel || this._formatTimeRange(Date.now()),
      status: entry.status || HISTORY_STATUS.COMPLETED,
      timestamp: Date.now(),
      group: 'Today',
    };
    this._entries.unshift(record);
    this._save();
    return record;
  }
  _formatTimeRange(startMs) {
    const start = new Date(startMs);
    const end = new Date(startMs + 2 * 60 * 60 * 1000);
    const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
    return `${start.toLocaleTimeString([], opts).toLowerCase()} – ${end.toLocaleTimeString([], opts).toLowerCase()} · 2 hrs`;
  }
  _load() {
    try {
      try { localStorage.removeItem('stacks.history.v1'); } catch (_) {}
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (raw) this._entries = JSON.parse(raw);
    } catch (e) {}
  }
  _save() {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this._entries));
    } catch (e) {}
  }
  _seedDefaults() {
    const now = Date.now();
    this._entries = [
      { id: 'HIST-1', seatId: 'Seat A2', zone: 'Silent zone', timeLabel: '3:42 pm – 5:42 pm · 2 hrs', status: HISTORY_STATUS.COMPLETED, group: 'Today', timestamp: now - 3600000 },
      { id: 'HIST-2', seatId: 'Seat C4', zone: 'Near power', timeLabel: 'Tue · 11:00 am – 1:00 pm', status: HISTORY_STATUS.COMPLETED, group: 'This week', timestamp: now - 86400000 * 2 },
      { id: 'HIST-3', seatId: 'Seat B1', zone: 'Near power', timeLabel: 'Mon · booked, not scanned', status: HISTORY_STATUS.NO_SHOW, group: 'This week', timestamp: now - 86400000 * 3 },
      { id: 'HIST-4', seatId: 'Seat D3', zone: 'Window row', timeLabel: 'Mon · 9:00 am – 11:00 am', status: HISTORY_STATUS.COMPLETED, group: 'This week', timestamp: now - 86400000 * 3.5 },
      { id: 'HIST-5', seatId: 'Seat A1', zone: 'Silent zone', timeLabel: 'Last week · 2:00 pm – 4:00 pm', status: HISTORY_STATUS.COMPLETED, group: 'Older', timestamp: now - 86400000 * 7 },
      { id: 'HIST-6', seatId: 'Seat B2', zone: 'Window row', timeLabel: 'Last week · 10:00 am – 12:00 pm', status: HISTORY_STATUS.COMPLETED, group: 'Older', timestamp: now - 86400000 * 8 },
    ];
  }
}

var historyStore = new HistoryStore();
if (typeof window !== 'undefined') window.historyStore = historyStore;
if (typeof globalThis !== 'undefined') globalThis.historyStore = historyStore;
