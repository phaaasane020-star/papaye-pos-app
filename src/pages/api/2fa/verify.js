import { supabase } from "../../../lib/supabase.js";
import { readPending, clearPendingCookie, setSessionCookie } from "../../../lib/auth.js";
import { checkCode } from "../../../lib/totp.js";
import { lockMessage, registerFailure, registerSuccess, rateLimited, getIp } from "../../../lib/security.js";
import { audit } from "../../../lib/audit.js";

export const prerender = false;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Checks the 6-digit code. Works for first-time setup and for normal logins.
export async function POST({ request, cookies, clientAddress }) {
  const ip = getIp({ request, clientAddress });

  const pending = readPending(cookies);
  if (!pending) return json({ ok: false, error: "Your sign-in expired. Please start again." }, 401);

  if (rateLimited(`code:${ip}`, 15, 10 * 60 * 1000) || rateLimited(`code-user:${pending.id}`, 10, 10 * 60 * 1000)) {
    return json({ ok: false, error: "Too many attempts. Wait a few minutes and try again." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const code = String(body.code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return json({ ok: false, error: "Enter the 6-digit code." }, 400);

  const { data: user, error } = await supabase
    .from("staff")
    .select("id, name, role, active, totp_secret, totp_last_step, failed_attempts, locked_until")
    .eq("id", pending.id)
    .maybeSingle();
  if (error || !user || !user.active || !user.totp_secret) {
    return json({ ok: false, error: "Your sign-in expired. Please start again." }, 401);
  }

  const locked = lockMessage(user);
  if (locked) return json({ ok: false, error: locked }, 429);

  const step = checkCode(user.totp_secret, code);
  if (step === null || step <= Number(user.totp_last_step)) {
    await registerFailure(user);
    await audit(user, "code_failed", {}, ip);
    return json({ ok: false, error: "That code is not correct. Wait for a fresh code and try again." }, 401);
  }

  await registerSuccess(user, { totp_enabled: true, totp_last_step: step });
  clearPendingCookie(cookies);
  setSessionCookie(cookies, { id: user.id, name: user.name, role: user.role });
  await audit(user, "login", {}, ip);
  return json({ ok: true });
}