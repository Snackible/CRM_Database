import { accountsConfigured, registerAccount, registrationEnabled } from "@/lib/accounts";
import { HttpError, json, route } from "@/lib/http";

// The sign-in screen asks whether to show "Register a new user".
export const GET = route(async () => json({ enabled: accountsConfigured() && (await registrationEnabled()) }), { open: true });

export const POST = route(
  async ({ request, body }) => {
    if (!accountsConfigured()) throw new HttpError(403, "Registration needs the accounts sheet to be connected.");
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    return json(await registerAccount(body, { ip }), 201);
  },
  { open: true },
);
