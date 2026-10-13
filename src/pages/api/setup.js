import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { supabase } from "../../lib/supabase.js";
import { rateLimited, getIp } from "../../lib/security.js";
import { audit } from "../../lib/audit.js";

export const prerender = false;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const setupCode = () => import.meta.env.SETUP_CODE ?? process.env.SETUP_CODE;

// Setup is only open while nobody has an account yet
async function isOpen() {
  const { count, error } = await supabase.from("staff").select("id", { count: "exact", head: true });
  if (error) return null;
  return count === 0;
}

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

function weakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return true; // 111111
  const asc = "0123456789012345";
  const desc = "9876543210987654";
  if (asc.includes(pin) || desc.includes(pin)) return true; // 123456, 654321
  if (/^(\d\d)\1+$/.test(pin) || /^(\d\d\d)\1+$/.test(pin)) return true; // 121212, 123123
  return false;
}

export async function GET() {
  const open = await isOpen();
  return json({ ok: true, open: open === true, configured: Boolean(setupCode()) });
}

export async function POST({ request, clientAddress }) {
  const ip = getIp({ request, clientAddress });
  if (rateLimited(`setup:${ip}`, 8, 10 * 60 * 1000)) {
    return json({ ok: false, error: "Too many attempts. Wait a few minutes and try again." }, 429);
  }

  if (!setupCode()) return json({ ok: false, error: "Setup is not enabled on this server." }, 503);

  const open = await isOpen();
  if (open === null) return json({ ok: false, error: "Server error. Please try again." }, 500);
  if (!open) return json({ ok: false, error: "Setup is already done. Please sign in." }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  // Setup code (compared in constant time)
  if (!crypto.timingSafeEqual(sha(body.code ?? ""), sha(setupCode()))) {
    return json({ ok: false, error: "That setup code is not correct." }, 401);
  }

  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const pin = String(body.pin ?? "").trim();

  if (name.length < 2 || name.length > 60) return json({ ok: false, error: "Enter your full name." }, 400);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return json({ ok: false, error: "Username: 3 to 30 letters or numbers (no spaces)." }, 400);
  }
  if (phone && !/^[0-9+ ]{7,20}$/.test(phone)) return json({ ok: false, error: "Enter a valid phone number." }, 400);
  if (!/^\d{6,10}$/.test(pin)) return json({ ok: false, error: "PIN must be 6 to 10 digits." }, 400);
  if (weakPin(pin)) return json({ ok: false, error: "That PIN is too easy to guess. Choose another." }, 400);

  const pin_hash = await bcrypt.hash(pin, 10);
  const { data, error } = await supabase
    .from("staff")
    .insert({ username, name, role: "admin", phone: phone || null, pin_hash, active: true })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") return json({ ok: false, error: "That username is taken." }, 409);
    return json({ ok: false, error: "Could not create the account." }, 500);
  }

  await audit({ id: data.id, name: data.name }, "manager_created", { username }, ip);
  return json({ ok: true });
}