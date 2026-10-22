import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://hnbiuaqcgtqazguiklar.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_PD1FEr0P0xG0hqGpruT1Zg_ZSjg1dtT";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const norm = (id) => (id || "").trim().toUpperCase();

// Session cache — flushed after any sign-in or sign-out.
let sessionPromise = null;

async function ensureSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return session;
      throw new Error('Not signed in');
    })().catch((e) => { sessionPromise = null; throw e; });
  }
  return sessionPromise;
}

// Returns the current session, waiting up to ~1 s for Supabase to rehydrate
// from storage after a page load. Falls back to null — never throws.
async function getSessionWithRetry() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    // Give the Supabase client a moment to finish reading its stored token.
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

// Returns true/false from the function. THROWS on any real error.
async function rpc(fn, args) {
  await ensureSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data === true;
}

export const StacksSupabase = {
  client: supabase,

  // ---- identity ----------------------------------------------------------
  async peekUserId() {            // existing session only, never creates one
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.user.id : null;
  },
  async getUserId() { return (await ensureSession()).user.id; },

  // ---- student auth -------------------------------------------------------
async signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
},

async signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },   // stored in auth.users.raw_user_meta_data
  });
  if (error) throw error;
  // Insert into profiles immediately (in case the DB trigger doesn't exist yet).
  // .upsert so it's idempotent on retry.
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name,
      email,
    }, { onConflict: 'id' });
  }
  // needsOtp = true when Supabase has "Confirm email" on (session is null until verified)
  return { needsOtp: !data.session };
},

async verifySignupOtp(email, token) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) throw error;
},

async resendSignupOtp(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
},

async sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
},

// ---- profiles -----------------------------------------------------------
async fetchProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
},

async updateProfile(patch) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', session.user.id);
  if (error) throw error;
},

  // ---- staff (real Supabase auth; the database decides who is admin) -----

  // Safe to call on every page load — waits for the session to rehydrate
  // from localStorage before calling the DB, so no false "not admin" on reload.
  async isAdmin() {
    const session = await getSessionWithRetry();
    if (!session || session.user.is_anonymous) return false;
    const { data, error } = await supabase.rpc("is_admin");
    if (error) { console.error("[Supabase] is_admin:", error); return false; }
    return data === true;
  },

  async adminSignIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    sessionPromise = null; // flush stale cache so ensureSession re-reads the new session

    if (!(await StacksSupabase.isAdmin())) {
      await supabase.auth.signOut();
      sessionPromise = null;
      throw new Error("This account is not staff");
    }
    return true;
  },

  async signOut() {
    sessionPromise = null;
    await supabase.auth.signOut();
  },
  // status: 'free' | 'maintenance' | 'overstay'. RLS blocks non-admins silently
  // (0 rows), so we check the returned rows instead of trusting "no error".
  async adminSetStatus(id, status) {
    const patch = { status };
    if (status === "free" || status === "maintenance") {
      Object.assign(patch, {
        booked_by: null,
        booked_at: null,
        session_ends_at: null,
        break_ends_at: null,
        break_used: false,
      });
    }
    const { data, error } = await supabase
      .from("seats").update(patch).eq("id", norm(id)).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error("NOT_ADMIN");
    return true;
  },

  // ---- seats -------------------------------------------------------------
  async fetchSeats() {
    const { data, error } = await supabase.from("seats").select("*").order("id");
    if (error) { console.error("[Supabase] fetchSeats:", error); return null; }
    return data;
  },
  async fetchSeat(id) {
    const { data, error } = await supabase.from("seats").select("*").eq("id", norm(id)).maybeSingle();
    if (error) { console.error("[Supabase] fetchSeat:", error); return null; }
    return data;
  },

  bookSeat(id, hours = 2) { return rpc("book_seat", { seat_id: norm(id), hours }); },
  confirmSeat(id)         { return rpc("confirm_seat", { seat_id: norm(id) }); },
  vacateSeat(id)          { return rpc("vacate_seat", { seat_id: norm(id) }); },
  // breakMinutes must be 5 | 10 | 15 — enforced server-side too
  startBreak(id, breakMinutes) { return rpc("start_break", { seat_id: norm(id), break_minutes: Number(breakMinutes) }); },
  resumeBreak(id)              { return rpc("resume_break", { seat_id: norm(id) }); },

  subscribeToSeatsRealtime(callback) {
    return supabase
      .channel("seats-realtime-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" },
          (payload) => typeof callback === "function" && callback(payload))
      .subscribe();
  },
};

if (typeof window !== "undefined") {
  window.supabase = supabase;
  window.supabaseClient = supabase;
  window.StacksSupabase = StacksSupabase;
  window.dispatchEvent(new CustomEvent("stacks:supabase-ready", {
    detail: { supabase, StacksSupabase },
  }));
}