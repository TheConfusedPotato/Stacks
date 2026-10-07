/**
 * notification-store.js
 * In-app notifications & alerts feed with platform browser notifications and audio chime support.
 */
class NotificationStore {
  constructor() {
    this._notifications = [];
    this._audioCtx = null;
    this._lastVacateAlert = null;
    this._load();
    if (this._notifications.length === 0) {
      this._seedDefaults();
      this._save();
    }
  }

  // --- Browser Notification Permissions & Platform Alerts ---

  async requestPermission() {
    const Notif = (typeof window !== 'undefined' && window.Notification) ||
                  (typeof globalThis !== 'undefined' && globalThis.Notification);
    if (!Notif || typeof Notif.requestPermission !== 'function') return 'unsupported';
    try {
      return await new Promise((resolve) => {
        try {
          const res = Notif.requestPermission((perm) => {
            if (perm) resolve(perm);
          });
          if (res && typeof res.then === 'function') {
            res.then((perm) => resolve(perm)).catch(() => resolve(Notif.permission || 'default'));
          }
        } catch (err) {
          resolve(Notif.permission || 'default');
        }
      });
    } catch (e) {
      return Notif.permission || 'default';
    }
  }

  hasPermission() {
    const Notif = (typeof window !== 'undefined' && window.Notification) ||
                  (typeof globalThis !== 'undefined' && globalThis.Notification);
    return Boolean(Notif && Notif.permission === 'granted');
  }

  sendPlatformNotification(title, options = {}) {
    const Notif = (typeof window !== 'undefined' && window.Notification) ||
                  (typeof globalThis !== 'undefined' && globalThis.Notification);
    if (Notif && Notif.permission === 'granted') {
      try {
        return new Notif(title, {
          body: options.body || '',
          icon: options.icon || 'favicon.ico',
          tag: options.tag || 'stacks-notification',
          requireInteraction: options.requireInteraction ?? true,
          ...options,
        });
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // --- Web Audio API Chime Support ---

  initAudioContext() {
    try {
      const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                       (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext)) || null;
      if (!AudioCtx) return null;
      if (!this._audioCtx) {
        this._audioCtx = new AudioCtx();
      }
      if (this._audioCtx.state === 'suspended' && typeof this._audioCtx.resume === 'function') {
        this._audioCtx.resume();
      }
      return this._audioCtx;
    } catch (e) {
      return null;
    }
  }

  playAudioChime() {
    try {
      const ctx = this._audioCtx || this.initAudioContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume();
      }
      const now = ctx.currentTime || 0;

      // Note 1: 587.33 Hz (D5) - pleasant opening chime tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      if (osc1.frequency && typeof osc1.frequency.setValueAtTime === 'function') {
        osc1.frequency.setValueAtTime(587.33, now);
      }
      if (gain1.gain && typeof gain1.gain.setValueAtTime === 'function') {
        gain1.gain.setValueAtTime(0.18, now);
        if (typeof gain1.gain.exponentialRampToValueAtTime === 'function') {
          gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        }
      }
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      if (typeof osc1.start === 'function') osc1.start(now);
      if (typeof osc1.stop === 'function') osc1.stop(now + 0.45);

      // Note 2: 880.00 Hz (A5) - higher chime resolution tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      if (osc2.frequency && typeof osc2.frequency.setValueAtTime === 'function') {
        osc2.frequency.setValueAtTime(880.00, now + 0.20);
      }
      if (gain2.gain && typeof gain2.gain.setValueAtTime === 'function') {
        gain2.gain.setValueAtTime(0.22, now + 0.20);
        if (typeof gain2.gain.exponentialRampToValueAtTime === 'function') {
          gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
        }
      }
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      if (typeof osc2.start === 'function') osc2.start(now + 0.20);
      if (typeof osc2.stop === 'function') osc2.stop(now + 0.75);

      return true;
    } catch (e) {
      return false;
    }
  }

  notifyVacate(seatId) {
    if (!seatId) return null;
    const now = Date.now();
    // Debounce duplicate calls within 30 seconds for the same seat
    if (this._lastVacateAlert && this._lastVacateAlert.seatId === seatId && (now - this._lastVacateAlert.time < 30000)) {
      return this._lastVacateAlert.result;
    }

    // 1. Play audio chime if page is open
    const chimePlayed = this.playAudioChime();

    // 2. Dispatch platform notification
    const platformNotification = this.sendPlatformNotification(`Time to vacate Seat ${seatId}`, {
      body: `Your session for Seat ${seatId} has ended. Please vacate within 5 minutes to avoid overstay flags.`,
      tag: `vacate-${seatId}`,
      requireInteraction: true,
    });

    // 3. Add to in-app notification feed
    const inAppRecord = this.add({
      type: 'red',
      icon: '!',
      title: `Session ended — vacate seat ${seatId}`,
      desc: `You have 5 minutes to leave before it's flagged for a personnel check.`,
    });

    const result = {
      seatId,
      chimePlayed,
      platformSent: Boolean(platformNotification),
      notificationInstance: platformNotification,
      inAppRecord,
      timestamp: now,
    };

    this._lastVacateAlert = { seatId, time: now, result };
    return result;
  }

  // --- Existing Store Methods ---

  getAll() {
    return [...this._notifications].sort((a, b) => b.timestamp - a.timestamp);
  }
  getUnreadCount() {
    return this._notifications.filter(n => n.unread).length;
  }
  markAllRead() { return this.markAllAsRead(); }
  markAllAsRead() {
    for (const item of this._notifications) item.unread = false;
    this._save();
  }
  add(item) {
    const iconMap = { teal: '✓', amber: '＊', red: '!', gray: '◐' };
    const notif = {
      id: 'NOTIF-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      type: item.type || 'teal',
      icon: item.icon || iconMap[item.type] || '•',
      title: item.title,
      desc: item.desc,
      time: item.time || this._formatTime(Date.now()),
      group: 'Today',
      unread: item.unread !== undefined ? item.unread : true,
      timestamp: Date.now(),
    };
    this._notifications.unshift(notif);
    this._save();
    return notif;
  }
  _formatTime(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  }
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (raw) this._notifications = JSON.parse(raw);
    } catch (e) {}
  }
  _save() {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(this._notifications));
    } catch (e) {}
  }
  _seedDefaults() {
    const now = Date.now();
    this._notifications = [
      { id: 'NOTIF-1', type: 'red', icon: '!', title: 'Session ended — vacate seat A2', desc: "You have 5 minutes to leave before it's flagged for a personnel check.", time: '5:42 pm', group: 'Today', unread: true, timestamp: now - 3600000 },
      { id: 'NOTIF-2', type: 'teal', icon: '✓', title: 'Session started', desc: 'Your timer for seat A2 began after scanning the QR.', time: '3:44 pm', group: 'Today', unread: false, timestamp: now - 7200000 },
      { id: 'NOTIF-3', type: 'amber', icon: '＊', title: 'Booking released — no scan', desc: "Seat B1 wasn't confirmed within 10 minutes, so it was freed up.", time: 'Mon, 10:12 am', group: 'This week', unread: false, timestamp: now - 86400000 * 2 },
      { id: 'NOTIF-4', type: 'gray', icon: '◐', title: 'Welcome to Stacks', desc: "Your account was verified. You're ready to book your first seat.", time: 'Mon, 9:02 am', group: 'This week', unread: false, timestamp: now - 86400000 * 3 },
    ];
  }
}

var notificationStore = new NotificationStore();
if (typeof window !== 'undefined') window.notificationStore = notificationStore;
if (typeof globalThis !== 'undefined') globalThis.notificationStore = notificationStore;
