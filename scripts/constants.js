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
});

var TIMER_RULES = Object.freeze({
  SCAN_WINDOW_MS: 10 * 60 * 1000,
  VACATE_WINDOW_MS: 5 * 60 * 1000,
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
});

var DEFAULT_STUDENT = Object.freeze({
  id: 'USR-042',
  name: 'Ananya Rao',
  email: 'ananya@pict.edu',
  password: 'password123',
  branch: 'B.Tech CSE · 3rd year',
  cardStatus: 'verified card',
  preferredZone: 'Silent zone',
});

var DEFAULT_STAFF = Object.freeze({
  id: 'LIB-0042',
  staffId: 'LIB-0042',
  name: 'Chief Librarian S. Murthy',
  password: 'admin123',
  role: 'admin',
});

if (typeof window !== 'undefined') {
  window.SEAT_STATUS = SEAT_STATUS;
  window.TIMER_RULES = TIMER_RULES;
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.HISTORY_STATUS = HISTORY_STATUS;
  window.DEFAULT_STUDENT = DEFAULT_STUDENT;
  window.DEFAULT_STAFF = DEFAULT_STAFF;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SEAT_STATUS = SEAT_STATUS;
  globalThis.TIMER_RULES = TIMER_RULES;
  globalThis.STORAGE_KEYS = STORAGE_KEYS;
  globalThis.HISTORY_STATUS = HISTORY_STATUS;
  globalThis.DEFAULT_STUDENT = DEFAULT_STUDENT;
  globalThis.DEFAULT_STAFF = DEFAULT_STAFF;
}
