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

  const ip = getIp({ request, clientAddress });

  // ---------- A food with several exact prices (sizes or portions) ----------
  if (Array.isArray(body?.variants)) {
    const base = String(body.name ?? "").trim();
    const variants = body.variants;

    if (variants.length < 2 || variants.length > 10) {
      return json({ ok: false, error: "Add between 2 and 10 prices." }, 400);
    }

    const seen = new Set();
    const rows = [];
    for (const v of variants) {
      const label = String(v?.label ?? "").trim();
      if (!label || label.length > 30) return json({ ok: false, error: "Every price needs a short label (like Small)." }, 400);
      const key = label.toLowerCase();
      if (seen.has(key)) return json({ ok: false, error: `The label "${label}" is used twice.` }, 400);
      seen.add(key);

      const { value, error } = validateProduct({
        name: `${base} (${label})`,
        category: body.category,
        price: v?.price,
        inStock: body.inStock,
        ...("image" in body ? { image: body.image } : {}),
      });
      if (error) return json({ ok: false, error }, 400);
      rows.push(value);
    }

    // One insert for all of them: either every version is saved or none
    const { data, error: dbError } = await supabase.from("products").insert(rows).select();
    if (dbError) return json({ ok: false, error: "Could not save the product." }, 500);

    await audit(
      user,
      "product_created",
      { names: data.map((p) => `${p.name} (GH₵ ${Number(p.price).toFixed(2)})`) },
      ip
    );
    return json(data.map(mapProduct), 201);
  }

  // ---------- A normal single-price food ----------
  const { value, error } = validateProduct(body);
  if (error) return json({ ok: false, error }, 400);

  const { data, error: dbError } = await supabase.from("products").insert(value).select().single();
  if (dbError) return json({ ok: false, error: "Could not save the product." }, 500);

  await audit(user, "product_created", { name: data.name, price: Number(data.price) }, ip);
  return json(mapProduct(data), 201);
}