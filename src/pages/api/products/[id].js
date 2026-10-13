import { supabase } from "../../../lib/supabase.js";
import { json, requireUser, mapProduct, validateProduct } from "../../../lib/api.js";
import { audit } from "../../../lib/audit.js";
import { getIp } from "../../../lib/security.js";
import { removeImage } from "../../../lib/images.js";

export const prerender = false;

// Several versions of one food can share a photo, so only delete the file when nobody else uses it
async function imageInUse(url, excludeId) {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("image", url)
    .neq("id", excludeId);
  return (count || 0) > 0;
}

export async function PATCH({ params, request, cookies, clientAddress }) {
  const { user, response } = requireUser(cookies, true);
  if (response) return response;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "Bad product id." }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const { value, error } = validateProduct(body, true);
  if (error) return json({ ok: false, error }, 400);
  if (Object.keys(value).length === 0) return json({ ok: false, error: "Nothing to update." }, 400);

  // What it looked like before, for the activity log
  const { data: before } = await supabase.from("products").select("*").eq("id", id).maybeSingle();

  const { data, error: dbError } = await supabase.from("products").update(value).eq("id", id).select().maybeSingle();
  if (dbError) return json({ ok: false, error: "Could not update the product." }, 500);
  if (!data) return json({ ok: false, error: "Product not found." }, 404);

  // Record what changed
  const changes = {};
  if (before) {
    if ("name" in value && value.name !== before.name) changes.name = [before.name, value.name];
    if ("category" in value && value.category !== before.category) changes.category = [before.category, value.category];
    if ("price" in value && Number(value.price) !== Number(before.price)) changes.price = [Number(before.price), Number(value.price)];
    if ("in_stock" in value && value.in_stock !== before.in_stock) changes.in_stock = [before.in_stock, value.in_stock];
    if ("image" in value && value.image !== before.image) changes.photo = value.image ? "changed" : "removed";
  }
  if (Object.keys(changes).length) {
    const onlyStock = Object.keys(changes).length === 1 && "in_stock" in changes;
    await audit(
      user,
      onlyStock ? (value.in_stock ? "product_back_in_stock" : "product_out_of_stock") : "product_updated",
      { name: data.name, ...(onlyStock ? {} : { changes }) },
      getIp({ request, clientAddress })
    );
  }

  // The old picture is no longer used by this product
  if (before?.image && "image" in value && value.image !== before.image) {
    if (!(await imageInUse(before.image, id))) await removeImage(before.image);
  }

  return json(mapProduct(data));
}

export async function DELETE({ params, request, cookies, clientAddress }) {
  const { user, response } = requireUser(cookies, true);
  if (response) return response;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, error: "Bad product id." }, 400);

  const { data: before } = await supabase.from("products").select("name, price, image").eq("id", id).maybeSingle();

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return json({ ok: false, error: "Could not delete the product." }, 500);

  if (before) {
    await audit(user, "product_deleted", { name: before.name, price: Number(before.price) }, getIp({ request, clientAddress }));
    if (before.image && !(await imageInUse(before.image, id))) await removeImage(before.image);
  }
  return json({ ok: true });
}