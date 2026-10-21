# Snackible CRM: plan

A living record of everything Snackible knows about each client, plus their purchase history. Data is not dumped once; it accumulates through notes, purchase CSVs and processed documents.

Status (updated): phases 1 and 2 are built: database layer (Neon / local PGlite), clients, contacts, notes, facts, manual and CSV purchases with matching, unmatched queue, undo, search, backup, and the front end wired to it (see README.md). Sign-in now uses per-person accounts from a Google Sheet, with a master-password registration flow, instead of the shared password in section 1. Google Sheet order feeds (pull and push) are built on the same importer. Phase 3 (documents) works with pasted text and `.txt` files; PDF and Word reading in the browser, and the optional AI extractor, are not built. Not yet tested against the real accounts sheet.

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Database | Neon Postgres, free plan, no card. Local development runs on PGlite (Postgres in WASM), so no account is needed until deploy. |
| Hosting | Vercel. Front end is Next.js (App Router, JavaScript, plain CSS) as of the design step; the API is Next.js route handlers (`app/api/*/route.js`) instead of the tracker-style `api/*.js` files. The front-end preview with sample data is built; the database and API are not. |
| Documents | The original file is not stored. Text is extracted, facts are saved, and the extracted text is kept for search and for re-checking. |
| Extraction | Pattern matching by default. AI is an optional add-on, off unless configured. |
| Purchase history | CSV upload, matched to clients. |
| Login | One shared password for v1 (signed cookie, as in the tracker). Per-person accounts later. |

## 2. What the QC tool gives us (and what it does not)

I read `QC Tool/Qc-tool-snackible/src/lib` and `snackible_label_qc.html`. Its pattern matching is about **label compliance**, not client data:

- `fssai.ts`: nutrient claim thresholds (e.g. "High Protein" needs >= 10.8 g), a list of factual claims ("No Palm Oil", "Baked Not Fried" ...), and oil detection by regex (`OIL_SAT_FAT_RULES`).
- `snackible_label_qc.html`: regexes that read nutrient values out of label text ("Protein 12.5 g").

So contact details, GSTIN, payment terms, MOQ and delivery days need **new** patterns. What we do reuse:

1. The style: a table of rules `{ name, pattern, ... }` that is easy to extend, like `OIL_SAT_FAT_RULES`.
2. `FACTUAL_CLAIMS` and the product names, to spot when a document mentions a Snackible product or claim ("asked about No Palm Oil range").
3. The nutrient regex, only if we later want to read spec sheets (optional, phase 5).

The QC tool already calls the Anthropic API (key in its own settings). The CRM's optional AI step could use the same provider, but that is your call; it needs billing, which the free-only rule excludes.

## 3. Data model

All text/JSON, no stored files.

- `clients`: id, client_code (unique, optional), name, company, email, phone, city, segment, owner, status, custom (JSON for your own fields), created_at, updated_at.
- `contacts`: client_id, name, role, email, phone. A business client has several people.
- `notes`: client_id, body, author, created_at.
- `facts`: client_id, category, key, value, source (manual | pattern | csv | ai), document_id, snippet, created_by, created_at. This is the "everything we know" list.
- `documents`: client_id, filename, kind, text (extracted), extractor, uploaded_by, created_at. Text only.
- `purchases`: client_id (nullable), source (csv | manual), entered_by, raw_client (JSON of the id/email/phone/name in the file), order_ref, order_date, product, quantity, amount, channel, extra (JSON), row_hash (unique, prevents duplicates), import_id.
- `imports`: filename, mapping, counts, errors, status. `import_mappings`: a saved column mapping per source name.
- Search: a Postgres full-text index over notes, facts and document text.

## 4. Pages

1. **Overview**: client count, revenue, recent activity, lapsed clients (ordered before, nothing for N days), unmatched purchase rows waiting.
2. **Clients**: search and filter, **New client** button.
3. **Client page**: profile and contacts (all editable), timeline (notes, documents, purchases by date), facts grouped by category, purchases with totals, last order date and top products. Quick-add buttons on the page: **+ Note**, **+ Fact**, **+ Purchase**, **+ Document**.
4. **Add purchases**: CSV upload and column mapping, or **add one by hand** (see section 5).
5. **Unmatched purchases**: link each row to a client or create the client right there (opens the New client form pre-filled from the row).
6. **Add document**: pick the client, drop the file, review suggestions, or **type or paste information by hand** (see section 6).
7. **Search**: across everything.
8. **History / backup**: imports with undo, and a download of all data.

## 5. Purchase CSV flow

1. Parse the file in the browser (handles quotes, semicolons, BOM).
2. Guess which column is which; you correct the guesses. Saved per source so the next upload is one click.
3. Rows are sent in small batches.
4. Match each row to a client by client code, then email, then phone, then exact name. No match: the row is stored as unmatched.
5. Duplicate rows (same hash) are skipped, so re-uploading is safe.
6. The result shows added, duplicate, unmatched and skipped rows. An import can be undone.
7. A CSV template is available to download.

### Manual entry (no CSV)

- **New client form**: name (required) plus any of company, client code, email, phone, city, segment, owner, and your own custom fields. It warns if an existing client has the same email, phone or client code, and offers to open that client instead of creating a duplicate. Contacts can be added in the same form.
- **Add purchase form**: pick a client (type to search, or create one inline), then date, product, quantity, amount, order reference, channel. "Add another line" keeps the client and date for quick multi-line orders. Manual rows get `source = manual` and the same duplicate check as CSV rows.
- Anything entered by hand can be edited or deleted later. Edits record who changed it and when.

## 6. Document flow (process, keep text, discard file)

1. Choose the client, then drop a PDF, Word file, text file or WhatsApp export, or paste text.
2. **Text is extracted in your browser** (pdf.js and mammoth.js from a CDN). The file itself never reaches the server. Only the text does.
3. The server runs the pattern rules and returns suggestions: `{ category, key, value, snippet }`.
4. Review screen: each suggestion next to its source sentence. Approve, edit or reject. You can also select any text and tag it as a fact by hand.
5. On save: approved facts and the extracted text go into the database. Nothing else is kept.

### Manual entry (no document)

Information that never was a document goes in directly from the client page:

- **+ Note**: free text, saved to the timeline and searchable.
- **+ Fact**: pick a category (contact, identity, commercial, delivery, product interest, other), a key and a value, e.g. Commercial / Payment terms / Net 30. Optional "last confirmed" date.
- **+ Document**: type or paste text with a title. It goes through the same pattern rules and review screen as an uploaded file, so a pasted email or call summary also produces suggested facts.
- Manual facts are labelled "manual" and can be edited or deleted. Suggestions and manual facts share one list per client.

Not in v1: scanned PDFs and photos (no text to read; paste the text instead). The page says so when it finds no text.

### Pattern catalogue (new)

| Fact category | Patterns |
|---|---|
| Contact | email, Indian mobile (+91 / 10 digits starting 6-9), landline, website |
| Identity | GSTIN, PAN, FSSAI licence number (14 digits near "FSSAI" / "licence"), pincode, address line before a pincode |
| Commercial | payment terms ("net 30", "30 days credit", "advance", "COD"), MOQ, discount or margin %, price per unit or case, GST rate, lead time |
| Delivery | delivery day or frequency ("every Monday"), delivery address, cut-off time |
| Product interest | Snackible product names, claims from `FACTUAL_CLAIMS` |
| Dates and amounts | dates, ₹ / Rs / INR amounts, shown as context |
| Chat | WhatsApp export lines (`12/10/25, 4:32 pm - Name: message`) are split into messages so snippets point at one message |

Rules live in a rule table (`lib/patterns/`), one file per group, each with tests. Adding a pattern is one entry.

## 7. Optional AI

- Off by default. It switches on only when the server has a provider key (`AI_PROVIDER` plus its key).
- Without a key, the button does not appear.
- It runs only when you click it on one document. Never automatic.
- Before sending, it shows exactly which text will go to the provider.
- Its output enters the **same review screen**, marked "AI". Nothing is saved without approval.
- The provider is a swappable module with one function: `suggest(text, context) -> suggestions[]`. Options: Claude (paid), Gemini free tier (limits and data-use terms to check first).

## 8. API (Vercel functions)

`session` (login/logout), `clients` (list, create), `client` (detail, edit, delete), `notes`, `facts` (create, edit, delete), `documents` (analyze, save), `purchases` (list, create by hand, edit, delete, link), `import` (start, batch, finish), `imports` (list, undo), `search`, `stats`, `export`. Everything except login requires the session cookie.

## 9. Security and privacy

- Client data is personal and commercial. Login is required for every API call; password compared in constant time; cookie is HttpOnly, SameSite, Secure on Vercel.
- Document text is never written to logs.
- With AI off, document contents never leave your browser and your own database.
- Free tiers have limited backups, so the backup download is a v1 feature, not an extra.
- Secrets (`DATABASE_URL`, `PORTAL_PASSWORD`, `SESSION_SECRET`) live in Vercel settings and a git-ignored `.env`.

## 10. Build phases

Each phase ends with automated tests and a run against generated sample data.

1. **Foundation**: database layer (PGlite locally, Neon in production), schema, login, **new client form with duplicate warning**, contacts, notes, **manual facts**, edit and delete. *Done when:* create a client by hand, add a note and a fact, search finds it, a duplicate email is flagged.
2. **Purchases**: **manual purchase form**, CSV parse, mapping, matching, unmatched queue (with create-client), undo, client totals. *Done when:* a purchase added by hand shows in client totals; a messy sample CSV imports; a second upload adds nothing; unmatched rows can be linked or turned into new clients.
3. **Documents**: browser extraction, pattern rules, review screen, save, **pasted/typed text through the same review**. *Done when:* a sample contract PDF, Word file, WhatsApp export and a pasted email produce the expected facts with correct snippets.
4. **Search, insights, backup**: full-text search, lapsed clients, export. *Done when:* a word inside a document is found; export re-imports cleanly.
5. **Optional**: AI provider module; spec-sheet nutrient reading from the QC patterns; seeding clients and orders from the tracker's Google Sheets; per-person logins; client merge tool.

## 11. Setup you will do (when we deploy)

1. Create a free Neon project and copy the connection string.
2. Create a Vercel project from this folder and set `DATABASE_URL`, `PORTAL_PASSWORD`, `SESSION_SECRET`.
3. Open the site, log in, and upload the first CSV.

## 12. Open questions

- Is the client key a client code, an email, or a phone number? Purchase matching depends on it.
- Where will purchase CSVs come from (tracker sheet, Tally, Shopify)? That fixes the template.
- Should facts expire or carry a "last confirmed" date? (Payment terms change.)
- Will anyone besides you need access in v1?
