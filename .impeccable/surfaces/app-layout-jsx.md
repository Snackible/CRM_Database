---
version: 1
slug: "app-layout-jsx"
primary_target: "app/layout.jsx"
related_targets: []
---

# Surface brief: Snackible CRM app (all screens)

Scope and mode: Operate. A logged-in B2B client record used on laptop and phone by the BD team and new recruits.

Audience, job, task: BD people brief themselves before a call, log notes, facts and purchases right after, and new recruits read an account cold. Data arrives by hand, purchase CSV, Google Sheet feeds and processed documents (PDF, Word, text); nothing machine-suggested is saved without approval. Screens: sign-in, overview, clients list, client page with insights, leads, insights, new client, add purchase, import with column mapping, unmatched purchases, add information with fact review, search, imports and backup.

Constraints: Next.js (App Router, JavaScript), plain CSS tokens, lucide icons, fonts via next/font. Colour is red, black and white only (the user's rule): red is the room and the state colour, black and white carry everything else; no other hue anywhere. Themes swap tokens only: Safelight (default red room), Paper (white room), Carbon (black room). Real data is loaded; never invent client names or figures.

## Direction contract

THESIS: The CRM under a darkroom safelight. A red room holds white record sheets laid over a black under-sheet; how busy a month was is hatch density, and a quiet or lapsed account is cross-hatched in red. Refuses grey SaaS cards, hero metrics, and a second accent colour.

OWN-WORLD: Safelight red (#c8000f) fills the room around the work: top bar, margins, login. A black nav sheet on the left. Work panes are white sheets with soft paper shadow, the page head sheet sitting over a black under-sheet turned half a degree. Big Shoulders Display, heavy tall caps, for names, headings and labels; Roboto for prose; Roboto Mono for figures, dates and codes. State is hatching, never a new colour: solid black active, single hatch watch, red cross-hatch lapsed, hollow new. Hairline black rules, dotted row dividers, zero radius.

STORY: Open a client and the name stands tall on its sheet, the twelve months read as hatched exposure cells (denser means more orders, red crossing means quiet), insights and orders sit on white sheets below. One button away: note, fact, purchase, document.

FIRST VIEWPORT: Client page at 1440x900 (matches the chosen sketch lead-darkroom). Red room; black nav sheet at left (Overview, Clients, Leads, Insights, Unmatched with a count, Imports); top bar on red with white search and black Add. Client sheet: name in 76px heavy caps over a 6px black rule, status mark, code, owner, since, quick actions Note, Fact, Purchase, Document at right. Left column: hatched twelve-month strip with month labels, insights, orders. Right column: twelve-month figures in tall caps and mono, rank, notes. Phone 390x844: same sheets stacked, nav becomes a black bottom tab bar, hatching holds at 32px cells.

FORM: Exposure-record zone sheets (operate-b-exposure-record-zone-sheets), the user's pick from the fourth hand, seed: seed:03dbf777f157d873. Signature move: hatch density as order load, with red cross-hatch as the quiet or conflict state; sheets laid over a black under-sheet.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Real Snackible logo and brand colours (the card-mark logo is a placeholder). Per-person accounts.
