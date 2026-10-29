import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE, readSessionValue } from "./session.js";
import { HttpError } from "./errors.js";
import { liveAccount } from "./accounts.js";

export { HttpError, bad, notFound } from "./errors.js";

export const json = (data, status = 200) => Response.json(data, { status });

/** The signed-in account ({ username, name, role }) or null. A valid cookie is also checked against the accounts sheet. */
export async function currentAccount() {
  const session = readSessionValue((await cookies()).get(COOKIE)?.value);
  return session ? liveAccount(session) : null;
}

export async function currentUser() {
  return (await currentAccount())?.name ?? null;
}

/**
 * Wraps a route handler: signed-in accounts only (open: true for sign-in itself), admin: true for admin-only
 * actions, JSON errors, no stack traces to the browser. Handlers get `user` (display name) and `account`.
 */
export function route(handler, { open = false, admin = false } = {}) {
  return async (request, ctx) => {
    try {
      const account = await currentAccount();
      if (!open && !account) throw new HttpError(401, "Sign in to continue.");
      if (admin && account?.role !== "admin") throw new HttpError(403, "Only admins can do that.");
      const params = ctx?.params ? await ctx.params : {};
      const body = ["POST", "PATCH", "PUT"].includes(request.method) ? await request.json().catch(() => ({})) : {};
      return await handler({ request, params, body, user: account?.name ?? null, account, url: new URL(request.url) });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  };
}

/** For machine callers (a scheduler, an Apps Script): `Authorization: Bearer <secret from env>`. */
export function requireBearer(request, envName) {
  const expected = process.env[envName];
  if (!expected || expected.length < 16) throw new HttpError(503, `${envName} is not set on the server (16+ characters).`);
  const given = String(request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) throw new HttpError(401, "Not authorised.");
}
