import { clearSessionCookie } from "../../lib/auth.js";

export const prerender = false;

export async function POST({ cookies }) {
  clearSessionCookie(cookies);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}