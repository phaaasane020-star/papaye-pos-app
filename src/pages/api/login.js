import bcrypt from "bcryptjs";
import { supabase } from "../../lib/supabase.js";
import { setPendingCookie } from "../../lib/auth.js";
import { lockMessage, registerFailure, rateLimited, getIp } from "../../lib/security.js";
import { audit } from "../../lib/audit.js";

export const prerender = false;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Used so a wrong username takes as long to answer as a wrong PIN
const DUMMY_HASH = bcrypt.hashSync("not-a-real-pin", 6);

export async function POST({ request, cookies, clientAddress }) {
  const ip = getIp({ request, clientAddress });

  if (rateLimited(`login:${ip}`, 12, 10 * 60 * 1000)) {
    return json({ ok: false, error: "Too many attempts from this device. Wait a few minutes and try again." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const username = String(body.username || "").trim().toLowerCase();
  const pin = String(body.pin || "").trim();
  if (!username || !pin) return json({ ok: false, error: "Enter your username and PIN." }, 400);
  if (username.length > 40 || pin.length > 20) return json({ ok: false, error: "Wrong username or PIN." }, 401);

  const { data: user, error } = await supabase
    .from("staff")
    .select("id, name, role, pin_hash, active, totp_enabled, failed_attempts, locked_until")
    .eq("username", username)
    .maybeSingle();

  if (error) return json({ ok: false, error: "Server error. Please try again." }, 500);

  // Always do a hash check, even for unknown users
  const valid = await bcrypt.compare(pin, user?.pin_hash || DUMMY_HASH);

  if (!user || !user.active) {
    await audit(null, "login_failed", { username, reason: "unknown or inactive" }, ip);
    return json({ ok: false, error: "Wrong username or PIN." }, 401);
  }

  const locked = lockMessage(user);
  if (locked) {
    await audit(user, "login_blocked", { reason: "account locked" }, ip);
    return json({ ok: false, error: locked }, 429);
  }

  if (!valid) {
    await registerFailure(user);
    await audit(user, "login_failed", { reason: "wrong PIN" }, ip);
    return json({ ok: false, error: "Wrong username or PIN." }, 401);
  }

  // PIN is right. Now they still need the authenticator code.
  setPendingCookie(cookies, { id: user.id });
  return json({ ok: true, next: user.totp_enabled ? "code" : "setup" });
}