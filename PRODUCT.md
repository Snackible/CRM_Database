# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React / Next.js (user's choice, same family as the QC tool). Deploy target Vercel with a Neon Postgres database. Supersedes the plain-HTML assumption in PLAN.md; the API becomes Next.js route handlers.

## Users
- **BD (business development) team**, around client calls: look a client up before a call, log notes, terms and purchases right after.
- **New recruits**, who use the CRM to get to know existing clients and accounts quickly. The client page therefore has to teach someone who has never met the client: who they are, what they buy, what was agreed.
- Founders/management, ops and delivery staff were offered and not selected for now.

Clients are businesses (B2B): several contacts per client, GSTIN, credit terms, delivery days.

## Product Purpose
A living record of everything Snackible knows about each B2B client plus their purchase history. There is no existing data; the record accumulates through manual entry, purchase CSV uploads and text pulled from documents. Success: a BD person or a new recruit opens a client and understands the relationship in a minute, and the team keeps adding to the record because adding is quick.

## Positioning
Built for Snackible's own B2B accounts, not a general CRM. Information that does not fit a field (contracts, price lists, emails, WhatsApp chats) is processed into reviewable facts and searchable text, and the original file is discarded.

## Operating Context
- Data enters three ways: by hand (new client, purchase, note, fact, pasted text), purchase CSV (matched to clients, with a queue for unmatched rows), and documents (PDF, Word, text, WhatsApp export read in the browser, pattern matching suggests facts, a person reviews each one).
- Pattern matching covers Indian business identifiers and terms: GSTIN, PAN, FSSAI licence, payment terms, MOQ, delivery days, ₹ amounts.
- An AI extractor is optional and off by default; it only appears when configured and never saves anything without review.
- Existing sibling tools: B2B Delivery Tracker (Google Sheets, vanilla JS) and QC Tool (Next.js, label compliance).
- Login is one shared password in v1; per-person accounts later.

## Capabilities and Constraints
- Clients, contacts, notes, facts (category, key, value, source, snippet), purchases, imports with undo, full-text search, lapsed-client view, backup download. See PLAN.md.
- Free tiers only, no credit card. Original documents are not stored.
- Scanned PDFs and photos are out of scope for v1 (no text reading).
- Undecided: the client key (client code, email or phone), where purchase CSVs originate, whether facts carry a "last confirmed" date.

## Brand Commitments
Snackible is the company (millet snack products appear in the QC tool). No brand colours, fonts or logo are confirmed for the CRM. Existing tools may be visual evidence but have not been declared binding.

## Evidence on Hand
- PLAN.md in this folder.
- No real client data, purchase files or documents exist yet. Future work must not fabricate client names, revenue figures or testimonials; sample data must be clearly labelled as sample.

## Product Principles
1. The client page is the product. Everything else feeds it.
2. Adding information must cost seconds, by hand or by upload.
3. Nothing machine-suggested becomes a fact without a person approving it, and every fact shows where it came from.
4. A new recruit should be able to read a client page cold and understand the account.
5. Be honest about gaps: unmatched rows, unconfirmed facts and empty sections are shown, not hidden.

## Accessibility & Inclusion
No product-specific requirement established. Dense, data-heavy screens used daily by a small team; keyboard-friendly forms and readable tables are expected.
