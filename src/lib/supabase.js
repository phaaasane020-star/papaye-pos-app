import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check the .env file in the project root, then restart the dev server."
  );
}

export const supabase = createClient(url, key, { auth: { persistSession: false } });