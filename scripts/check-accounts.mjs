// Checks the accounts sheet is reachable and shaped the way sign-in expects. Prints the tab, the columns, how many
// accounts can sign in and who, and never prints a password.
// Run: npm run check-accounts
import { normalizeAccounts } from "../lib/accounts.js";
import { readSheet, tabTitleForGid } from "../lib/sheets.js";

const id = process.env.ACCOUNTS_SHEET_ID;
if (!id) {
  console.log("ACCOUNTS_SHEET_ID is not set in .env.local.");
  process.exit(1);
}
try {
  const tab = await tabTitleForGid(id, process.env.ACCOUNTS_GID ?? "0");
  const { headers, rows } = await readSheet({ sheetId: id, tab });
  const accounts = normalizeAccounts(rows);
  console.log(`Tab: ${tab}`);
  console.log(`Columns: ${headers.join(" | ")}`);
  console.log(`Rows with a username: ${accounts.length}`);
  const roles = {};
  accounts.forEach((a) => (roles[a.rawRole || "(blank)"] = (roles[a.rawRole || "(blank)"] ?? 0) + 1));
  console.log(`Roles: ${JSON.stringify(roles)}`);
  const can = accounts.filter((a) => a.password && a.role);
  console.log(`Can sign in to the CRM: ${can.length} (${can.map((a) => `${a.username} [${a.role}]`).join(", ")})`);
  const noPassword = accounts.filter((a) => !a.password).map((a) => a.username);
  if (noPassword.length) console.log(`No password, cannot sign in: ${noPassword.join(", ")}`);
  console.log(`Master admin (enables Register a new user): ${accounts.some((a) => a.master && a.password) ? "yes" : "NO, add a row with role master-admin"}`);
  for (const f of ["username", "password", "role", "display_name"]) {
    if (!headers.some((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").includes(f.split("_")[0]))) console.log(`Warning: no "${f}" column found.`);
  }
} catch (e) {
  console.log(`Could not read the sheet: ${e.message}`);
  process.exit(1);
}
