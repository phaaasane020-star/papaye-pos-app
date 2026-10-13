// The server puts the signed-in user on the page; this just reads it.
export function getSession() {
  return window.__USER__ || null;
}

export async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {}
  location.href = "/login";
}