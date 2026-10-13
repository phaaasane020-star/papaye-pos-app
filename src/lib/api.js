import { readSession } from "./auth.js";

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Returns { user } or { response } (an error response to send straight back)
export function requireUser(cookies, adminOnly = false) {
  const user = readSession(cookies);
  if (!user) return { response: json({ ok: false, error: "Not signed in." }, 401) };
  if (adminOnly && user.role !== "admin") return { response: json({ ok: false, error: "Managers only." }, 403) };
  return { user };
}

export const mapProduct = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: Number(p.price),
  inStock: p.in_stock,
  image: p.image || null,
});

// Pictures must come from our own storage bucket, nowhere else
const IMAGE_PREFIX = () =>
  `${import.meta.env.SUPABASE_URL ?? process.env.SUPABASE_URL}/storage/v1/object/public/product-images/`;

export function validateProduct(body, partial = false) {
  if (!body || typeof body !== "object") return { error: "Bad request." };
  const out = {};

  if (!partial || "name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 80) return { error: "Enter a product name (up to 80 characters)." };
    out.name = name;
  }
  if (!partial || "category" in body) {
    const category = String(body.category ?? "").replace(/\s+/g, " ").trim();
    if (!category || category.length > 30) return { error: "Enter a category (up to 30 characters)." };
    out.category = category;
  }
  if (!partial || "price" in body) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000) return { error: "Enter a valid price." };
    out.price = Math.round(price * 100) / 100;
  }
  if (!partial || "inStock" in body) {
    out.in_stock = Boolean(body.inStock);
  }
  if ("image" in body) {
    if (body.image === null || body.image === "") {
      out.image = null;
    } else if (typeof body.image === "string" && body.image.startsWith(IMAGE_PREFIX()) && body.image.length < 300) {
      out.image = body.image;
    } else {
      return { error: "That picture is not valid." };
    }
  }
  return { value: out };
}
