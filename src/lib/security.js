import { supabase } from "./supabase.js";

const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

// ---------- Per-account lockout ----------
// Returns a message if the account is locked, otherwise null
export function lockMessage(user) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    return `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
  }
  return null;
}

export async function registerFailure(user) {
  const fails = (user.failed_attempts || 0) + 1;
  if (fails >= MAX_FAILS) {
    await supabase
      .from("staff")
      .update({ failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() })
      .eq("id", user.id);
  } else {
    await supabase.from("staff").update({ failed_attempts: fails }).eq("id", user.id);
  }
}

export async function registerSuccess(user, extra = {}) {
  await supabase.from("staff").update({ failed_attempts: 0, locked_until: null, ...extra }).eq("id", user.id);
}

// ---------- Per-device (IP) rate limit ----------
// Best effort: each server instance keeps its own counter. The account lockout above is the hard stop.
const buckets = new Map();

export function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return false;
  }

  b.count += 1;
  return b.count > max;
}

export function getIp({ request, clientAddress }) {
  const h = request.headers;
  const ip = h.get("x-nf-client-connection-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) return ip;
  try {
    return clientAddress || "unknown";
  } catch {
    return "unknown";
  }
}