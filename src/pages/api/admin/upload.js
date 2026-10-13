import crypto from "node:crypto";
import { supabase } from "../../../lib/supabase.js";
import { json, requireUser } from "../../../lib/api.js";

export const prerender = false;

const MAX_BYTES = 1.5 * 1024 * 1024;

// Check the real file type from its first bytes, not from what the browser claims
function detect(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function POST({ request, cookies }) {
  const auth = requireUser(cookies, true);
  if (auth.response) return auth.response;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return json({ ok: false, error: "Choose a picture." }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: "Picture is too big. Try a smaller one." }, 413);

  const buf = Buffer.from(await file.arrayBuffer());
  const type = detect(buf);
  if (!type) return json({ ok: false, error: "Use a JPG, PNG or WebP picture." }, 400);

  const path = `${crypto.randomUUID()}.${type === "jpeg" ? "jpg" : type}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, buf, { contentType: `image/${type}`, cacheControl: "31536000", upsert: false });

  if (error) return json({ ok: false, error: "Could not save the picture. Please try again." }, 500);

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return json({ ok: true, url: data.publicUrl });
}