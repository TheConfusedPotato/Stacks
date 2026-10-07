/**
 * seat-store.js
 * Core seat store with Map, localStorage, and Supabase cloud sync.
 */
class SeatStore {
  constructor() {
    this._seats = new Map();
    this._loadFromStorage();
    const hasDiscussion = Array.from(this._seats.values()).some(
      (s) => s.zone && s.zone.toLowerCase().includes("discussion")
    );
    if (this._seats.size < 50 || hasDiscussion) {
      this._seats.clear();
      this._seedDefaults();
      this._saveToStorage();
    }
    this._realtimeSubscribed = false;
    this._initSupabase();
  }

  _getSupabaseHelper() {
    if (typeof window !== "undefined" && window.StacksSupabase)
      return window.StacksSupabase;
    if (typeof globalThis !== "undefined" && globalThis.StacksSupabase)
      return globalThis.StacksSupabase;
    return null;
  }

  _initSupabase() {
    const helper = this._getSupabaseHelper();
    if (helper) {
      this.syncFromSupabase();
      this._setupRealtime();
    } else if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener(
        "stacks:supabase-ready",
        () => {
          this.syncFromSupabase();
          this._setupRealtime();
        },
        { once: true }
      );
    }
  }

  _setupRealtime() {
    if (this._realtimeSubscribed) return;
    const helper = this._getSupabaseHelper();
    if (helper && typeof helper.subscribeToSeatsRealtime === "function") {
      this._realtimeSubscribed = true;
      helper.subscribeToSeatsRealtime((payload) => {
        this._handleRealtimePayload(payload);
      });
    }
  }

  _handleRealtimePayload(payload) {
    if (!payload) return;
    const row = payload.new || payload.record;
    if (row && row.id) {
      this.applySupabaseRow(row);
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent("stacks:seats-updated", { detail: { row, payload } })
        );
      }
    }
  }

  applySupabaseRow(row) {
    const id = (row.id || "").toUpperCase();
    if (!id) return;
    const existing = this.get(id);
    const isBooked = row.status === "booked";
    let newStatus = isBooked
      ? existing?.status === SEAT_STATUS.OVERSTAY
        ? SEAT_STATUS.OVERSTAY
        : existing?.status === SEAT_STATUS.PENDING
        ? SEAT_STATUS.PENDING
        : SEAT_STATUS.OCCUPIED
      : SEAT_STATUS.FREE;
    if (!isBooked) newStatus = SEAT_STATUS.FREE;

    const r = id[0];
    const col = parseInt(id.slice(1), 10) || 1;
    let zone = existing?.zone || "Silent zone";
    let powerOutlet = existing?.powerOutlet || "Yes, at desk";
    let noiseLevel = existing?.noiseLevel || "Silent zone";
    let seatType = existing?.seatType || "Individual study desk";

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

    const nearWindow =
      ["H", "I", "J"].includes(r) || col >= 9 ? "Yes" : "No";

    const updated = {
      ...(existing || {}),
      id: id,
      zone: zone,
      status: newStatus,
      powerOutlet: powerOutlet,
      nearWindow: nearWindow,
      noiseLevel: noiseLevel,
      seatType: seatType,
      bookedBy: isBooked
        ? row.booked_by || existing?.bookedBy || "USR-STUDENT"
        : null,
      bookedAt: isBooked ? existing?.bookedAt || Date.now() : null,
      durationHours: existing?.durationHours || 2,
      sessionEndsAt: isBooked
        ? existing?.sessionEndsAt || Date.now() + 2 * 3600 * 1000
        : null,
    };
    this._seats.set(id, updated);
  }

  async syncFromSupabase() {
    const helper = this._getSupabaseHelper();
    if (!helper || typeof helper.fetchSeats !== "function") return;

    try {
      const rows = await helper.fetchSeats();
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          this.applySupabaseRow(row);
        }
        this._saveToStorage();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("stacks:seats-updated", {
              detail: { count: rows.length },
            })
          );
        }
      }
    } catch (e) {
      console.warn("[SeatStore] Supabase sync error:", e);
    }
  }

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
    return this.getAll().filter(
      (s) => s.zone.toLowerCase() === zone.toLowerCase()
    );
  }
  getUserActiveSeat(userId) {
    if (!userId) return undefined;
    return this.getAll().find(
      (s) =>
        s.bookedBy === userId &&
        (s.status === SEAT_STATUS.PENDING ||
          s.status === SEAT_STATUS.OCCUPIED ||
          s.status === SEAT_STATUS.OVERSTAY)
    );
  }
  set(seatId, record) {
    const id = seatId.trim().toUpperCase();
    this._seats.set(id, { ...record, id });
    this._saveToStorage();
  }
  update(seatId, patch) {
    const id = seatId.trim().toUpperCase();
    const existing = this._seats.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id };
    this._seats.set(id, updated);
    this._saveToStorage();

    // Async sync status changes to Supabase
    if (patch.status) {
      const helper = this._getSupabaseHelper();
      if (helper) {
        if (patch.status === SEAT_STATUS.FREE) {
          helper.vacateSeat(id).catch(() => {});
        } else if (
          patch.status === SEAT_STATUS.OCCUPIED ||
          patch.status === SEAT_STATUS.PENDING
        ) {
          helper.bookSeat(id, patch.bookedBy || existing.bookedBy).catch(() => {});
        }
      }
    }

    return updated;
  }
  delete(seatId) {
    const id = seatId.trim().toUpperCase();
    this._seats.delete(id);
    this._saveToStorage();
  }
  bookSeat(seatId, userId, durationHours = 2) {
    const id = seatId.trim().toUpperCase();
    const now = Date.now();
    const seat = this.update(id, {
      status: SEAT_STATUS.PENDING,
      bookedBy: userId,
      bookedAt: now,
      durationHours: Number(durationHours) || 2,
      sessionEndsAt: null,
    });
    if (typeof scheduleNoShowClear === "function") scheduleNoShowClear(id);
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "amber",
        title: `Seat ${id} booked`,
        desc: `Scan the QR code at Seat ${id} within 10 minutes to start your session.`,
      });
    }

    // Direct Supabase book call
    const helper = this._getSupabaseHelper();
    if (helper && typeof helper.bookSeat === "function") {
      helper.bookSeat(id, userId).catch(() => {});
    }

    return seat;
  }
  confirmSeatScan(seatId, userId) {
    const id = seatId.trim().toUpperCase();
    const existing = this.get(id);
    const duration = existing ? existing.durationHours || 2 : 2;
    const now = Date.now();
    const sessionEndsAt = now + duration * 60 * 60 * 1000;
    if (typeof cancelNoShowClear === "function") cancelNoShowClear(id);
    const seat = this.update(id, {
      status: SEAT_STATUS.OCCUPIED,
      bookedBy: userId,
      sessionEndsAt,
    });
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "teal",
        title: "Session started",
        desc: `Your timer for seat ${id} began after scanning the QR.`,
      });
    }

    // Direct Supabase book call
    const helper = this._getSupabaseHelper();
    if (helper && typeof helper.bookSeat === "function") {
      helper.bookSeat(id, userId).catch(() => {});
    }

    return seat;
  }
  vacateSeat(seatId) {
    const id = seatId.trim().toUpperCase();
    const existing = this.get(id);
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

    // Direct Supabase vacate call
    const helper = this._getSupabaseHelper();
    if (helper && typeof helper.vacateSeat === "function") {
      helper.vacateSeat(id).catch(() => {});
    }

    return this.update(id, {
      status: SEAT_STATUS.FREE,
      bookedBy: null,
      bookedAt: null,
      sessionEndsAt: null,
    });
  }
  expireBooking(seatId) {
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

    // Direct Supabase vacate call
    const helper = this._getSupabaseHelper();
    if (helper && typeof helper.vacateSeat === "function") {
      helper.vacateSeat(id).catch(() => {});
    }

    return this.update(id, {
      status: SEAT_STATUS.FREE,
      bookedBy: null,
      bookedAt: null,
      sessionEndsAt: null,
    });
  }
  flagOverstay(seatId) {
    const id = seatId.trim().toUpperCase();
    if (typeof notificationStore !== "undefined") {
      notificationStore.add({
        type: "red",
        title: `Session ended — vacate seat ${id}`,
        desc: `Grace period expired. Seat ${id} has been flagged for personnel inspection.`,
      });
    }
    return this.update(id, { status: SEAT_STATUS.OVERSTAY });
  }
  _loadFromStorage() {
    try {
      try {
        localStorage.removeItem("stacks.seats.v1");
      } catch (_) {}
      const raw = localStorage.getItem(STORAGE_KEYS.SEATS);
      if (raw) this._seats = new Map(JSON.parse(raw));
    } catch (e) {
      this._seats = new Map();
    }
  }
  _saveToStorage() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.SEATS,
        JSON.stringify(Array.from(this._seats.entries()))
      );
    } catch (e) {}
  }
  _seedDefaults() {
    const defaultUserId = "USR-042";
    const now = Date.now();
    const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

    for (const r of rows) {
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

      for (let num = 1; num <= 10; num++) {
        const id = `${r}${num}`;
        const nearWindow =
          ["H", "I", "J"].includes(r) || num >= 9 ? "Yes" : "No";

        let status = SEAT_STATUS.FREE;
        let bookedBy = null;
        let bookedAt = null;
        let durationHours = 2;
        let sessionEndsAt = null;

        if (id === "A2") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = defaultUserId;
          bookedAt = now - 3600000;
          sessionEndsAt = now + 52 * 60 * 1000;
        } else if (id === "A3") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = "USR-099";
          bookedAt = now - 1800000;
          durationHours = 1;
          sessionEndsAt = now + 40 * 60 * 1000;
        } else if (id === "B1") {
          status = SEAT_STATUS.PENDING;
          bookedBy = "USR-101";
          bookedAt = now - 120000;
        } else if (id === "B4") {
          status = SEAT_STATUS.OVERSTAY;
          bookedBy = "USR-102";
          bookedAt = now - 7500000;
          sessionEndsAt = now - 6 * 60 * 1000;
        } else if (id === "C1") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = "USR-103";
          bookedAt = now - 3000000;
          sessionEndsAt = now + 20 * 60 * 1000;
        } else if (id === "C2") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = "USR-104";
          bookedAt = now - 3000000;
          sessionEndsAt = now + 15 * 60 * 1000;
        } else if (id === "E4") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = "USR-105";
          bookedAt = now - 2400000;
          sessionEndsAt = now + 35 * 60 * 1000;
        } else if (id === "F2") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = "USR-106";
          bookedAt = now - 4000000;
          sessionEndsAt = now + 10 * 60 * 1000;
        } else if (id === "H2") {
          status = SEAT_STATUS.OCCUPIED;
          bookedBy = "USR-107";
          bookedAt = now - 1500000;
          sessionEndsAt = now + 45 * 60 * 1000;
        }

        this._seats.set(id, {
          id: id,
          zone: zone,
          status: status,
          powerOutlet: powerOutlet,
          nearWindow: nearWindow,
          noiseLevel: noiseLevel,
          seatType: seatType,
          bookedBy: bookedBy,
          bookedAt: bookedAt,
          durationHours: durationHours,
          sessionEndsAt: sessionEndsAt,
        });
      }
    }
  }
}

var seatStore = new SeatStore();
if (typeof window !== "undefined") window.seatStore = seatStore;
if (typeof globalThis !== "undefined") globalThis.seatStore = seatStore;
