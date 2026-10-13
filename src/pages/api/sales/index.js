import { supabase } from "../../../lib/supabase.js";
import { json, requireUser } from "../../../lib/api.js";

export const prerender = false;

const receiptNo = (id) => "PF-" + String(id).padStart(5, "0");
const round2 = (n) => Math.round(n * 100) / 100;

function toSale(row) {
  return {
    id: receiptNo(row.id),
    time: row.created_at,
    cashier: row.cashier_name,
    cashierId: row.cashier_id,
    method: row.method,
    total: Number(row.total),
    tendered: Number(row.tendered),
    change: Number(row.change_given),
    items: (row.sale_items || []).map((i) => ({
      name: i.name,
      price: Number(i.price),
      qty: i.qty,
      custom: i.is_custom,
      basePrice: i.base_price == null ? null : Number(i.base_price),
    })),
  };
}

// List sales. Managers see everyone's, cashiers see their own.
export async function GET({ request, cookies }) {
  const { user, response } = requireUser(cookies);
  if (response) return response;

  const range = new URL(request.url).searchParams.get("range") === "all" ? "all" : "today";

  let query = supabase
    .from("sales")
    .select("id, created_at, cashier_id, cashier_name, method, total, tendered, change_given, sale_items(name, price, qty, is_custom, base_price)")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (range === "today") {
    // Ghana is on GMT (UTC+0) all year, so a UTC day is a Ghana day.
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    query = query.gte("created_at", start.toISOString());
  }
  if (user.role !== "admin") query = query.eq("cashier_id", user.id);

  const { data, error } = await query;
  if (error) return json({ ok: false, error: "Could not load sales." }, 500);
  return json(data.map(toSale));
}

// Record a sale. Prices and totals are worked out here, not trusted from the browser.
export async function POST({ request, cookies }) {
  const { user, response } = requireUser(cookies);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const method = body.method;
  if (!["cash", "momo"].includes(method)) return json({ ok: false, error: "Choose Cash or MoMo." }, 400);

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0 || items.length > 60) return json({ ok: false, error: "The order is empty." }, 400);

  // Look up every listed product (and the list price behind custom items)
  const ids = [
    ...new Set(items.map((i) => Number(i.productId)).filter((n) => Number.isInteger(n) && n > 0)),
  ];
  const byId = new Map();
  if (ids.length) {
    const { data, error } = await supabase.from("products").select("id, name, price, in_stock").in("id", ids);
    if (error) return json({ ok: false, error: "Could not check prices." }, 500);
    for (const p of data) byId.set(p.id, p);
  }

  const lines = [];
  for (const i of items) {
    const qty = Number(i.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return json({ ok: false, error: "Invalid quantity." }, 400);

    if (i.custom) {
      const name = String(i.name || "").trim().slice(0, 80);
      const price = Number(i.price);
      if (!name || !Number.isFinite(price) || price < 0 || price > 100000) {
        return json({ ok: false, error: "Invalid custom item." }, 400);
      }
      const base = i.productId ? byId.get(Number(i.productId)) : null;
      lines.push({ name, price: round2(price), qty, is_custom: true, base_price: base ? Number(base.price) : null });
    } else {
      const p = byId.get(Number(i.productId));
      if (!p) return json({ ok: false, error: "An item on this order no longer exists. Refresh and try again." }, 400);
      if (!p.in_stock) return json({ ok: false, error: `${p.name} is out of stock.` }, 400);
      lines.push({ name: p.name, price: Number(p.price), qty, is_custom: false, base_price: null });
    }
  }

  const totalCents = lines.reduce((sum, l) => sum + Math.round(l.price * 100) * l.qty, 0);
  const total = totalCents / 100;

  let tendered = total;
  let change = 0;
  if (method === "cash") {
    const given = Number(body.tendered);
    if (!Number.isFinite(given) || Math.round(given * 100) < totalCents) {
      return json({ ok: false, error: "Cash received is less than the total." }, 400);
    }
    tendered = round2(given);
    change = (Math.round(given * 100) - totalCents) / 100;
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      cashier_id: user.id,
      cashier_name: user.name,
      method,
      total,
      tendered,
      change_given: change,
    })
    .select()
    .single();
  if (saleError) return json({ ok: false, error: "Could not save the sale." }, 500);

  const { error: itemsError } = await supabase
    .from("sale_items")
    .insert(lines.map((l) => ({ ...l, sale_id: sale.id })));
  if (itemsError) {
    await supabase.from("sales").delete().eq("id", sale.id); // undo the half-saved sale
    return json({ ok: false, error: "Could not save the sale items." }, 500);
  }

  return json(
    {
      ok: true,
      sale: {
        id: receiptNo(sale.id),
        time: sale.created_at,
        cashier: user.name,
        cashierId: user.id,
        method,
        total,
        tendered,
        change,
        items: lines.map((l) => ({
          name: l.name,
          price: l.price,
          qty: l.qty,
          custom: l.is_custom,
          basePrice: l.base_price,
        })),
      },
    },
    201
  );
}