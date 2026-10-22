/**
 * constants.js
 * Single source of truth for shared vocabulary across the app.
 */
var SEAT_STATUS = Object.freeze({
  FREE: 'free',
  PENDING: 'pending',
  OCCUPIED: 'occupied',
  OVERSTAY: 'overstay',
  MAINTENANCE: 'maintenance',
  ON_BREAK: 'on_break',
});

var TIMER_RULES = Object.freeze({
  SCAN_WINDOW_MS: 10 * 60 * 1000,
  VACATE_WINDOW_MS: 5 * 60 * 1000,
  BREAK_OPTIONS_MINUTES: [5, 10, 15],
});

var STORAGE_KEYS = Object.freeze({
  SEATS: 'stacks.seats.v2',
  CURRENT_USER: 'stacks.current_user.v1',
  USERS: 'stacks.users.v1',
  PENDING_SIGNUP: 'stacks.pending_signup.v1',
  HISTORY: 'stacks.history.v2',
  NOTIFICATIONS: 'stacks.notifications.v1',
  ADMIN_SESSION: 'stacks.admin_session.v1',
  SETTINGS: 'stacks.settings.v1',
});

var HISTORY_STATUS = Object.freeze({
  COMPLETED: 'completed',
  NO_SHOW: 'no-show',
  OVERSTAY: 'overstay',
  BREAK_EXPIRED: 'break_expired',
});

// Placeholder only (guests). Real students come from Supabase Auth + the profiles table.
var DEFAULT_STUDENT = Object.freeze({
  id: null,
  name: 'Student',
  email: '',
  branch: '',
  cardStatus: 'unverified',
  preferredZone: 'Silent zone',
});

if (typeof window !== 'undefined') {
  window.SEAT_STATUS = SEAT_STATUS;
  window.TIMER_RULES = TIMER_RULES;
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.HISTORY_STATUS = HISTORY_STATUS;
  window.DEFAULT_STUDENT = DEFAULT_STUDENT;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SEAT_STATUS = SEAT_STATUS;
  globalThis.TIMER_RULES = TIMER_RULES;
  globalThis.STORAGE_KEYS = STORAGE_KEYS;
  globalThis.HISTORY_STATUS = HISTORY_STATUS;
  globalThis.DEFAULT_STUDENT = DEFAULT_STUDENT;
}
// TIMER_RULES.BREAK_OPTIONS_MINUTES is already on the frozen object above;
// re-export the full objects so any script that reads them after this point
// sees the updated frozen copies.