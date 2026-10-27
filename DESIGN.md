---
name: Snackible CRM
description: A darkroom under a safelight. A red room holds white record sheets laid over black under-sheets; state is hatching, never a new colour.
colors:
  safelight-red: "#c8000f"
  safelight-red-ink: "#b0000d"
  white-sheet: "#ffffff"
  sheet-wash: "#f2f2f2"
  ink-black: "#0a0a0a"
  graphite: "#4a4a4a"
  plate-muted: "#cfcfcf"
  paper-room: "#ececec"
  carbon-sheet: "#161616"
  carbon-wash: "#202020"
  carbon-rule: "#6d6d6d"
  carbon-ink: "#f5f5f5"
  carbon-muted: "#b8b8b8"
  carbon-red: "#ff3b47"
  carbon-red-ink: "#ff6670"
typography:
  display:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(40px, 6.4vw, 84px)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "0"
  headline:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(34px, 5vw, 56px)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "0.01em"
  title:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    letterSpacing: "0.06em"
  label:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.06em"
  body:
    fontFamily: "Roboto, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "Roboto Mono, ui-monospace, Consolas, monospace"
    fontSize: "18px"
    fontWeight: 700
rounded:
  none: "0"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  rail: "244px"
components:
  button:
    backgroundColor: "{colors.white-sheet}"
    textColor: "{colors.ink-black}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "38px"
    padding: "0 16px"
  button-primary:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.white-sheet}"
    rounded: "{rounded.none}"
    height: "38px"
  button-hover:
    backgroundColor: "{colors.sheet-wash}"
  panel:
    backgroundColor: "{colors.white-sheet}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.none}"
  input:
    backgroundColor: "{colors.white-sheet}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.none}"
    height: "40px"
    padding: "0 12px"
  nav-rail:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.white-sheet}"
    width: "244px"
  badge:
    backgroundColor: "{colors.white-sheet}"
    textColor: "{colors.safelight-red}"
---

# Design System: Snackible CRM

## Overview

**Creative North Star: "The Darkroom Record"**

The CRM is a darkroom under a safelight. A red room fills the margins, the top bar and the sign-in; the work sits on white record sheets, each laid over a black under-sheet turned a fraction of a degree, like exposure sheets stacked on a bench. Heavy tall caps name things, Roboto carries prose, Roboto Mono carries figures, dates and codes. The look is dense, ruled and flat: black hairlines, dotted row dividers, zero radius.

State is never a new colour. How busy a month was is hatch density; a quiet or lapsed account is cross-hatched in red; a month before the client existed is dotted. Inside the sheets colour is red, black and white only; the room around them can be any of seven themes (Safelight red by default, Amber, Green, Indigo, Slate, White, Black). Themes swap tokens and never change the grammar.

**Key Characteristics:**
- Red room, white sheets, black under-sheets and black nav sheet.
- Three type voices: tall caps for naming, Roboto for reading, mono for figures.
- State as hatching in a fixed cell (solid, 1-4 hatch densities, red cross-hatch, dotted).
- Zero radius everywhere; 2px control borders, 1px panel border, 3px and 6px structural rules.
- Red, black, white only; no second accent.

## Colors

Seven themes, one palette logic: a room colour, a sheet colour, and black or white ink. Safelight, Amber, Green, Indigo and Slate are rooms around the same white sheets and black rail; White and Black change the sheets too. Tokens are named by role in CSS (`--bed`, `--pane`, `--ink`, `--plate`, `--rail-bg`, `--bad`, `--badge`, `--ok`) and swap per theme.

### Primary
- **Safelight Red** (#c8000f): the room (`--bed`) in the default theme: page background, top bar, sign-in surround. Also the lapsed/quiet state (`--bad`), the nav extent bar, the phone Add cell, and the badge text.
- **Safelight Red Ink** (#b0000d): red text on white sheets (`--bad-ink`) for danger buttons, late figures and warning dt/dd, for contrast.

### Neutral
- **White Sheet** (#ffffff): panes (`--pane`), inputs, buttons, page and client head sheets; also the white-on-red text of the room.
- **Sheet Wash** (#f2f2f2): second surface (`--pane-2`): row hover, composer, plain chips, table hover.
- **Ink Black** (#0a0a0a): text, rules (`--rule`), the black under-sheets and primary buttons (`--plate`), the nav rail, and the "active/ok" fill (`--ok` is black here).
- **Graphite** (#4a4a4a): muted text and sample values (`--muted`).
- **Plate Muted** (#cfcfcf): muted text on black plates.
- **Paper Room** (#ececec): the room in the White theme; the badge turns red there.
- **Carbon theme**: room Ink Black, sheets Carbon Sheet (#161616), wash #202020, rules #6d6d6d, ink #f5f5f5; plate and rail invert to #f5f5f5; red lifts to #ff3b47 (ink #ff6670).

### Named Rules
**The Red Is State Rule.** Sheets, nav and marks use red, black and white only, in every theme; the room colour is the only other hue. Red always means quiet, lapsed or overdue. A new state is a new hatch or a new mark, never a new hue.
**The Red Is State Rule.** Red marks the room, lapsed/quiet/error, and the single Add affordance on phones. It is never decorative on a sheet.
**The Token Swap Rule.** Components read `--bed`, `--pane`, `--ink`, `--plate`, `--rail-bg`, `--bad`, `--ok`, `--badge`; a theme changes tokens only.

## Typography

**Display Font:** Big Shoulders (variable, opsz axis), with Arial Narrow fallback
**Body Font:** Roboto 400/500/700, with Segoe UI and system-ui
**Label/Mono Font:** Roboto Mono 400/500/700, with Consolas

**Character:** Condensed industrial caps against a plain humanist reader and a ledger mono. Names stand tall; prose stays quiet.

### Hierarchy
- **Display** (900, clamp 40px to 84px, 0.9): the client name on the client head, uppercase, balanced wrap.
- **Headline** (900, clamp 34px to 56px, 0.95): page titles; sign-in title 34px.
- **Title** (800, 22px): panel headings and empty states; attention-list names 21px; nav items 21px; rail brand 26px at 900.
- **Label** (700-800, 17px, 0.06em, uppercase): table heads, field labels, buttons (18px, 17px small), chips, tabs, steps, badges, definition terms.
- **Body** (400, 15px, 1.5): prose, table cells, hints; sentence case; page-head blurb capped at 72ch, lede at 80ch.
- **Figure** (Roboto Mono 700, 18px; 24px lead; 20px result totals): money, counts, dates, codes, month numbers (12px in cells), sync note 13px. Tabular numerals are on globally.

### Named Rules
**The Three Voices Rule.** Naming and labelling is tall caps; reading is Roboto; anything you could add up or look up is mono.
**The Sentence-Case Prose Rule.** Where condensed caps host explanatory text (panel sub-lines, legend, page-head paragraph), reset to Roboto sentence case.

## Layout

A two-column shell: a 244px black nav sheet floats sticky at left (16px inset, full height minus 32px), the main column holds a sticky 64px red top bar (white search up to 560px, sync note, white buttons, black Add) and a page capped at 1360px with 28px side padding. Content grids: overview two-col (fluid + 400px), client top (fluid + 360px), client body (fluid + 420px), review 1:1; all collapse to one column at 1100px. Rhythm is 6px (month cells), 10-14px (rows, padding), 16-22px (between sheets, 22px between panels).

At 860px and below the rail disappears, the top bar shows a logo mark, the page pads 12px (96px bottom), controls grow to 44px, grids go single-column, and a fixed black six-cell tab bar takes the bottom with a red Add cell. Month cells shrink to 34px with 3px gaps; mobile month labels drop to 12px.

## Elevation & Depth

Depth is paper on paper: a hybrid of a soft shadow and a physical under-sheet. Every `.panel`, page head, client head and the sign-in box lies on a black under-sheet drawn with a pseudo-element, offset down-right and rotated 0.35deg (panels) or 0.5deg (heads, sign-in). The head sheets settle into place on entry (0.5s ease-out), disabled under reduced motion.

### Shadow Vocabulary
- **Sheet shadow** (`box-shadow: 0 1px 0 rgba(0,0,0,0.25), 0 18px 30px -20px rgba(0,0,0,0.7)`): panels, heads, rail, results list, menus, sticky action bar, result grid.
- **Tab bar lift** (`0 -10px 24px -14px rgba(0,0,0,0.6)`): the phone tab bar.

### Named Rules
**The Under-Sheet Rule.** A raised surface is a white sheet over a turned black sheet, not a bare drop shadow. Hard offset shadows are not part of this system; the black sheet is a layer, not a shadow.
**The Settle Rule.** The only entrance motion is the head sheet settling (0.5s); fresh timeline rows fade 1.6s. Nothing shimmers; loading placeholders are plain blocks.

## Shapes

Zero radius on every control, sheet, chip and cell. Borders carry the form: 2px on buttons, inputs, search, notices and menus; 1px on panels; 3px under panel and table heads and top of totals; 6px under the page and client head; dotted 1px between rows. Cells and state marks are square (18px chip mark, 44px berth cells).

## Components

### Buttons
- **Shape:** square, 38px high (34px small, 44px/40px on phones), 2px ink border, 16px side padding, 18px tall-caps label.
- **Default:** white with ink text; hover shifts to the sheet wash.
- **Primary:** black plate with white text; hover adds an inset 2px white ring.
- **Quiet:** transparent, border appears on hover. **Danger:** red-ink text. **Pressed/expanded:** inverted ink fill. Disabled 45% opacity.
- Focus: 3px outline, white on the red room, ink on sheets, 2px offset.

### Chips (status marks)
An 18px square mark plus caps label. Active = solid black; watch = single 135deg hatch; lapsed = red border with red cross-hatch; new = hollow. A plain variant is a bordered wash tag without a mark.

### Cards / Containers (panels)
White, 1px ink border, sheet shadow, black under-sheet. Head: 22px title, 3px ink rule under, min 46px. Body padding 14px. Panels stack with 22px gaps.

### Inputs / Fields
White, 2px ink border, 40px minimum height, 12px padding, square. Labels above in tall caps, hints in graphite. Focus draws a 3px ink outline with no offset. Mono variant for codes and amounts.

### Navigation
Black rail with a white-ruled brand block; items are 21px tall caps with an 18px-padded row, hover washes 16% white, current page inverts to white on black. A 3px red extent bar under Clients, Leads and Unmatched shows relative size. Counts are white badges with red text. On phones, a black tab bar with 12px caps labels, inverted current tab, red Add cell.

### Berth strip (signature)
Twelve month cells, 44px tall with 6px gaps and 2px ink border, each holding a white mono order count. Fill is load 1-4 against the client's busiest month (minimum 4): hatch periods 9px, 6px, 5px (thicker line), then solid black. Empty month = hollow; before the client existed = dotted faded border; quiet since last order past 75 days = red cross-hatch. A mini variant (156px, 20px cells) sits in lists. Month labels below in caps; the current month is bold and underlined 3px.

### Fact, timeline and tables
Tables: caps heads over a 3px rule, dotted row dividers, wash hover. Timeline markers are 24px squares: black fill for notes, black ok fill for purchases. Fact rows are details with source tags (bordered caps; AI source in black plate).

## Do's and Don'ts

### Do:
- **Do** put every raised surface on a white pane with the black under-sheet (turned 0.35 to 0.5deg) and the sheet shadow.
- **Do** express new states as hatch patterns in the 18px mark or month cell, using ink or red only.
- **Do** use Big Shoulders caps for names and labels, Roboto 15px for prose, Roboto Mono for figures.
- **Do** keep radius at 0 and borders at 1px, 2px, 3px or 6px by role.
- **Do** switch themes only by swapping tokens; check red-on-white uses `--bad-ink`.

### Don't:
- **Don't** introduce a second accent or any hue beyond red, black, white.
- **Don't** use grey SaaS cards, rounded corners, hero metrics or gradients other than hatching.
- **Don't** set prose in the condensed caps face; reset to Roboto sentence case.
- **Don't** let red decorate; it means room, lapsed, error or Add.
