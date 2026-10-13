import { supabase } from "./supabase.js";

const MARKER = "/storage/v1/object/public/product-images/";

// Deletes a food picture from storage (used when a photo is replaced or a food is deleted)
export async function removeImage(url) {
  try {
    if (!url || typeof url !== "string") return;
    const i = url.indexOf(MARKER);
    if (i === -1) return;
    const path = url.slice(i + MARKER.length);
    if (!path || path.includes("/") || path.includes("..")) return;
    await supabase.storage.from("product-images").remove([path]);
  } catch {
    // a leftover picture is harmless
  }
}