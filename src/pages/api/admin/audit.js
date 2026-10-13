import { supabase } from "../../../lib/supabase.js";
import { json, requireUser } from "../../../lib/api.js";

export const prerender = false;

export async function GET({ cookies }) {
  const auth = requireUser(cookies, true);
  if (auth.response) return auth.response;

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, staff_name, action, detail, ip")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return json({ ok: false, error: "Could not load the activity log." }, 500);
  return json({ ok: true, entries: data });
}