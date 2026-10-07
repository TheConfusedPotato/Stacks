/**
 * auth-store.js
 * User & Staff Authentication Store.
 */
class AuthStore {
  constructor() {
    this._users = new Map();
    this._currentUser = null;
    this._adminSession = null;
    this._loadUsers();
    this._loadCurrentSession();
    this._loadAdminSession();
  }
  getCurrentUser() {
    return this._currentUser;
  }
  setCurrentUser(user) {
    this._currentUser = user;
    try {
      if (user) localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      else localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } catch(e) {}
  }
  signOut() {
    this._currentUser = null;
    try { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); } catch(e) {}
  }
  startSignup(data) {
    const pending = { ...data, otp: '419419', createdAt: Date.now() };
    try { localStorage.setItem(STORAGE_KEYS.PENDING_SIGNUP, JSON.stringify(pending)); } catch(e) {}
    return pending;
  }
  getPendingSignup() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PENDING_SIGNUP);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }
  verifyOtp(code) {
    const pending = this.getPendingSignup();
    const user = {
      id: 'USR-' + Math.floor(1000 + Math.random() * 9000),
      name: pending ? pending.name : 'Ananya Rao',
      email: pending ? pending.email : 'ananya@pict.edu',
      password: pending ? pending.password : 'password123',
      branch: 'B.Tech CSE · 3rd year',
      cardStatus: 'verified card',
      preferredZone: 'Silent zone',
      joinedAt: Date.now(),
    };
    this._users.set(user.email.toLowerCase(), user);
    this._saveUsers();
    this.setCurrentUser(user);
    try { localStorage.removeItem(STORAGE_KEYS.PENDING_SIGNUP); } catch(e) {}
    return true;
  }
  login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    let user = this._users.get(cleanEmail);

    if (!user && cleanEmail === DEFAULT_STUDENT.email.toLowerCase()) {
      user = { ...DEFAULT_STUDENT };
      this._users.set(cleanEmail, user);
      this._saveUsers();
    }

    if (!user) {
      if (cleanEmail.includes('@') && password && password.length >= 4) {
        user = {
          id: 'USR-' + Math.floor(1000 + Math.random() * 9000),
          name: cleanEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          email: cleanEmail,
          password: password,
          branch: 'B.Tech CSE · 3rd year',
          cardStatus: 'verified card',
          preferredZone: 'Silent zone',
        };
        this._users.set(cleanEmail, user);
        this._saveUsers();
      } else {
        return { success: false, message: 'Account not found. Please create an account.' };
      }
    }

    if (user.password && user.password !== password) {
      return { success: false, message: 'Invalid password.' };
    }

    this.setCurrentUser(user);
    return { success: true };
  }
  updateProfile(patch) {
    if (!this._currentUser) return;
    const updated = { ...this._currentUser, ...patch };
    this._currentUser = updated;
    this._users.set(updated.email.toLowerCase(), updated);
    this._saveUsers();
    this.setCurrentUser(updated);
    return updated;
  }
  setAdminSession(session) {
    this._adminSession = session;
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
      }
    } catch(e) {}
  }
  _loadAdminSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_SESSION);
      if (raw) {
        this._adminSession = JSON.parse(raw);
      } else {
        this._adminSession = null;
      }
    } catch(e) {
      this._adminSession = null;
    }
  }
  loginAdmin(staffId, password) {
    const rawId = (staffId || '').trim();
    const cleanId = rawId.toUpperCase().replace(/\s+/g, '');
    const cleanPass = (password || '').trim();

    const isDefaultStaff = (cleanId === DEFAULT_STAFF.staffId.toUpperCase() || cleanId === 'LIB-0042' || cleanId === 'LIB0042');
    const isDefaultPass = (cleanPass === DEFAULT_STAFF.password || cleanPass === 'admin123' || cleanPass === 'admin');

    if (isDefaultStaff && isDefaultPass) {
      const session = { ...DEFAULT_STAFF, staffId: 'LIB-0042', id: 'LIB-0042', role: 'admin', loggedInAt: Date.now() };
      this.setAdminSession(session);
      return { success: true };
    }
    if ((cleanId.startsWith('LIB-') || cleanId.startsWith('LIB')) && (cleanPass === 'admin' || cleanPass === 'admin123')) {
      const numPart = cleanId.replace(/^LIB-?/, '');
      const formattedId = 'LIB-' + (numPart || '0042');
      const session = { id: formattedId, staffId: formattedId, name: 'Staff Personnel ' + formattedId, role: 'admin', loggedInAt: Date.now() };
      this.setAdminSession(session);
      return { success: true };
    }
    return { success: false, message: 'Invalid Staff ID or password. Use LIB-0042 / admin123' };
  }
  getAdminSession() {
    if (!this._adminSession) {
      this._loadAdminSession();
    }
    return this._adminSession;
  }
  logoutAdmin() {
    this._adminSession = null;
    try { localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION); } catch(e) {}
  }
  _loadUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      if (raw) {
        const list = JSON.parse(raw);
        for (const u of list) {
          if (u.email && u.email.toLowerCase() === 'ananya@nit.edu.in') {
            u.email = 'ananya@pict.edu';
          }
          this._users.set(u.email.toLowerCase(), u);
        }
      }
    } catch(e) {}
    if (!this._users.has(DEFAULT_STUDENT.email.toLowerCase())) {
      this._users.set(DEFAULT_STUDENT.email.toLowerCase(), { ...DEFAULT_STUDENT });
      this._saveUsers();
    }
  }
  _saveUsers() {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(Array.from(this._users.values())));
    } catch(e) {}
  }
  _loadCurrentSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (raw) {
        this._currentUser = JSON.parse(raw);
        if (this._currentUser && this._currentUser.email && this._currentUser.email.toLowerCase() === 'ananya@nit.edu.in') {
          this._currentUser.email = 'ananya@pict.edu';
          this.setCurrentUser(this._currentUser);
        }
      }
    } catch(e) {}
    if (!this._currentUser) this.setCurrentUser({ ...DEFAULT_STUDENT });
  }
}

var authStore = new AuthStore();
if (typeof window !== 'undefined') window.authStore = authStore;
if (typeof globalThis !== 'undefined') globalThis.authStore = authStore;
