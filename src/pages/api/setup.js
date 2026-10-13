import bcrypt from "bcryptjs";
import { supabase } from "../../lib/supabase.js";
import { audit } from "../../lib/audit.js";
import { setPendingCookie } from "../../lib/auth.js";
import { rateLimited, getIp } from "../../lib/security.js";

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const WEAK = new Set(["000000","111111","222222","333333","444444","555555","666666","777777","888888","999999","123456","654321","123123","121212","112233","123321","000111","012345","234567","345678","456789"]);

function weakPin(pin) {
  if (WEAK.has(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  let up = true, down = true;
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) !== Number(pin[i - 1]) + 1) up = false;
    if (Number(pin[i]) !== Number(pin[i - 1]) - 1) down = false;
  }
  return up || down;
}

async function isOpen() {
  const { count, error } = await supabase.from("staff").select("id", { count: "exact", head: true });
  if (error) {
    console.error("[setup] count failed:", error.message);
    return { open: false };
  }
  return { open: (count || 0) === 0 };
}

export async function GET() {
  const configured = true;
  const { open } = await isOpen();
  return json({ ok: true, open, configured });
}

async function handle(ctx) {
  const { request, cookies } = ctx;
  const ip = getIp(ctx);
  if (rateLimited(`setup:${ip}`, 8, 10 * 60 * 1000)) {
    return json({ ok: false, error: "Too many attempts. Please wait a few minutes." }, 429);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }

  const { open } = await isOpen();
  if (!open) return json({ ok: false, error: "Setup is already complete." }, 403);

  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const pin = String(body.pin || "");

  if (name.length < 2 || name.length > 60) return json({ ok: false, error: "Enter the full name (2 to 60 characters)." }, 400);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ ok: false, error: "Username: 3 to 30 letters, numbers, dot, dash or underscore." }, 400);
  if (phone && !/^[0-9+\s-]{7,20}$/.test(phone)) return json({ ok: false, error: "Enter a valid phone number." }, 400);
  if (!/^\d{6,10}$/.test(pin)) return json({ ok: false, error: "PIN must be 6 to 10 digits." }, 400);
  if (weakPin(pin)) return json({ ok: false, error: "That PIN is too easy to guess. Choose another." }, 400);

  const pin_hash = await bcrypt.hash(pin, 10);

  const { data, error } = await supabase
    .from("staff")
    .insert({ username, name, role: "admin", phone: phone || "", pin_hash, active: true })
    .select("id, name")
    .single();

  if (error || !data) {
    console.error("[setup] insert failed:", error?.code, error?.message, error?.details, error?.hint);
    if (error?.code === "23505") return json({ ok: false, error: "That username is taken." }, 409);
    return json({ ok: false, error: `Could not create the account. (${error?.code || ""} ${error?.message || "no details"})`.trim() }, 500);
  }

  await audit({ id: data.id, name: data.name }, "manager_created", `Manager account "${username}" created`, ip);
  setPendingCookie(cookies, { id: data.id });
  return json({ ok: true, next: "setup" });
}

export async function POST(ctx) {
  try {
    return await handle(ctx);
  } catch (e) {
    console.error("[setup] crashed:", e);
    return json({ ok: false, error: `Setup failed: ${e?.message || e}` }, 500);
  }
}
