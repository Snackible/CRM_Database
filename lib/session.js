// Stateless signed-cookie session. It carries who signed in (username, display name, role) so notes and facts
// can say who wrote them and admin-only actions can be checked. Nothing is stored server-side.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "crm_session";
const TTL_SECONDS = 12 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set (16+ random characters).");
  return s;
}

const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");
const digest = (v) => createHash("sha256").update(String(v)).digest();

export const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

/** Shared team password: only used when no accounts sheet is configured (local trials). */
export function sharedPasswordOk(input) {
  const expected = process.env.PORTAL_PASSWORD;
  if (!expected) throw new Error("PORTAL_PASSWORD is not set.");
  return safeEqual(input, expected);
}

export function createSessionValue({ username, name, role }) {
  const payload = Buffer.from(JSON.stringify({ u: username, n: name, r: role, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: TTL_SECONDS,
  secure: process.env.NODE_ENV === "production",
};

/** Returns { username, name, role } for a valid cookie, or null. */
export function readSessionValue(raw) {
  if (!raw) return null;
  const [payload, sig] = String(raw).split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!(d.exp > Date.now() / 1000) || !d.n) return null;
    return { username: String(d.u ?? d.n), name: String(d.n), role: d.r === "admin" ? "admin" : "b2b" };
  } catch {
    return null;
  }
}
