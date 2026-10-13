import { defineMiddleware } from "astro:middleware";
import { readSession, setSessionCookie, clearSessionCookie } from "./lib/auth.js";
import { supabase } from "./lib/supabase.js";

// Reachable before a full sign-in
const PUBLIC_PATHS = ["/login", "/api/login", "/api/2fa/setup", "/api/2fa/verify", "/setup", "/api/setup"];

// Manager-only areas
const ADMIN_PATHS = ["/products", "/staff", "/audit", "/api/admin"];

// Anyone signed in may READ these, but only a manager may change them
const ADMIN_WRITE_PATHS = ["/api/products"];

// ---------- Is this person still allowed in? (checked against the database) ----------
const FRESH_MS = 15000;
const freshCache = new Map();

// Returns the staff row, null (deactivated or deleted), or undefined (could not check)
async function freshStaff(id) {
  const hit = freshCache.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.row;

  const { data, error } = await supabase.from("staff").select("id, name, role, active").eq("id", id).maybeSingle();
  if (error) return undefined; // network blip: fall back to the signed cookie

  const row = data && data.active ? data : null;
  freshCache.set(id, { at: Date.now(), row });
  if (freshCache.size > 500) freshCache.clear();
  return row;
}

// ---------- Security headers ----------
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self'",
  "frame-src 'self' about:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function secure(response, isPrivate = true) {
  try {
    const h = response.headers;
    h.set("X-Frame-Options", "DENY");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    if (import.meta.env.PROD) {
      h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      h.set("Content-Security-Policy", CSP);
    }
    if (isPrivate && !h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  } catch {
    // some redirect responses have locked headers; that's fine
  }
  return response;
}

const deny = (status, error) =>
  new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const { request } = context;
  const method = request.method;

  // Static files (css, js, images, fonts)
  if (/\.[a-z0-9]+$/i.test(pathname)) return secure(await next(), false);

  // Block requests that change data when they come from another website
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    let bad = false;
    if (origin) {
      try {
        const oh = new URL(origin).host;
        const allowed = [context.url.host, request.headers.get("x-forwarded-host"), request.headers.get("host")];
        bad = !allowed.includes(oh);
      } catch {
        bad = true;
      }
    } else if (site && site !== "same-origin" && site !== "none") {
      bad = true;
    }
    if (bad) return secure(deny(403, "Request blocked."));
  }

  // Who is this, right now?
  let user = readSession(context.cookies);
  if (user) {
    const fresh = await freshStaff(user.id);
    if (fresh === null) {
      clearSessionCookie(context.cookies); // deactivated or deleted: out immediately
      user = null;
    } else if (fresh && (fresh.role !== user.role || fresh.name !== user.name)) {
      user = { id: user.id, name: fresh.name, role: fresh.role }; // role changed: use the new one
      setSessionCookie(context.cookies, user);
    }
  }
  context.locals.user = user;

  if (PUBLIC_PATHS.includes(pathname)) {
    if (user && pathname === "/login") return secure(context.redirect("/"));
    return secure(await next());
  }

  if (!user) {
    if (pathname.startsWith("/api/")) return secure(deny(401, "Not signed in."));
    return secure(context.redirect("/login"));
  }

  const isAdminArea = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  const isAdminWrite = ADMIN_WRITE_PATHS.some((p) => pathname.startsWith(p)) && method !== "GET" && method !== "HEAD";

  if ((isAdminArea || isAdminWrite) && user.role !== "admin") {
    if (pathname.startsWith("/api/")) return secure(deny(403, "Managers only."));
    return secure(context.redirect("/"));
  }

  return secure(await next());
});