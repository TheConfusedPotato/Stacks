/**
 * seat-store.js
 * Seat store. The Supabase database is the source of truth.
 * - Reads: initial sync + realtime updates (no localStorage seat cache).
 * - Writes: booking/scan/vacate go to the database FIRST; local state is updated
 *   only after the server accepts the change. Errors are thrown, never swallowed.
 */
class SeatStore {
  constructor() {
    this._seats = new Map();
    this._realtimeSubscribed = false;
    this.myUid = null; // Supabase auth user id of this browser (null until known)
    this.ready = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    // Old versions cached seats in localStorage; remove the stale copies.
    try {
      localStorage.removeItem("stacks.seats.v1");
      if (typeof STORAGE_KEYS !== "undefined") localStorage.removeItem(STORAGE_KEYS.SEATS);
    } catch (_) {}

    this._seedDefaults(); // all-FREE placeholders until the first sync lands
    this._initSupabase();
  }

  // ---------------------------------------------------------------- backend

  _getSupabaseHelper() {
    if (typeof window !== "undefined" && window.StacksSupabase) return window.StacksSupabase;
    if (typeof globalThis !== "undefined" && globalThis.StacksSupabase) return globalThis.StacksSupabase;
    return null;
  }

  _requireHelper() {
    const helper = this._getSupabaseHelper();
    if (!helper) throw new Error("Backend not ready. Reload the page.");
    return helper;
  }

  _initSupabase() {
    const boot = async () => {
      const helper = this._getSupabaseHelper();
      try {
        this.myUid = await helper.peekUserId() ?? await helper.getUserId().catch(() => null);
        await this.syncFromSupabase();
      } catch (e) {
        console.warn("[SeatStore] boot error:", e);
      } finally {
        this._resolveReady();
      }
      this._setupRealtime();
    };

    if (this._getSupabaseHelper()) boot();
    else if (typeof window !== "undefined") {
      window.addEventListener("stacks:supabase-ready", boot, { once: true });
    }

    // Realtime can miss events while a phone tab sleeps; resync when it wakes up.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && this._getSupabaseHelper()) this.syncFromSupabase();
      });
    }
  }

  _setupRealtime() {
    if (this._realtimeSubscribed) return;
    const helper = this._getSupabaseHelper();
    if (helper && typeof helper.subscribeToSeatsRealtime === "function") {
      this._realtimeSubscribed = true;
      helper.subscribeToSeatsRealtime((payload) => this._handleRealtimePayload(payload));
    }
  }

  _emitUpdated(detail) {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("stacks:seats-updated", { detail }));
    }
  }

  _handleRealtimePayload(payload) {
    if (!payload) return;
    if (payload.eventType === "DELETE") {
      const oldId = payload.old && payload.old.id;
      if (oldId) {
        this._seats.delete(String(oldId).toUpperCase());
        this._emitUpdated({ deleted: oldId });
      }
      return;
    }
    const row = payload.new || payload.record;
    if (row && row.id) {
      // Detect break expiry: the DB cron flipped our on_break seat to free.
      // Fire the collection-area alert only on this user's own seat.
      const wasOnBreak = payload.old && payload.old.status === "on_break";
      const isNowFree  = row.status === "free";
      const wasMine    = payload.old && payload.old.booked_by === this.myUid;
      if (wasOnBreak && isNowFree && wasMine) {
        if (typeof notificationStore !== "undefined") {
          notificationStore.add({
            type: "red",
            title: `Break expired — Seat ${String(row.id).toUpperCase()} released`,
            desc: "Your belongings have been moved to the collection area at the front desk. Please collect them.",
          });
          if (typeof notificationStore.playAudioChime === "function") {
            notificationStore.playAudioChime();
          }
          if (typeof notificationStore.sendPlatformNotification === "function") {
            notificationStore.sendPlatformNotification(
              `Seat ${String(row.id).toUpperCase()} released — collect belongings`,
              {
                body: "Your break expired. Your belongings are at the front desk collection area.",
                tag: `break-expired-${row.id}`,
                requireInteraction: true,
              }
            );
          }
        }
      }
      this.applySupabaseRow(row);
      this._emitUpdated({ row, payload });
    }
  }

  async syncFromSupabase() {
    const helper = this._getSupabaseHelper();
    if (!helper || typeof helper.fetchSeats !== "function") return;
    try {
      const rows = await helper.fetchSeats();
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) this.applySupabaseRow(row);
        this._emitUpdated({ count: rows.length });
      }
    } catch (e) {
      console.warn("[SeatStore] Supabase sync error:", e);
    }
  }

  async _refreshSeat(id) {
    const row = await this._requireHelper().fetchSeat(id);
    if (row) {
      this.applySupabaseRow(row);
      this._emitUpdated({ row });
    }
  }

  // ------------------------------------------------------ row <-> local seat

  _describe(id) {
    const r = id[0];
    const col = parseInt(id.slice(1), 10) || 1;
    let zone = "Silent zone";
    let powerOutlet = "Yes, at desk";
    let noiseLevel = "Silent zone";
    let seatType = "Individual study desk";

    if (["E", "F", "G"].includes(r)) {
      zone = "Near power";
      powerOutlet = "Yes, dual high-speed surge";
      noiseLevel = "Quiet study";
      seatType = "Power station desk";
    } else if (["H", "I", "J"].includes(r)) {
      zone = "Window row";
      powerOutlet = "Yes, floor socket";
      noiseLevel = "Quiet study";
      seatType = "Window study bay";
    }
    const nearWindow = ["H", "I", "J"].includes(r) || col >= 9 ? "Yes" : "No";
    return { zone, powerOutlet, noiseLevel, seatType, nearWindow };
  }

  applySupabaseRow(row) {
    const id = (row.id || "").toUpperCase();
    if (!id) return;
    const existing = this.get(id) || {};

    const statusMap = {
      free: SEAT_STATUS.FREE,
      pending: SEAT_STATUS.PENDING,
      occupied: SEAT_STATUS.OCCUPIED,
      overstay: SEAT_STATUS.OVERSTAY,
      maintenance: SEAT_STATUS.MAINTENANCE,
      on_break: SEAT_STATUS.ON_BREAK,
    };
    const status = statusMap[row.status] ?? SEAT_STATUS.FREE;
    const noOwner = status === SEAT_STATUS.FREE || status === SEAT_STATUS.MAINTENANCE;

    this._seats.set(id, {
      ...existing,
      ...this._describe(id),
      id,
      status,
      bookedBy: noOwner ? null : row.booked_by || null,
      bookedAt: noOwner || !row.booked_at ? null : Date.parse(row.booked_at),
      durationHours: row.duration_hours || 2,
      sessionEndsAt: row.session_ends_at ? Date.parse(row.session_ends_at) : null,
      breakStartedAt: row.break_started_at ? Date.parse(row.break_started_at) : null,
      breakEndsAt: row.break_ends_at ? Date.parse(row.break_ends_at) : null,
      breakUsed: row.break_used ?? false,
    });
  }

  // ----------------------------------------------------------------- reading

  get(seatId) {
    if (!seatId) return undefined;
    return this._seats.get(seatId.trim().toUpperCase());
  }
  has(seatId) {
    if (!seatId) return false;
    return this._seats.has(seatId.trim().toUpperCase());
  }
  getAll() {
    return Array.from(this._seats.values());
  }
  getByStatus(status) {
    return this.getAll().filter((s) => s.status === status);
  }
  getByZone(zone) {
    if (!zone || zone.toLowerCase() === "all") return this.getAll();
    return this.getAll().filter((s) => s.zone.toLowerCase() === zone.toLowerCase());
  }
  isMine(seat) {
    return Boolean(seat && seat.bookedBy && this.myUid && seat.bookedBy === this.myUid);
  }
  getUserActiveSeat(userId) {
    return this.getAll().find(
      (s) =>
        (this.isMine(s) || (userId && s.bookedBy === userId)) &&
        (s.status === SEAT_STATUS.PENDING ||
          s.status === SEAT_STATUS.OCCUPIED ||
          s.status === SEAT_STATUS.OVERSTAY ||
          s.status === SEAT_STATUS.ON_BREAK)
    );
  }

  // ------------------------------------------------- local-only (no network)

  set(seatId, record) {
    const id = seatId.trim().toUpperCase();
    this._seats.set(id, { ...record, id });
  }
  update(seatId, patch) {
    const id = seatId.trim().toUpperCase();
    const existing = this._seats.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id };
    this._seats.set(id, updated);
    return updated;
  }
  delete(seatId) {
    this._seats.delete(seatId.trim().toUpperCase());
  }

  // ------------------------------------------- server-backed actions (async)

  async bookSeat(seatId, userId, durationHours = 2) {
    const id = seatId.trim().toUpperCase();
    const helper = this._requireHelper();
    const ok = await helper.bookSeat(id, Number(durationHours) || 2); // throws on real errors
    if (!ok) throw new Error("SEAT_TAKEN");
    this.myUid = await helper.getUserId();
    await this._refreshSeat(id);
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "amber",
        title: `Seat ${id} booked`,
        desc: `Scan the QR code at Seat ${id} within 10 minutes to start your session.`,
      });
    }
    return this.get(id);
  }

  async confirmSeatScan(seatId, userId) {
    const id = seatId.trim().toUpperCase();
    const helper = this._requireHelper();
    const ok = await helper.confirmSeat(id);
    if (!ok) throw new Error("CONFIRM_FAILED"); // expired, or not your booking
    await this._refreshSeat(id);
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "teal",
        title: "Session started",
        desc: `Your timer for seat ${id} began after scanning the QR.`,
      });
    }
    return this.get(id);
  }

  async vacateSeat(seatId) {
    const id = seatId.trim().toUpperCase();
    const existing = this.get(id);
    const helper = this._requireHelper();
    const ok = await helper.vacateSeat(id);
    if (!ok) throw new Error("VACATE_FAILED");
    if (typeof cancelOverstayFlag === "function") cancelOverstayFlag(id);
    if (typeof historyStore !== "undefined" && existing) {
      historyStore.addEntry({
        seatId: `Seat ${id}`,
        zone: existing.zone,
        duration: `${existing.durationHours || 2} hrs`,
        status:
          existing.status === SEAT_STATUS.OVERSTAY
            ? HISTORY_STATUS.OVERSTAY
            : HISTORY_STATUS.COMPLETED,
      });
    }
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "teal",
        title: `Seat ${id} vacated`,
        desc: `Your session on Seat ${id} was marked complete and returned to circulation.`,
      });
    }
    await this._refreshSeat(id);
    return this.get(id);
  }

  // The server (pg_cron expire_seats) releases unscanned bookings and flags overstays.
  // These two only record the local notification/history and re-read the seat.
  async expireBooking(seatId) {
    const id = seatId.trim().toUpperCase();
    const existing = this.get(id);
    if (typeof historyStore !== "undefined" && existing) {
      historyStore.addEntry({
        seatId: `Seat ${id}`,
        zone: existing.zone,
        timeLabel: "Booked, not scanned",
        status: HISTORY_STATUS.NO_SHOW,
      });
    }
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "amber",
        title: "Booking released — no scan",
        desc: `Seat ${id} wasn't confirmed within 10 minutes, so it was freed up.`,
      });
    }
    try {
      await this._refreshSeat(id);
    } catch (_) {}
  }

  async flagOverstay(seatId) {
    const id = seatId.trim().toUpperCase();
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "red",
        title: `Session ended — vacate seat ${id}`,
        desc: `Grace period expired. Seat ${id} has been flagged for personnel inspection.`,
      });
    }
    try {
      await this._refreshSeat(id);
    } catch (_) {}
  }

  // --------------------------------------------------------- break management

  async startBreak(seatId, breakMinutes) {
    const id = seatId.trim().toUpperCase();
    const seat = this.get(id);

    // Client-side guard — the RPC enforces this too, but fail fast with a clear message
    if (seat && seat.breakUsed) {
      throw new Error("BREAK_ALREADY_USED");
    }
    if (![5, 10, 15].includes(Number(breakMinutes))) {
      throw new Error("BREAK_INVALID_DURATION");
    }

    const helper = this._requireHelper();
    const ok = await helper.startBreak(id, Number(breakMinutes));
    if (!ok) throw new Error("BREAK_FAILED");

    await this._refreshSeat(id);
    const updated = this.get(id);

    if (typeof notificationStore !== "undefined") {
      const _fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
      const endsAt = updated && updated.breakEndsAt ? _fmtClock(updated.breakEndsAt) : "soon";
      notificationStore.add({
        type: "amber",
        title: `Break started — Seat ${id} held`,
        desc: `You have ${breakMinutes} minutes to return. Seat released at ${endsAt} if you don't scan back in.`,
      });
    }
    return updated;
  }

  async resumeBreak(seatId) {
    const id = seatId.trim().toUpperCase();
    const helper = this._requireHelper();
    const ok = await helper.resumeBreak(id);
    if (!ok) throw new Error("RESUME_FAILED");  // break may have already expired

    await this._refreshSeat(id);

    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "teal",
        title: `Welcome back — Seat ${id}`,
        desc: "Your session has resumed. The remaining time continues from where it left off.",
      });
    }
    return this.get(id);
  }

  // ---------------------------------------------------------------- placeholders

  _seedDefaults() {
    const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    for (const r of rows) {
      for (let num = 1; num <= 10; num++) {
        const id = `${r}${num}`;
        this._seats.set(id, {
          id,
          ...this._describe(id),
          status: SEAT_STATUS.FREE,
          bookedBy: null,
          bookedAt: null,
          durationHours: 2,
          sessionEndsAt: null,
        });
      }
    }
  }
}

var seatStore = new SeatStore();
if (typeof window !== "undefined") window.seatStore = seatStore;
if (typeof globalThis !== "undefined") globalThis.seatStore = seatStore;