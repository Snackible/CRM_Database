---
version: 1
slug: "app-layout-jsx"
primary_target: "app/layout.jsx"
related_targets: []
---

# Surface brief: Snackible CRM app (all screens)

Scope and mode: Operate. A logged-in B2B client record used on laptop and phone by the BD team and new recruits.

Audience, job, task: BD people brief themselves before a call, log notes, facts and purchases right after, and new recruits read an account cold. Data arrives by hand, purchase CSV and processed documents; nothing machine-suggested is saved without approval. Screens: sign-in, overview, clients list, client page, new client, add purchase, CSV import with column mapping, unmatched purchases, add information with fact review, search, imports and backup.

Constraints: Next.js (App Router, JavaScript), plain CSS tokens, lucide icons, Barlow Condensed and Libre Franklin via next/font. The user chose the Timetable Rack world from the catalogue (reversing the earlier Reservation Chart), and asked for switchable colour themes: Goldenrod (default), Paper (light), Carbon (dark), Slate, Bottle green, Vermilion, Indigo. Every theme keeps the same grammar and only swaps tokens. Demonstration data is synthetic and labelled sample.

## Direction contract

THESIS: A pocket airline timetable read as a rack of clear panes on a lit bed. One type size everywhere, so rank is carried by weight, case, rule and reversal, and state is a mark in a fixed cell. Refuses grey SaaS cards, big KPI numbers, display type and gradients.

OWN-WORLD: A saturated bed colour behind opaque work panes with 2px rules and no radius; carbon or ivory reversed plates; condensed uppercase labels tracked wide over plain gothic prose, both at one size (15px) with tabular numerals; state marks are 18px cells: filled green ordered, hollow skipped, vermilion strike lapsed; dotted row rules inside panes. Theme tokens (bed, rule, pane, plate, ok, bad) swap per theme, grammar never does.

STORY: Open a client and the plate names them, the strip shows twelve months as fixed cells, facts and sources sit in plain rows; adding a note, fact or purchase is one button away; any bed colour can be picked for the room or the hour.

FIRST VIEWPORT: Client page at 1440x900. Left rail on the bed with condensed nav (current item is an ivory pane with a 2px rule, Unmatched carries a vermilion count). Top bar: wide search, colour-theme button, heavy-bordered reversed "Add". One reversed plate holds the client name, code, quick buttons Note, Fact, Purchase, Document and the status, segment, city, owner, since line. Below, two columns: ordering strip pane (12 fixed cells with a legend) then purchases and timeline; facts and people on the right. Phone 390x844: same panes stacked, bottom tab bar on the bed with a reversed Add cell, and the type size does not change.

FORM: Timetable Rack (rw-timetable-slide-rack), the user's pick from the catalogue, seed: seed:cb5e731fc995b948. Signature move: the fixed-cell state mark used for the ordering strip, status and purchase rows, plus exactly one reversed plate per screen.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Real Snackible logo and brand colours (none supplied). Per-person accounts. Final field list depends on the first real purchase CSV.
