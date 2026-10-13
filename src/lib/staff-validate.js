// Checks staff details coming from the Staff page
export function validateStaff(body, partial = false) {
  if (!body || typeof body !== "object") return { error: "Bad request." };
  const out = {};

  if (!partial) {
    const username = String(body.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return { error: "Username must be 3 to 20 letters, numbers or underscores." };
    }
    out.username = username;
  }

  if (!partial || "name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 60) return { error: "Enter the staff member's name." };
    out.name = name;
  }

  if (!partial || "role" in body) {
    if (!["cashier", "admin"].includes(body.role)) return { error: "Choose Cashier or Manager." };
    out.role = body.role;
  }

  if (!partial || "phone" in body) {
    const phone = String(body.phone ?? "").replace(/[\s-]/g, "");
    if (!/^\+?\d{9,15}$/.test(phone)) return { error: "Enter a valid phone number." };
    out.phone = phone;
  }

  if ("active" in body) out.active = Boolean(body.active);

  let pin = null;
  const rawPin = body.pin === undefined || body.pin === null ? "" : String(body.pin).trim();
  if (!partial || rawPin !== "") {
    if (!/^\d{4,6}$/.test(rawPin)) return { error: "PIN must be 4 to 6 digits." };
    pin = rawPin;
  }

  return { value: out, pin };
}

export const STAFF_FIELDS = "id, username, name, role, phone, active, totp_enabled, locked_until";

export const mapStaff = (s) => ({
  id: s.id,
  username: s.username,
  name: s.name,
  role: s.role,
  phone: s.phone,
  active: s.active,
  totpEnabled: s.totp_enabled,
  locked: Boolean(s.locked_until && new Date(s.locked_until) > new Date()),
});