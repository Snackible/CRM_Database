import { cookies } from "next/headers";
import { accountsConfigured, authenticate } from "@/lib/accounts";
import { COOKIE, createSessionValue, sessionCookieOptions, sharedPasswordOk } from "@/lib/session";
import { bad, HttpError, json, route } from "@/lib/http";

// Failed sign-ins wait a moment so guessing passwords is slow.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export const GET = route(async ({ account }) => json({ signedIn: Boolean(account), name: account?.name ?? null, role: account?.role ?? null, mode: accountsConfigured() ? "accounts" : "shared" }), { open: true });

export const POST = route(
  async ({ request, body }) => {
    let account;
    if (accountsConfigured()) {
      const username = String(body.username ?? "").trim();
      if (!username || !body.password) throw bad("Enter your username and password.");
      const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
      try {
        account = await authenticate(username, body.password, ip);
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) await pause(700);
        throw e;
      }
    } else {
      // No accounts sheet configured: a shared team password plus the person's name (local trials).
      const name = String(body.username ?? body.name ?? "").trim().slice(0, 40);
      if (!name) throw bad("Enter your name so notes can say who wrote them.");
      if (!sharedPasswordOk(body.password ?? "")) {
        await pause(700);
        throw new HttpError(401, "That password is not right.");
      }
      account = { username: name.toLowerCase(), name, role: "admin" };
    }
    (await cookies()).set(COOKIE, createSessionValue(account), sessionCookieOptions);
    return json({ signedIn: true, name: account.name, role: account.role });
  },
  { open: true },
);

export const DELETE = route(
  async () => {
    (await cookies()).set(COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return json({ signedIn: false });
  },
  { open: true },
);
