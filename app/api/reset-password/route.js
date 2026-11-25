import { accountsConfigured, listResettableAccounts, resetAccountPassword, resetEnabled } from "@/lib/accounts";
import { HttpError, json, route } from "@/lib/http";

// The sign-in screen asks whether to show "Reset a password" - a yes/no only, never a name.
export const GET = route(async () => json({ enabled: accountsConfigured() && (await resetEnabled()) }), { open: true });

// POST { action: "list", admin } -> the accounts to pick from; POST { admin, username, password } -> sets it.
// Both need the password of an admin marked with a * in the accounts sheet's Reset column.
export const POST = route(
  async ({ request, body }) => {
    if (!accountsConfigured()) throw new HttpError(403, "Password reset needs the accounts sheet to be connected.");
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    if (body.action === "list") return json({ accounts: await listResettableAccounts(body, { ip }) });
    return json(await resetAccountPassword(body, { ip }));
  },
  { open: true },
);
