# Snackible CRM

Everything Snackible knows about each B2B client, plus their purchase history. Next.js (App Router) on Vercel, Postgres on Neon.
Design: [DESIGN.md](DESIGN.md). Product: [PRODUCT.md](PRODUCT.md). Plan: [PLAN.md](PLAN.md).

## Run it locally

```bash
npm install
npm run seed     # optional: loads invented sample clients (flagged, removable from Imports & backup)
npm run dev      # http://localhost:3000
npm test         # services and sign-in, against an in-memory Postgres (PGlite)
npm run test:pg  # the same service tests through the real pg driver (what Vercel uses with Neon)
npm run backup   # saves every table from the database in use (Neon when DATABASE_URL is set) to backups/
```

To move data from the local database into an empty Neon database, stop the app and run `npm run copy-to-postgres` with `TARGET_DATABASE_URL` set. It keeps ids, checks every table and leaves the local copy untouched.

`.env.local` (git-ignored; copy `.env.example`) holds the settings. With `DATABASE_URL` empty the app keeps its data in `.data/` using PGlite, a real Postgres in WASM, so no account is needed locally.

## Sign-in accounts come from a Google Sheet

Set `ACCOUNTS_SHEET_ID` and `ACCOUNTS_GID` (from the sheet link: `/d/<id>/edit#gid=<gid>`) plus the service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`).
Share the sheet with the service account address as **Editor**.

Columns (same as the Delivery Tracker users sheet): `username | password | role | account_id | display_name | Email | Contact`.

| Role | Signs in to the CRM | Can do |
|---|---|---|
| `b2b` | yes | everything except the admin actions below |
| `admin`, `master-admin` | yes | also: delete a client, undo an import, download the backup, remove sample data, manage Google Sheet order feeds |
| `ops`, blank | no | contacts only |

A row with no username or password can never sign in. Check the sheet is readable and shaped right (prints no passwords):

```bash
npm run check-accounts
```

**Register a new user** (link on the sign-in page): anyone who knows the master password (the password of the `master-admin` row) can add a BD or Ops account; the row is appended to the sheet. Admins are added in the sheet by hand. With no `master-admin` row, registration is off. Failed guesses are rate limited.

Known limit: passwords in the sheet are plain text, as in the Delivery Tracker. A hashed column is the sensible next step. Sessions last 12 hours and are not revoked if a row is removed before then.

With `ACCOUNTS_SHEET_ID` empty (local trials only) the app falls back to one shared `PORTAL_PASSWORD` plus a name.

## Google Sheet feeds (connect as many as you like)

Admins connect sheets under **Add, Purchase CSV or sheet**. Share each sheet with the service account as **Viewer**: feeds only read. There are two kinds:

- **Customer orders:** each row is a purchase. It uses the same column mapping, buyer matching, unmatched queue, undo and duplicate protection as a CSV.
- **Leads and contacts:** each company becomes a lead (a client with no orders yet, shown with a Lead status), its people become contacts, and remarks and follow-ups become notes. Reading the sheet again adds only new or changed rows. Undo removes the leads that import created.

Sheets worth connecting today: `New B2B 2026` (tab `2026`, orders with order value), `Pending delivery` (tab `Sales`, orders with gross sales and the customer's contact person), `BD Ops Sales Tracking Sheet` (tab `Sheet1`, orders without amounts) and `CCBD Tracker` (tabs such as `Follow up` and `Diwali CCBD`, leads).

- **Pull:** "Read again" on a connected sheet, or a scheduled job calling `GET /api/sheets/sync-all` with `Authorization: Bearer $CRON_SECRET`.
- **Push:** an Apps Script in the sheet can `POST /api/ingest` with `Authorization: Bearer $INGEST_SECRET` and `{ "sourceId": 1, "rows": [{ "Column header": "value" }] }`.
- The accounts sheet itself can never be used as an order feed.

## Connect the real database (Neon) and deploy

1. **Create the database.** Sign up at neon.com (free, no card), create a project, and copy the connection string (the pooled one, starting with `postgresql://`).
2. **Try it locally against Neon.** Put `DATABASE_URL=<that string>` in `.env.local` and run `npm run dev`. The tables are created on the first request. Sign in, add a client, and it appears in Neon's Tables view. Data in the local `.data/` folder is not copied across; `npm run seed` loads the invented sample clients if you want them.
3. **Deploy.** In Vercel, import the GitHub repo `Snackible/CRM_Database` (Vercel needs access to the Snackible organisation). Add the Neon integration from the Vercel Marketplace, which sets `DATABASE_URL` for you, or paste it by hand.
4. **Set the other environment variables** in Vercel (Project, Settings, Environment Variables). The quickest way: keep a git-ignored `.env.vercel` with the production values and use **Import .env** on that page. Otherwise add them one by one: `SESSION_SECRET`, `ACCOUNTS_SHEET_ID`, `ACCOUNTS_GID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (paste the key as it is in `.env.local`, with the `\n` escapes, or with real newlines), and optionally `CRON_SECRET` and `INGEST_SECRET`. Leave `PORTAL_PASSWORD` unset.
5. **Share the accounts sheet** with the service account address as Editor, then redeploy.
6. **Check it.** Open the deployed URL, sign in with a sheet account, add a note, and reload.

Free database plans keep little backup history, so use **Imports and backup, Download everything** now and then.
