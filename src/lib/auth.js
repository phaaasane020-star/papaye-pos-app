import crypto from "node:crypto";

const SESSION_COOKIE = "papaye_session";
const PENDING_COOKIE = "papaye_pending";
const SESSION_TTL = 60 * 60 * 10; // 10 hours (one shift)
const PENDING_TTL = 60 * 5; // 5 minutes to finish the code step

function secret() {
  const dedicated = import.meta.env.SESSION_SECRET ?? process.env.SESSION_SECRET;
  if (dedicated) return dedicated;

  // Live site: refuse to run without its own secret
  if (import.meta.env.PROD) throw new Error("SESSION_SECRET is not set on the server.");

  // Local development only
  const fallback = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("No session secret configured.");
  return fallback;
}

const b64 = (value) => Buffer.from(value).toString("base64url");
const hmac = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

function sign(data, ttlSeconds) {
  const payload = b64(JSON.stringify({ ...data, exp: Date.now() + ttlSeconds * 1000 }));
  return `${payload}.${hmac(payload)}`;
}

function verify(token, kind) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.k !== kind) return null;
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// HttpOnly: scripts can't read it. Secure: HTTPS only (live site).
// SameSite=Lax + the same-origin check in the middleware stops other websites acting for a logged-in cashier.
const cookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: import.meta.env.PROD,
  path: "/",
  maxAge,
});

// ----- Full session (signed in) -----
export function setSessionCookie(cookies, user) {
  const token = sign({ k: "session", id: user.id, name: user.name, role: user.role }, SESSION_TTL);
  cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL));
}

export function readSession(cookies) {
  const d = verify(cookies.get(SESSION_COOKIE)?.value, "session");
  return d ? { id: d.id, name: d.name, role: d.role } : null;
}

export function clearSessionCookie(cookies) {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

// ----- Pending (PIN correct, authenticator code still needed) -----
export function setPendingCookie(cookies, user) {
  cookies.set(PENDING_COOKIE, sign({ k: "pending", id: user.id }, PENDING_TTL), cookieOptions(PENDING_TTL));
}

export function readPending(cookies) {
  const d = verify(cookies.get(PENDING_COOKIE)?.value, "pending");
  return d ? { id: d.id } : null;
}

export function clearPendingCookie(cookies) {
  cookies.delete(PENDING_COOKIE, { path: "/" });
}