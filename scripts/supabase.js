import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Supabase project configuration (base URL without /rest/v1/)
export const SUPABASE_URL = "https://hnbiuaqcgtqazguiklar.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_PD1FEr0P0xG0hqGpruT1Zg_ZSjg1dtT";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const StacksSupabase = {
  client: supabase,
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,

  async fetchSeats() {
    try {
      const { data, error } = await supabase
        .from("seats")
        .select("*")
        .order("id", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn("[Supabase] client.fetchSeats error:", e);
    }

    // Direct REST API fallback
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/seats?select=*&order=id.asc`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn("[Supabase] REST fetch fallback error:", e);
    }
    return null;
  },

  async bookSeat(seatId, userId = null) {
    const id = (seatId || "").trim().toUpperCase();
    if (!id) return false;

    // 1. Try atomic book_seat RPC
    try {
      const { data, error } = await supabase.rpc("book_seat", { seat_id: id });
      if (!error && data !== false) return true;
    } catch (_) {}

    // 2. Try direct table update
    try {
      const { error } = await supabase
        .from("seats")
        .update({ status: "booked", booked_by: userId })
        .eq("id", id);
      if (!error) return true;
    } catch (_) {}

    // 3. Direct REST RPC fallback
    try {
      const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/book_seat`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ seat_id: id }),
      });
      if (rpcResp.ok) return true;
    } catch (_) {}

    // 4. Direct REST update fallback
    try {
      const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/seats?id=eq.${id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "booked", booked_by: userId }),
      });
      if (patchResp.ok) return true;
    } catch (_) {}

    return false;
  },

  async vacateSeat(seatId) {
    const id = (seatId || "").trim().toUpperCase();
    if (!id) return false;

    // 1. Try atomic vacate_seat RPC
    try {
      const { data, error } = await supabase.rpc("vacate_seat", { seat_id: id });
      if (!error && data !== false) return true;
    } catch (_) {}

    // 2. Try direct table update
    try {
      const { error } = await supabase
        .from("seats")
        .update({ status: "free", booked_by: null })
        .eq("id", id);
      if (!error) return true;
    } catch (_) {}

    // 3. Direct REST RPC fallback
    try {
      const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vacate_seat`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ seat_id: id }),
      });
      if (rpcResp.ok) return true;
    } catch (_) {}

    // 4. Direct REST update fallback
    try {
      const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/seats?id=eq.${id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "free", booked_by: null }),
      });
      if (patchResp.ok) return true;
    } catch (_) {}

    return false;
  },

  subscribeToSeatsRealtime(callback) {
    try {
      const channel = supabase
        .channel("seats-realtime-channel")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "seats" },
          (payload) => {
            if (typeof callback === "function") {
              callback(payload);
            }
          }
        )
        .subscribe();
      return channel;
    } catch (e) {
      console.warn("[Supabase] Realtime error:", e);
      return null;
    }
  },
};

// Expose globally for classic scripts and window access
if (typeof window !== "undefined") {
  window.supabase = supabase;
  window.supabaseClient = supabase;
  window.StacksSupabase = StacksSupabase;
  window.dispatchEvent(
    new CustomEvent("stacks:supabase-ready", {
      detail: { supabase, StacksSupabase },
    })
  );
}

if (typeof globalThis !== "undefined") {
  globalThis.supabase = supabase;
  globalThis.supabaseClient = supabase;
  globalThis.StacksSupabase = StacksSupabase;
}
