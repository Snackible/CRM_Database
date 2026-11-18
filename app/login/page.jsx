import LoginForm from "@/components/LoginForm";
import { accountsConfigured, registrationEnabled } from "@/lib/accounts";
import { versionInfo } from "@/lib/version";

export const metadata = { title: "Sign in · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const accounts = accountsConfigured();
  const registered = accounts && (await registrationEnabled());
  // Reset a password is shown whenever the master password itself works (a master-admin row exists),
  // even with nobody currently marked - the page itself then says so and points at the AI team.
  return <LoginForm mode={accounts ? "accounts" : "shared"} canRegister={registered} canReset={registered} version={versionInfo()} />;
}
