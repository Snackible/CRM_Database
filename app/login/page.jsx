import LoginForm from "@/components/LoginForm";
import { accountsConfigured, getResetRequests, registrationEnabled } from "@/lib/accounts";
import { versionInfo } from "@/lib/version";

export const metadata = { title: "Sign in · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const accounts = accountsConfigured();
  const registered = accounts && (await registrationEnabled());
  return (
    <LoginForm
      mode={accounts ? "accounts" : "shared"}
      canRegister={registered}
      canReset={registered && (await getResetRequests()).length > 0}
      version={versionInfo()}
    />
  );
}
