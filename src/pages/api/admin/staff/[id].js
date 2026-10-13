import bcrypt from "bcryptjs";
import { supabase } from "../../../../lib/supabase.js";
import { json, requireUser } from "../../../../lib/api.js";
import { validateStaff, STAFF_FIELDS, mapStaff } from "../../../../lib/staff-validate.js";

export const prerender = false;

export async function PATCH({ params, request, cookies }) {
  const { user: me, response } = requireUser(cookies, true);
  if (response) return response;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "Bad staff id." }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const { value, pin, error } = validateStaff(body, true);
  if (error) return json({ ok: false, error }, 400);

  const changes = { ...value };

  // Stop managers locking themselves out
  if (id === me.id) {
    if ("active" in value && !value.active) {
      return json({ ok: false, error: "You can't deactivate your own account." }, 400);
    }
    if ("role" in value && value.role !== "admin") {
      return json({ ok: false, error: "You can't remove your own manager access." }, 400);
    }
  }

  if (pin) {
    changes.pin_hash = await bcrypt.hash(pin, 10);
    changes.failed_attempts = 0;
    changes.locked_until = null;
  }
  if (body.resetAuthenticator === true) {
    Object.assign(changes, { totp_secret: null, totp_enabled: false, totp_last_step: 0 });
  }
  if (body.unlock === true) {
    Object.assign(changes, { failed_attempts: 0, locked_until: null });
  }

  if (Object.keys(changes).length === 0) return json({ ok: false, error: "Nothing to update." }, 400);

  const { data, error: dbError } = await supabase
    .from("staff")
    .update(changes)
    .eq("id", id)
    .select(STAFF_FIELDS)
    .maybeSingle();

  if (dbError) return json({ ok: false, error: "Could not update the staff member." }, 500);
  if (!data) return json({ ok: false, error: "Staff member not found." }, 404);
  return json(mapStaff(data));
}