import { accountsConfigured, getResetRequests, registrationEnabled, resetAccountPassword } from "@/lib/accounts";
import { HttpError, json, route } from "@/lib/http";

// The sign-in screen asks whether to show "Reset a password", and who it's for.
export const GET = route(
  async () => {
    const enabled = accountsConfigured() && (await registrationEnabled());
    return json({ enabled, requests: enabled ? await getResetRequests() : [] });
  },
  { open: true },
);

export const POST = route(
  async ({ request, body }) => {
    if (!accountsConfigured()) throw new HttpError(403, "Password reset needs the accounts sheet to be connected.");
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    return json(await resetAccountPassword(body, { ip }));
  },
  { open: true },
);
