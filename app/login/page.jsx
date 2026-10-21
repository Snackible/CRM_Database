import LoginForm from "@/components/LoginForm";
import { accountsConfigured, registrationEnabled } from "@/lib/accounts";

export const metadata = { title: "Sign in · Snackible CRM" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const accounts = accountsConfigured();
  return <LoginForm mode={accounts ? "accounts" : "shared"} canRegister={accounts && (await registrationEnabled())} />;
}
