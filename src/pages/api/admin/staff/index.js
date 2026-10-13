import bcrypt from "bcryptjs";
import { supabase } from "../../../../lib/supabase.js";
import { json, requireUser } from "../../../../lib/api.js";
import { validateStaff, STAFF_FIELDS, mapStaff } from "../../../../lib/staff-validate.js";
import { audit } from "../../../../lib/audit.js";
import { getIp } from "../../../../lib/security.js";

export const prerender = false;

export async function GET({ cookies }) {
  const { response } = requireUser(cookies, true);
  if (response) return response;

  const { data, error } = await supabase.from("staff").select(STAFF_FIELDS).order("id", { ascending: true });
  if (error) {
    console.error("[staff] list failed:", error.code, error.message);
    return json({ ok: false, error: "Could not load the staff list." }, 500);
  }
  return json((data || []).map(mapStaff));
}

export async function POST(ctx) {
  const { request, cookies } = ctx;
  const { user: me, response } = requireUser(cookies, true);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const { value, pin, error } = validateStaff(body, false);
  if (error) return json({ ok: false, error }, 400);
  if (!pin) return json({ ok: false, error: "Enter a PIN." }, 400);

  try {
    const pin_hash = await bcrypt.hash(pin, 10);
    const { data, error: dbError } = await supabase
      .from("staff")
      .insert({ ...value, pin_hash, active: true })
      .select(STAFF_FIELDS)
      .single();

    if (dbError || !data) {
      console.error("[staff] insert failed:", dbError?.code, dbError?.message, dbError?.details);
      if (dbError?.code === "23505") return json({ ok: false, error: "That username is taken." }, 409);
      return json({ ok: false, error: `Could not add the staff member. (${dbError?.message || "no details"})` }, 500);
    }

    await audit(me, "staff_created", `Added ${value.role === "admin" ? "manager" : "cashier"} "${value.username}"`, getIp(ctx));
    return json(mapStaff(data), 201);
  } catch (e) {
    console.error("[staff] crashed:", e);
    return json({ ok: false, error: `Could not add the staff member. (${e?.message || e})` }, 500);
  }
}
