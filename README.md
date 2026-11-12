# Snackible CRM

Everything Snackible knows about each B2B client, plus their purchase history. Next.js (App Router) on Vercel, Postgres on Neon.
Design: [DESIGN.md](DESIGN.md). Product: [PRODUCT.md](PRODUCT.md). Plan: [PLAN.md](PLAN.md).

The running release (`version` in `package.json` plus the git commit, e.g. `v0.2.0 · 861b0d3`) shows on the sign-in page, the sidebar and the phone header — bump `version` with each push (`lib/version.js`).

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

A row with no username or password can never sign in. Only `b2b`, `admin` and `master-admin` get in; `ops` (and any other role) is refused with "not set up for the CRM".

Signing in happens once, but the cookie lasts 12 hours, so every request also checks the person against the sheet (read at most once a minute): change someone to `ops`, clear their role or remove their row and they are signed out within about a minute, and a promotion or demotion applies at once. If Google cannot be reached, people who are already signed in stay in so an outage does not lock the team out; new sign-ins still need the sheet. Check the sheet is readable and shaped right (prints no passwords):

```bash
npm run check-accounts
```

**Register a new user** (link on the sign-in page): anyone who knows the master password (the password of the `master-admin` row) can add a BD or Ops account; the row is appended to the sheet. Admins are added in the sheet by hand. With no `master-admin` row, registration is off. Failed guesses are rate limited.

Known limit: passwords in the sheet are plain text, as in the Delivery Tracker. A hashed column is the sensible next step. Sessions last 12 hours and are not revoked if a row is removed before then.

With `ACCOUNTS_SHEET_ID` empty (local trials only) the app falls back to one shared `PORTAL_PASSWORD` plus a name.

## Google Sheet feeds (connect as many as you like)

Admins connect sheets under **Add, Purchase CSV or sheet**. Share each sheet with the service account as **Viewer**: feeds only read. There are two kinds:

- **Customer orders:** each row is a purchase. It uses the same column mapping, buyer matching, unmatched queue, undo and duplicate protection as a CSV.
- **Leads and contacts:** each company becomes a lead (a client with no orders yet, shown with a Lead status), its people become contacts, and remarks and follow-ups become notes. Reading the sheet again adds only new or changed rows. Undo removes the leads that import created. A contact can also be added by hand from a client's own page (the "Contact" button), for anyone a sheet never carried.

Sheets worth connecting today: `New B2B 2026` (tab `2026`, orders with order value), `Pending delivery` (tab `Sales`, orders with gross sales and the customer's contact person), `BD Ops Sales Tracking Sheet` (tab `Sheet1`, orders without amounts) and `CCBD Tracker` (tabs such as `Follow up` and `Diwali CCBD`, leads).

- **Pull:** "Read again" on a connected sheet, or a scheduled job calling `GET /api/sheets/sync-all` with `Authorization: Bearer $CRON_SECRET`.
- **Push:** an Apps Script in the sheet can `POST /api/ingest` with `Authorization: Bearer $INGEST_SECRET` and `{ "sourceId": 1, "rows": [{ "Column header": "value" }] }`.
- The accounts sheet itself can never be used as an order feed.

## Editing a lead tries to write back to the sheet

A lead's name, owner and its contacts' name/phone/email are editable from the Leads page and the lead's own client page (the pencil icons). The CRM always saves the edit; it then also tries to overwrite the same cell in the sheet the lead came from, so BD does not have to make the change twice. It remembers which sheet, row and column a lead and each of its contacts came from the moment that row first created them (`clients.lead_source_id`/`lead_row`, `contacts.lead_source_id`/`lead_row`; `lib/leadSync.js`).

This is best effort, not a real two-way sync, and the UI says so when it cannot reach the sheet:

- **The sheet has to be shared with the service account as Editor**, not just Viewer, or the write is refused (the CRM save still goes through either way).
- **The row is tracked by position.** If someone inserts or deletes a row above it in the sheet after it was read, the next edit from the CRM can land on the wrong row. Re-reading the sheet does not fix this; only a fresh import of that row would.
- Only a lead's **own creating row** is remembered, so editing the company name or owner always targets that one row even if later syncs added more notes or contacts from other rows.
- A contact remembers **its own row**, which may differ from the row that created the client (two people from the same company, read on different days).
- A client or contact made by hand, by CSV, or whose source sheet is no longer connected has nothing to sync to — the edit just stays in the CRM, silently.

## What counts as a sale

An order sheet's STATUS column also lists orders that are not sales: **Duplicate**, **Cancelled**, **RTO** (returned to origin, in any stage) and **Internal PO**. An order with no amount entered yet (blank or 0 "Order Value") is the same: not a sale until it has one. They stay on file and show struck through on the client's order list, but are left out of revenue, order counts, standings, the Overview, Insights and the chat. Every other status (Delivered, Pending, In-Transit, blank) with a real amount counts. The rule is in `lib/status.js`, and the totals read the `sales` view, which is the orders that count. A sync picks up the amount as soon as ops fills it in, and the order starts counting from then on.

The same marketplace PO entered twice (same client, same PO number, same amount) counts once: the first copy stays, later copies are marked "Repeated PO" and left out (`lib/sales.js`). A PO with a different amount, or with no amount, is never treated as a repeat, and if the first copy is cancelled the second one counts instead.

An order's status can change in the sheet after it was first loaded (Pending, then Cancelled). Each time a sheet is read again, orders already on file are brought up to date, so a cancellation reaches the totals. To apply the rule to orders loaded before it existed, run `npm run recount-sales` (dry run) and `npm run recount-sales -- --apply`.

## Hiding a client

An admin can hide a client (the "Hide" button on its page, or unhide it from the same page or **Imports & backup, Hidden clients**). A hidden client is left out of the Overview, Clients, Leads, search, the chat and every total — but its own page still opens, and its full order history is untouched; nothing is deleted. This is for accounts that are not really B2B clients, such as the quick-commerce platforms themselves (Zepto, Blinkit's distributor, Scootsy, Big Basket, Flipkart Minutes) when their orders are already counted through another channel. A new order for a hidden client (from a sheet) still loads and still counts toward *its own* figures on its own page; it just stays off the dashboard. `scripts/hide-platform-clients.mjs` (dry run, then `-- --apply`) is the script that was used to hide the first batch; it verifies each client's name before touching it.

## Which channel the dashboard shows

The Overview, Clients and Insights pages count **B2B channel orders only** — Zepto, Amazon, Flipkart and every other marketplace or quick-commerce channel are left out of every total, trend and list on these pages (`channel: "b2b"` in `lib/stats.js` and `lib/insights.js`). A client's own page is unaffected and still shows its full order history and real figures, across every channel. Ask the chat a direct question about another channel (e.g. "revenue by channel this year") and it still answers from the real data; it is only the standing dashboard pages that are scoped to B2B.

## Lead stages

Each lead has a **Stage** (New, Contacted, Cost sheet, Sample, Meeting, Negotiating, Won, Lost — `lib/constants.js`), shown as a coloured pill that darkens as a lead moves along (Lost is red, the app's one accent colour) so it reads at a glance and never blends into the standing chip next to it. It is editable from the Leads page, the Overview's and Insights' "Leads waiting" cards (read-only there), and right on the lead's own page next to its "Lead" status — pick a value and it saves immediately. A leads-sheet import also advances it on its own, forward only, when a row's remarks, follow-up or status text names a later stage — contacted, cost sheet, sample, meeting, negotiating, won or lost (`lib/normalize.js`'s `detectLeadStage`). The Leads page also filters by stage, including "No stage set" for leads nobody has triaged yet, and by "Urgent" leads (a sheet's "Level of Urgency" note saying so). Anyone signed in can set a stage; only hiding a client needs an admin.

## The chat (Ask)

The chat button in the top bar opens a chat about your own data: how the business is doing, comparisons between periods, who is ordering less, top clients, and questions about one client (profile, last order, orders, products, notes, terms, contacts, next order due). Name a client once and “they” or “their” keeps meaning that client; on a client's page it starts out about that client. “note: …” drafts a note that is saved only when you press Save.

It works with no AI at all: questions are read by rules (`lib/ask.js`, `lib/chat.js`) and answered with queries over the CRM's own data, so every number is exact, it is free and unlimited, and nothing leaves the server. The rules understand the kinds of question listed under “help”. To teach them a new question, add a rule in `lib/chat.js` and a test in `tests/backend.test.js`.

**Optional Gemini.** With `GEMINI_API_KEY` set (several keys may be comma-separated; `GEMINI_MODEL` defaults to `gemini-3.6-flash`), a question the rules cannot read is sent to Gemini, which only says *which* known question was meant. That plan is checked against a whitelist and run by the same queries, so Gemini never supplies a figure. Calls are not wasted: the rules answer first, every plan is cached in the database (the same question never costs a second call), identical questions asked at once share one call, and nothing is sent for text that cannot be a question. When Gemini says it is busy, the call is retried after 2, 5 and 10 seconds (as in the Task Tracker); a quota error is not retried, moves to the next key, and if every key is out the app rests for a while instead of spending calls that cannot succeed. If there is no key, or Gemini is busy, out of quota or broken, the rules' answer is shown as it would be without Gemini. The same variables go in Vercel's environment settings.

## Connect the real database (Neon) and deploy

1. **Create the database.** Sign up at neon.com (free, no card), create a project, and copy the connection string (the pooled one, starting with `postgresql://`).
2. **Try it locally against Neon.** Put `DATABASE_URL=<that string>` in `.env.local` and run `npm run dev`. The tables are created on the first request. Sign in, add a client, and it appears in Neon's Tables view. Data in the local `.data/` folder is not copied across; `npm run seed` loads the invented sample clients if you want them.
3. **Deploy.** In Vercel, import the GitHub repo `Snackible/CRM_Database` (Vercel needs access to the Snackible organisation). Add the Neon integration from the Vercel Marketplace, which sets `DATABASE_URL` for you, or paste it by hand.
4. **Set the other environment variables** in Vercel (Project, Settings, Environment Variables). The quickest way: keep a git-ignored `.env.vercel` with the production values and use **Import .env** on that page. Otherwise add them one by one: `SESSION_SECRET`, `ACCOUNTS_SHEET_ID`, `ACCOUNTS_GID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (paste the key as it is in `.env.local`, with the `\n` escapes, or with real newlines), and optionally `CRON_SECRET` and `INGEST_SECRET`. Leave `PORTAL_PASSWORD` unset.
5. **Share the accounts sheet** with the service account address as Editor, then redeploy.
6. **Check it.** Open the deployed URL, sign in with a sheet account, add a note, and reload.

Free database plans keep little backup history, so use **Imports and backup, Download everything** now and then.
