---
name: SuperLanguage Learner UI
description: Paper-grounded learning, vocabulary, and AI conversation surfaces for Vietnamese learners.
colors:
  ground: "#f3f0e5"
  paper: "#fbf9f2"
  ink: "#183248"
  text: "#314a57"
  muted: "#5c7078"
  rule: "#d7d9d2"
  teal: "#117e83"
  teal-soft: "#e3eeea"
  signal: "#9e402c"
  signal-soft: "#f5e4db"
  highlight: "#e8d28b"
  teal-deep: "#0c696e"
  nav-cue: "#e58b68"
typography:
  display:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.16
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "clamp(1.35rem, 2.5vw, 1.8rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.96rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
  data:
    fontFamily: "DM Mono, monospace"
    fontSize: "1.35rem"
    fontWeight: 600
rounded:
  control: "4px"
  base: "6px"
  room: "16px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  primary-action:
    backgroundColor: "{colors.teal}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "42px"
  secondary-action:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "42px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 13px"
    height: "46px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0px"
    padding: "17px 12px"
---

# Design System: SuperLanguage Learner UI

## Overview

**Creative North Star: "Bản thu lời thoại"**

The shared learner surfaces read like a working transcript on warm paper: deep blue ink organizes the page, teal marks useful learning actions, and coral appears sparingly as a cue. Thin rules and open, list-first sections keep attention on lesson paths, saved words, and conversation rather than on ornamental containers.

The locally hosted Be Vietnam Pro family carries Vietnamese interface copy; DM Mono is reserved for numeric learning data. Learning and vocabulary use a quiet single-column reading rhythm. Conversation retains a distinct two-part workspace, with setup and history beside the transcript on wide screens and before it on narrow screens.

**Key Characteristics:**
- Warm paper ground, dark ink navigation, teal actions, restrained coral cues.
- Thin dividers and flat list surfaces; rounded controls remain compact.
- Vietnamese-capable local font assets and responsive navigation.

## Colors

Warm, low-chroma paper and blue-ink neutrals carry most of the interface; teal denotes active learning, while coral and ochre stay as small signals.

### Primary
- **Deep Blue Ink:** Shared navigation, headings, and primary text.
- **Learning Teal:** Primary study actions, focus indication, and active learning cues.

### Secondary
- **Soft Teal Wash:** Quiet supporting fill for language and state chips.
- **Coral Signal:** Limited supporting cue, including the AI-related action treatment.

### Tertiary
- **Paper Highlight:** Selection highlight, not a large surface fill.
- **Navigation Coral:** Fine active-navigation underline.

### Neutral
- **Warm Ground:** Main page background.
- **Warm Paper:** Input and content surfaces.
- **Blue-Gray Text:** Supporting body copy.
- **Muted Blue-Gray:** Secondary labels and explanatory text.
- **Paper Rule:** Thin separators and understated borders.

### Named Rules
**The Ink-and-Action Rule.** Keep teal for actions and focus; let ink carry navigation and reading hierarchy.

## Typography

**Display Font:** Be Vietnam Pro (with sans-serif fallback)  
**Body Font:** Be Vietnam Pro (with sans-serif fallback)  
**Label/Mono Font:** DM Mono (with monospace fallback) for numeric learning data.

**Character:** A clear, neutral sans with Vietnamese glyph coverage supports everyday scanning; the restrained mono treatment distinguishes figures without turning the interface into a dashboard.

### Hierarchy
- **Display** (500, responsive 2–2.5rem, 1.16): Learner page headings.
- **Headline** (500, responsive 1.35–1.8rem): Section headings for overview, review, and catalog regions.
- **Title** (600, 1rem): List and card titles; keep them subordinate to the page heading.
- **Body** (400, 0.96rem, 1.65): Explanatory and learning copy; longer introductions cap near 64ch.
- **Label** (500–600, 0.76–0.88rem): Navigation, controls, and compact metadata.
- **Data** (600, 1.35rem): Tabular learning figures in DM Mono.

### Named Rules
**The Local Voice Rule.** Use the bundled Be Vietnam Pro faces for learner-facing Vietnamese text; use DM Mono only where numeric data benefits from tabular forms.

## Layout

Learning and vocabulary share a centered content column capped at 1200px, with 48px total desktop side allowance and generous vertical breathing room. Their catalog content resolves into a single, divider-led list rather than a dashboard of floating cards.

The chat workspace pairs a setup/history column with a larger conversation panel at desktop widths. At 760px the shared navbar becomes a two-row layout with horizontally scrollable navigation; below the chat’s 700px breakpoint, setup and history stack before the conversation. Learning and vocabulary tighten their page gutters at 520px, and topic/word grids collapse to one column. Controls preserve touch-sized targets (generally 42–46px) and the layout supports viewports down to 320px.

**The List-First Rule.** Use a clear heading, searchable controls, and thin rules to organize learning content; do not turn every row into an independent card.

## Elevation & Depth

Learning and vocabulary content is flat: hierarchy comes from paper/ground contrast, spacing, and thin rules, not shadows. The chat workspace retains subtly rounded, lightly lifted panels as a functional exception; dropdowns also use a restrained shadow. Focus is communicated with a visible teal outline or a small teal-tinted field ring.

### Shadow Vocabulary
- **Chat workspace:** A very low-opacity shadow on setup and practice panels separates the two functional regions without changing the flat catalog language.
- **Open menus:** A soft blue-ink shadow distinguishes the dropdown from the page beneath it.

### Named Rules
**The Quiet Depth Rule.** Keep list and catalog surfaces flat; reserve soft elevation for overlays and the bounded conversation workspace.

## Shapes

Controls and compact chips use gently squared corners (4px); the shared base radius is 6px. Catalog rows and section surfaces stay square-edged with single-pixel dividers. Chat’s bounded setup and conversation panels use the larger 16px room radius, maintaining a clear functional distinction from learning lists.

## Components

### Buttons
- **Shape:** Compact, gently squared controls (4px radius); primary actions are at least 42px high and mobile targets are raised to at least 44px.
- **Primary:** Teal fill, white text, and 9px × 14px padding; hover deepens the teal.
- **Secondary:** Transparent fill with a fine blue-gray border; hover may add a soft teal wash.
- **Text action:** Teal text with no persistent filled surface.
- **Focus / Disabled:** A 3px teal focus outline remains visible; disabled actions reduce opacity and do not imply availability.

### Chips
- **Style:** Compact, lightly tinted teal chips with squared-soft corners and dark teal text.
- **State:** Selected filters gain a slightly stronger teal border; keep inactive filters quiet and readable.

### Cards / Containers
- **Corner Style:** Learning/catalog regions are flat and square; chat panels use 16px corners.
- **Background:** Warm paper for controls and bounded chat surfaces; the larger page stays on warm ground.
- **Shadow Strategy:** See Elevation & Depth; do not add card shadows to catalog rows.
- **Border:** Use a thin rule, commonly at the top or between rows.
- **Internal Padding:** 16–24px is common for content sections; chat setup has compact internal spacing.

### Inputs / Fields
- **Style:** Warm paper fill, one-pixel blue-gray border, 4px corners; search and select controls are 46px high.
- **Focus:** Teal border and a restrained two-pixel teal-tinted ring; global keyboard focus remains a clear 3px outline.
- **Disabled:** Preserve legibility and communicate unavailable chat input without changing the palette.

### Navigation
- **Style:** Shared deep-ink bar with light text, a fine bottom rule, and a coral underline for the active destination.
- **Typography:** Be Vietnam Pro at compact label sizes; active and hover links brighten while retaining the underline cue.
- **Mobile:** Brand and account actions share the first row; navigation occupies the second, scrollable row at 760px and below.

### Conversation Workspace
- **Composition:** Keep session setup and history in the quieter side column; the transcript and composer occupy the main panel.
- **State:** A small teal status cue identifies readiness; keep the composer anchored at the bottom of the conversation panel.
- **Responsive:** Stack setup/history before the practice panel; hide the voice-button text at narrow widths while retaining its control.

## Do's and Don'ts

### Do:
- **Do** use the documented warm-ground, paper, ink, teal, coral, and rule palette for shared learner surfaces.
- **Do** favor flat, divider-led lists for lesson paths, saved topics, and vocabulary results.
- **Do** retain Vietnamese-capable local typography, clear focus indicators, and mobile touch targets.
- **Do** preserve the conversation panel’s distinct transcript-and-composer structure.

### Don't:
- **Don't** promote legacy or overridden styling into learner-world tokens; use the shared learner palette as the source for these surfaces.
- **Don't** add shadows to ordinary catalog rows or replace the list rhythm with a grid of floating cards.
- **Don't** use the coral or ochre cue colors as broad page backgrounds or competing primary actions.
