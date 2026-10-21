---
name: Snackible CRM
description: A pocket airline timetable read as a rack of opaque panes on a lit bed. One type size, 2px rules, no radius, state as a mark in a fixed cell.
colors:
  bed: "#e0a526"
  bed-ink: "#1b1b1b"
  bed-rule: "#1b1b1b"
  pane: "#f6f0dc"
  pane-2: "#ebe3c4"
  ink: "#1b1b1b"
  muted: "#4a463a"
  rule: "#1b1b1b"
  plate: "#1b1b1b"
  plate-ink: "#f6f0dc"
  plate-muted: "#d3ccb0"
  ok: "#1f6b46"
  ok-ink: "#1f6b46"
  ok-on: "#ffffff"
  bad: "#d9381e"
  bad-ink: "#b02610"
  bad-on: "#ffffff"
  warn: "#b8780c"
  warn-ink: "#7a4a00"
  focus: "#1b1b1b"
typography:
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.09em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.2em"
  body:
    fontFamily: "Libre Franklin, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  body-strong:
    fontFamily: "Libre Franklin, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "38px"
    padding: "0 16px"
  button-hover:
    backgroundColor: "{colors.pane-2}"
  button-primary:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.plate-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    height: "38px"
    padding: "0 16px"
  panel:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.none}"
    padding: "16px 18px"
  input:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "40px"
    padding: "0 12px"
  nav-item-current:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "9px 10px"
  count-badge:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.bad-on}"
    padding: "3px 8px"
  berth-cell-on:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ok-on}"
    height: "40px"
  berth-cell-off:
    backgroundColor: "{colors.pane}"
    height: "40px"
---

# Design System: Snackible CRM

## Overview

**Creative North Star: "The Timetable Rack"**

A pocket airline timetable read as a rack of opaque panes on a lit bed. A saturated bed colour fills the room: rail, top bar, margins. Work lives in flat panes ruled in 2px, with no radius and no shadow. Everything is set at one size, 15px, so rank is never carried by scale. It is carried by weight, case, a rule, or reversal onto a plate. State is never a coloured pill; it is a mark in a fixed 18px cell that reads the same in every row.

The system is a BD team's operating record, used before a call and right after one. Density is steady and tabular. Condensed uppercase labels, tracked wide, sit over plain gothic prose; numerals are tabular. Each screen carries exactly one reversed plate, which names the page or client.

The look is themeable by construction. Seven themes (Goldenrod default, Paper, Carbon, Slate, Bottle green, Vermilion, Indigo) swap a fixed set of tokens on `:root[data-theme]`. The grammar never changes.

**Key Characteristics:**
- One type size (15px) everywhere; rank by weight, case, rule, reversal.
- Opaque panes on a bed; 2px rules; radius 0; no elevation.
- State is a mark in a fixed cell: filled ok, hollow skipped, struck lapsed.
- Exactly one reversed plate per screen.
- Themes swap tokens only.

## Colors

Colour is a role set, not a palette. Values below are the default Goldenrod theme; other themes reassign the same names (see Theme System).

### Primary
- **Bed Goldenrod** (#e0a526): the lit ground behind rail, top bar, page margins and login. Ink on it is #1b1b1b (`bed-ink`), rules on it `bed-rule`.
- **Plate Carbon** (#1b1b1b): the reversed plate, primary button, selected segment, AI source tag, note marker, selection highlight. Ink on it is Ivory (`plate-ink` #f6f0dc), secondary text `plate-muted` (#d3ccb0).

### Neutral
- **Pane Ivory** (#f6f0dc): every working surface (panels, inputs, buttons, menus, current nav item).
- **Pane Sand** (#ebe3c4, `pane-2`): table heads, group headings, composer, row hover, chip.plain.
- **Ink** (#1b1b1b): text and 2px rules on panes. **Muted** (#4a463a): secondary text, hints, timestamps.

### State
- **Ok Green** (#1f6b46, `ok`; `ok-ink` for text; `ok-on` #ffffff for ink on a filled ok cell): ordered, active, purchase marker, completed step.
- **Bad Vermilion** (#d9381e, `bad`; `bad-ink` #b02610 for text; `bad-on` #ffffff): lapsed strike, Unmatched count, danger text, late.
- **Warn Amber** (#b8780c, `warn`; `warn-ink` #7a4a00): Watch status mark.
- **Focus** (#1b1b1b): 3px outline, 2px offset.

### Named Rules
**The Tokens-Only Rule.** A theme may change only the 20 named tokens (bed, bed-ink, bed-rule, pane, pane-2, ink, muted, rule, plate, plate-ink, plate-muted, ok, ok-ink, ok-on, bad, bad-ink, bad-on, warn, warn-ink, focus). No component hardcodes a colour.

**The State-Is-Not-Decoration Rule.** ok, bad and warn appear only as a state mark, a count, or state text. Never as a panel fill or an accent.

## Typography

**Label/Title Font:** Barlow Condensed (500-600, with Arial Narrow)
**Body Font:** Libre Franklin (400-600, with Segoe UI, system-ui)

**Character:** Condensed caps feel stamped like a timetable header; Franklin gothic carries plain prose. Both at 15px, so the pairing differs by letterform, not size.

### Hierarchy
- **Title** (Condensed 600, 15px, 1.4, 0.2em, uppercase): page and client name on the plate, brand name, login heading.
- **Label** (Condensed 500-600, 15px, 0.09em, uppercase): nav, buttons, table heads, panel heads, field labels, chips, steps, month labels, menu titles, count badges.
- **Body** (Franklin 400, 15px, 1.4, tabular numerals): prose, cell values, inputs. Plate subtitle line is capped at 72ch, lede at 80ch.
- **Body strong** (Franklin 600, 15px): row names, fact keys, result titles.

### Named Rules
**The One Size Rule.** Every element is 15px (`--size`). Never add a second size; rank with weight (400, 500, 600), case, a rule, or reversal.

**The Sentence-Case Prose Rule.** Condensed is uppercase and tracked; where a label holds a sentence (plate subtitle, panel sub, theme note) it reverts to Franklin, no case transform, no tracking.

## Layout

Desktop is a 232px rail on the bed plus a main column. The top bar is 64px, sticky, with a search up to 560px wide, a Colours button and a reversed Add. Content is centred in a 1360px max with 20px padding. Two-column screens split into a flexible column and a fixed 400px (overview) or 420px (client page) side column, collapsing to one column at 1100px. Gaps are 16px between panes and 8-12px inside; rows are 10px by 12px padded. Form pages cap at 940px.

At 860px the rail disappears: a bottom tab bar (five cells on the bed, current cell an ivory pane, Add cell a reversed plate) takes over, controls grow to 44px, grids stack, tables hide `col-hide` columns. The type size does not change.

## Elevation & Depth

None. The system is flat. Depth is carried by the bed/pane contrast, 2px rules, and reversal. Menus (Add, Colours) are panes on a transparent scrim with a 2px rule; they do not cast shadows. The only inset shadow is the primary button hover (a 2px inner ring in `plate-ink`) and the construction of the Watch mark.

### Named Rules
**The Flat Rule.** No drop shadows, no blur, no gradients except the 2px diagonal strike that marks lapsed.

## Shapes

Radius is 0 everywhere. Borders are 2px solid `rule` around panes, inputs, buttons, menus; rows inside panes divide with 1px dotted `rule`; sections inside a pane divide with a 2px or 1px solid rule. Primary buttons use a 3px border. Drop zones use a 2px dashed rule that turns solid on drag-over. Icons are Lucide at 16-24px with 1.8-2.4 stroke.

### Named Rules
**The Fixed-Cell Rule.** State marks are square cells with a 2px border: 18px in chips, 40px in the 12-month strip (32px on phones, 20px in the mini strip), 24px in the timeline. Filled `ok` means ordered or active. Hollow means skipped or new. A 2px diagonal strike in `bad` on a `bad` border means lapsed or quiet. Watch is a hollow cell with a `warn` inner square.

**The One Plate Rule.** One reversed plate per screen: the page head or client head. Reversal elsewhere is limited to the primary button, a pressed toggle/segment, the Add tab, the AI source tag, and the current wizard step.

## Components

### Buttons
- **Shape:** square, 2px `rule` border, 38px high (40 in top bar, 34 small, 44 on phones), 0 16px padding, Label type.
- **Default:** pane fill, ink text; hover `pane-2`.
- **Primary:** plate fill, `plate-ink` text, 3px border, weight 600; hover adds a 2px inner ring.
- **Quiet:** transparent, no border until hover. **Danger:** text in `bad-ink`. **Pressed/expanded:** ink fill, pane text.
- **Disabled:** 45% opacity.

### Panels
Pane fill, 2px rule, no radius. Head row (min 46px) with a 2px bottom rule and a Label-weight-600 heading; body padded 14px 12px. Panels stack with a 16px gap.

### Plate
Plate fill, 16px 18px padding, 16px bottom margin; title in Title type, subline in plate-muted. The client plate carries code, quick buttons and a meta line.

### Inputs / Fields
Pane fill, 2px rule, 40px min height, 0 radius. Labels above in Label type weight 600, hints in muted. Focus draws the 3px `focus` outline. Textarea min 96px.

### Navigation
Rail items: Label type, 2px transparent border; hover shows the rule; current becomes an ivory pane with a rule and weight 600. Unmatched carries a `bad` count. The rail foot is separated by a 2px rule.

### Berth strip (signature)
Twelve fixed cells, one per month. Filled `ok` with the order count in `ok-on`; hollow for no order; struck for quiet months after 75 days since the last order. Month labels beneath in Label type, the current month bold and underlined. A legend of 16px cells explains marks. The mini variant (148px wide, 20px cells, no numbers) sits in list rows.

### Status chip
A Label-type word following an 18px cell: Active (filled ok), Watch (hollow with warn inner), Lapsed (struck), New (hollow). `chip.plain` is a boxed neutral tag.

### Tables and rows
Header row on `pane-2` with a 2px bottom rule; body rows divide with dotted rules, hover `pane-2`; numeric columns right-aligned and tabular.

### Theme picker
A Colours button in the top bar opens a menu of two-column swatches, each a three-block chipset (bed, pane, plate) with the theme name and a muted note. A check marks the current theme.

## Theme System

Themes are `:root[data-theme="<id>"]` blocks in `app/globals.css`, listed in `lib/themes.js`; only the 20 tokens above change. `app/layout.jsx` sets `data-theme="goldenrod"`; a `beforeInteractive` script reads `localStorage["crm-theme"]` and otherwise chooses Carbon when the OS prefers dark, else Goldenrod. `Shell.jsx` writes the choice to the root dataset and storage. `ok-on` defaults to white at `:root`; only Carbon overrides it (#07140d).

| Theme | Bed | Pane | Plate |
|---|---|---|---|
| Goldenrod (default) | #e0a526 | #f6f0dc | #1b1b1b |
| Paper | #e4e7ee | #ffffff | #14171f |
| Carbon (dark) | #121212 | #1f1f1f | #f6f0dc |
| Slate | #34414d | #e4e9ee | #17202a |
| Bottle green | #1f6b46 | #f6f0dc | #14231b |
| Vermilion | #c9321a | #f8f1e0 | #1d1613 |
| Indigo | #1d2b63 | #f4f1e6 | #0c1230 |

Carbon inverts the plate to ivory and lightens ok/bad/warn so they hold on dark panes.

### Named Rules
**The Same Grammar Rule.** A new theme is a new set of values for the 20 tokens and an entry in `lib/themes.js`. It never introduces a component rule.

## Do's and Don'ts

### Do:
- **Do** set all text at 15px and rank by weight, case, rule, or reversal.
- **Do** use 2px rules and 0 radius on every pane, control and menu.
- **Do** show state as a mark in a fixed cell: filled ok, hollow skipped, struck lapsed.
- **Do** put one reversed plate on each screen.
- **Do** reference tokens (`var(--pane)`, `var(--rule)`) and test a new surface in at least Goldenrod and Carbon.
- **Do** keep tabular numerals for counts, dates and totals.

### Don't:
- **Don't** use grey SaaS cards, big KPI numbers, display type, or gradients.
- **Don't** add a second type size, a radius, or a drop shadow.
- **Don't** colour a panel with ok, bad or warn; they mark state only.
- **Don't** put a literal colour in a component; add or change a theme token instead.
- **Don't** give a theme its own component rule.
