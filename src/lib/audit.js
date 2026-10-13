import { supabase } from "./supabase.js";

// Writes one line to the activity log. Never breaks the action that called it.
export async function audit(actor, action, detail = {}, ip = null) {
  try {
    await supabase.from("audit_log").insert({
      staff_id: actor?.id != null ? String(actor.id) : null,
      staff_name: actor?.name ?? null,
      action,
      detail,
      ip,
    });
  } catch {
    // logging must never block a sale or a login
  }
}