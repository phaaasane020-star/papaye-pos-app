import { supabase } from "../../../lib/supabase.js";
import { readPending } from "../../../lib/auth.js";
import { newSecret, qrFor } from "../../../lib/totp.js";

export const prerender = false;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// First-time setup: returns the QR code to scan
export async function GET({ cookies }) {
  const pending = readPending(cookies);
  if (!pending) return json({ ok: false, error: "Your sign-in expired. Please start again." }, 401);

  const { data: user, error } = await supabase
    .from("staff")
    .select("id, username, totp_secret, totp_enabled")
    .eq("id", pending.id)
    .maybeSingle();
  if (error || !user) return json({ ok: false, error: "Server error. Please try again." }, 500);
  if (user.totp_enabled) return json({ ok: false, error: "Authenticator is already set up." }, 400);

  let secret = user.totp_secret;
  if (!secret) {
    secret = newSecret();
    const { error: saveError } = await supabase.from("staff").update({ totp_secret: secret }).eq("id", user.id);
    if (saveError) return json({ ok: false, error: "Server error. Please try again." }, 500);
  }

  return json({ ok: true, qr: await qrFor(user.username, secret), secret });
}