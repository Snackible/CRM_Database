import LoginForm from "@/components/LoginForm";
import { accountsConfigured, registrationEnabled, resetEnabled } from "@/lib/accounts";
import { versionInfo } from "@/lib/version";

export const metadata = { title: "Sign in · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const accounts = accountsConfigured();
  const registered = accounts && (await registrationEnabled());
  // Reset a password is shown whenever an admin is marked with a * in the accounts sheet's Reset column:
  // that admin's password is what authorises a reset.
  const canReset = accounts && (await resetEnabled());
  return <LoginForm mode={accounts ? "accounts" : "shared"} canRegister={registered} canReset={canReset} version={versionInfo()} />;
}
