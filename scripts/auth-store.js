/**
 * auth-store.js
 * Student authentication backed by Supabase Auth + the `profiles` table.
 * - Passwords never touch localStorage or this file: they go straight to Supabase Auth.
 * - getCurrentUser() stays synchronous (reads a cache filled at startup; wait on `ready`).
 * - user.id is the Supabase auth user id, the same id the database stores in seats.booked_by.
 */
class AuthStore {
  constructor() {
    this._currentUser = null;
    this.ready = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    // The old fake auth kept plaintext passwords and a forgeable admin flag in localStorage.
    try {
      if (typeof STORAGE_KEYS !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.USERS);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
      }
    } catch (_) {}

    const boot = async () => {
      try {
        await this.refresh();
        const sb = this._helper().client;
        // Only set a field in the callback (calling Supabase from inside it can deadlock).
        sb.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') this._currentUser = null;
        });
      } catch (e) {
        console.warn('[AuthStore] boot error:', e);
      } finally {
        this._resolveReady();
      }
    };

    if (typeof window !== 'undefined') {
      if (window.StacksSupabase) boot();
      else window.addEventListener('stacks:supabase-ready', boot, { once: true });
    }
  }

  _helper() {
    const h = (typeof window !== 'undefined' && window.StacksSupabase) || null;
    if (!h) throw new Error('Backend not ready. Reload the page.');
    return h;
  }

  _friendly(err) {
    const m = (err && err.message) || 'Something went wrong';
    if (/invalid login credentials/i.test(m)) return 'Invalid email or password.';
    if (/email not confirmed/i.test(m)) return 'Please verify your email first (check the code we sent).';
    if (/rate limit/i.test(m)) return 'Too many emails sent. Wait a few minutes and try again.';
    if (/already registered|already been registered/i.test(m)) return 'This email already has an account. Sign in instead.';
    if (/token has expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return 'That code is wrong or expired.';
    return m;
  }

  // Re-read the session and profile into the cache.
  async refresh() {
    const h = this._helper();
    const uid = await h.peekUserId();
    if (!uid) {
      this._currentUser = null;
      return null;
    }
    let profile = null;
    try {
      profile = await h.fetchProfile();
      
      console.log('[refresh] profile:', profile);
      console.log('[refresh] session email:', email);
      console.log('[refresh] _currentUser:', this._currentUser);

    } catch (e) {
      console.warn('[AuthStore] profile fetch failed:', e);
    }
    const { data: { session } } = await h.client.auth.getSession();
    const email = (profile && profile.email) || (session && session.user.email) || '';
    this._currentUser = {
      id: uid,
      name: (profile && profile.name) || email.split('@')[0] || 'Student',
      email,
      branch: (profile && profile.branch) || '',
      cardStatus: (profile && profile.card_status) || 'verified card',
      preferredZone: (profile && profile.preferred_zone) || 'Silent zone',
      joinedAt: profile && profile.created_at ? Date.parse(profile.created_at) : null,
    };
    return this._currentUser;
  }

  getCurrentUser() {
    return this._currentUser;
  }

  async login(email, password) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean || !password) return { success: false, message: 'Enter your email and password.' };
    try {
      await this._helper().signIn(clean, password);
      await this.refresh();
      return { success: true };
    } catch (e) {
      return { success: false, message: this._friendly(e) };
    }
  }

  // Never stores the password. Only name + email are kept (to show on the OTP screen).
  async startSignup({ name, email, password }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    try {
      const { needsOtp } = await this._helper().signUp({
        name: (name || '').trim(),
        email: cleanEmail,
        password,
      });
      try {
        localStorage.setItem(
          STORAGE_KEYS.PENDING_SIGNUP,
          JSON.stringify({ name: (name || '').trim(), email: cleanEmail, createdAt: Date.now() })
        );
      } catch (_) {}
      if (!needsOtp) await this.refresh(); // "Confirm email" is off: already signed in
      return { success: true, needsOtp };
    } catch (e) {
      return { success: false, message: this._friendly(e) };
    }
  }

  getPendingSignup() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PENDING_SIGNUP);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async verifyOtp(code) {
    const pending = this.getPendingSignup();
    if (!pending || !pending.email) return { success: false, message: 'Start sign-up again.' };
    try {
      await this._helper().verifySignupOtp(pending.email, String(code).trim());
      await this.refresh();
      try { localStorage.removeItem(STORAGE_KEYS.PENDING_SIGNUP); } catch (_) {}
      return { success: true };
    } catch (e) {
      return { success: false, message: this._friendly(e) };
    }
  }

  async resendOtp() {
    const pending = this.getPendingSignup();
    if (!pending || !pending.email) return { success: false, message: 'Start sign-up again.' };
    try {
      await this._helper().resendSignupOtp(pending.email);
      return { success: true };
    } catch (e) {
      return { success: false, message: this._friendly(e) };
    }
  }

  async resetPassword(email) {
    try {
      await this._helper().sendPasswordReset((email || '').trim().toLowerCase());
      return { success: true };
    } catch (e) {
      return { success: false, message: this._friendly(e) };
    }
  }

  // patch keys: name, branch, preferredZone
  async updateProfile(patch) {
    const row = {};
    if (patch.name !== undefined) row.name = String(patch.name).trim().slice(0, 80);
    if (patch.branch !== undefined) row.branch = String(patch.branch).trim().slice(0, 80);
    if (patch.preferredZone !== undefined) row.preferred_zone = patch.preferredZone;
    await this._helper().updateProfile(row); // throws on failure
    return this.refresh();
  }

  async signOut() {
    try { await this._helper().signOut(); } catch (_) {}
    this._currentUser = null;
    try { localStorage.removeItem(STORAGE_KEYS.PENDING_SIGNUP); } catch (_) {}
  }

  // Staff auth now lives in Supabase (StacksSupabase.adminSignIn / isAdmin).
  // Stubs remain only so any stray old caller does not crash.
  getAdminSession() { return null; }
  loginAdmin() { return { success: false, message: 'Staff sign-in moved to Supabase.' }; }
  logoutAdmin() {}
}

var authStore = new AuthStore();
if (typeof window !== 'undefined') window.authStore = authStore;
if (typeof globalThis !== 'undefined') globalThis.authStore = authStore;