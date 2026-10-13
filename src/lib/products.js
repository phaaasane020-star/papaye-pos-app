import { categories } from "../data/menu.js";
import { api } from "./client-api.js";

export { categories };

export const getProducts = () => api("/api/products");
export const createProduct = (product) => api("/api/products", { method: "POST", body: product });
export const updateProduct = (id, changes) => api(`/api/products/${id}`, { method: "PATCH", body: changes });
export const deleteProduct = (id) => api(`/api/products/${id}`, { method: "DELETE" });

// Uploads an already-shrunk picture and returns its public address
export async function uploadImage(blob) {
  const body = new FormData();
  body.append("file", blob, "photo.jpg");

  const res = await fetch("/api/admin/upload", { method: "POST", body });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Your session ended. Please sign in again.");
  }

  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data.url) throw new Error(data.error || "Could not upload the picture.");
  return data.url;
}