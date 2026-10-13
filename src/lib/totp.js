import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const ISSUER = "Papaye Fast Food";

export function newSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totpFor(label, secretBase32) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

// QR code image (data URL) that the authenticator app scans
export function qrFor(username, secretBase32) {
  return QRCode.toDataURL(totpFor(username, secretBase32).toString(), { margin: 1, width: 240 });
}

// Returns the 30-second step number if the code is valid (allowing 1 step of clock drift), else null
export function checkCode(secretBase32, code) {
  const delta = totpFor("check", secretBase32).validate({ token: String(code).replace(/\s/g, ""), window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / 30) + delta;
}