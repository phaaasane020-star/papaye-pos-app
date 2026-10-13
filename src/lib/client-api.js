// Small wrapper around fetch for our own API routes
export async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Not signed in.");
  }
  if (!res.ok) throw new Error((data && data.error) || "Something went wrong. Please try again.");
  return data;
}