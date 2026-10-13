import { supabase } from "../../../lib/supabase.js";
import { json, requireUser, mapProduct, validateProduct } from "../../../lib/api.js";
import { audit } from "../../../lib/audit.js";
import { getIp } from "../../../lib/security.js";

export const prerender = false;

export async function GET({ cookies }) {
  const { response } = requireUser(cookies);
  if (response) return response;

  const { data, error } = await supabase.from("products").select("*").order("id");
  if (error) return json({ ok: false, error: "Could not load products." }, 500);
  return json(data.map(mapProduct));
}

export async function POST({ request, cookies, clientAddress }) {
  const { user, response } = requireUser(cookies, true);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const { value, error } = validateProduct(body);
  if (error) return json({ ok: false, error }, 400);

  const { data, error: dbError } = await supabase.from("products").insert(value).select().single();
  if (dbError) return json({ ok: false, error: "Could not save the product." }, 500);

  await audit(user, "product_created", { name: data.name, price: Number(data.price) }, getIp({ request, clientAddress }));
  return json(mapProduct(data), 201);
}