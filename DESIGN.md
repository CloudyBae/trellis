---
name: Trellis
description: A quiet garden where you can watch your agents work.
colors:
  ground: "#EDF1E9"
  ground-2: "#E4EADF"
  pane: "#F7F9F4"
  ink: "#223020"
  ink-2: "#414D3C"
  ink-3: "#56624F"
  rule: "#D5DDCF"
  wire: "rgba(34, 48, 32, 0.055)"
  stem: "#7C9A6A"
  stem-lit: "#2F4A2A"
  leaf: "#86B06C"
  leaf-soft: "#A9C798"
  pollen: "#E0BE5E"
  pollen-ink: "#7A5C0C"
  rose: "#CF877B"
  rose-ink: "#9A4436"
  bloom: "#A99BCF"
  bloom-ink: "#5F4F93"
  st-blocked: "#F2EBCB"
  st-failed: "#F3E0DA"
  st-complete: "#E9E6F2"
  pod-running: "#DCEACF"
  pod-waiting: "#E2E7DC"
  wash: "rgba(124, 154, 106, 0.10)"
  wash-strong: "rgba(124, 154, 106, 0.18)"
  focus: "#3E6A34"
  ground-dark: "#1A1A19"
  ground-2-dark: "#252523"
  pane-dark: "#20201F"
  ink-dark: "#ECEBE6"
  ink-2-dark: "#C3C1B9"
  ink-3-dark: "#98968E"
  rule-dark: "#33332F"
  wire-dark: "rgba(236, 235, 230, 0.05)"
  stem-dark: "#7A9868"
  stem-lit-dark: "#D6E6C8"
  leaf-dark: "#8DBA73"
  leaf-soft-dark: "#45503D"
  pollen-dark: "#D9B85A"
  pollen-ink-dark: "#E6C972"
  rose-dark: "#D08A80"
  rose-ink-dark: "#E9A499"
  bloom-dark: "#B3A5DD"
  bloom-ink-dark: "#C7BCEA"
  st-blocked-dark: "#2C291B"
  st-failed-dark: "#2E2322"
  st-complete-dark: "#26242E"
  pod-running-dark: "#252C21"
  pod-waiting-dark: "#292927"
  wash-dark: "rgba(236, 235, 230, 0.05)"
  wash-strong-dark: "rgba(236, 235, 230, 0.09)"
  focus-dark: "#A9D38F"
typography:
  display:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "lnum"
  quote:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  state:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  section:
    fontFamily: "Alegreya Sans, Gill Sans, Optima, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "0"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  chip: "7px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  panel: "14px"
  node: "16px"
  pane: "18px"
  pod: "50% 50% 47% 47% / 56% 56% 44% 44%"
spacing:
  hair: "2px"
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "28px"
  xl: "36px"
  lane: "20px"
  lane-narrow: "13px"
components:
  view-switch:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
    padding: "3px"
  view-switch-option:
    textColor: "{colors.ink-2}"
    rounded: "9px"
    padding: "5px 13px"
  view-switch-option-active:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "9px"
    padding: "5px 13px"
  count:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px 5px 8px"
  count-hover:
    backgroundColor: "{colors.wash}"
  count-complete:
    textColor: "{colors.ink-3}"
  run-status:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.state}"
    rounded: "999px"
    padding: "2px 10px 2px 6px"
  run-status-needs-you:
    backgroundColor: "{colors.st-blocked}"
    textColor: "{colors.pollen-ink}"
  run-status-failed:
    backgroundColor: "{colors.st-failed}"
    textColor: "{colors.rose-ink}"
  run-status-done:
    backgroundColor: "{colors.st-complete}"
    textColor: "{colors.bloom-ink}"
  alert-pill:
    backgroundColor: "{colors.st-blocked}"
    textColor: "{colors.pollen-ink}"
    rounded: "999px"
    padding: "2px 6px 2px 4px"
  chip:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.chip}"
    padding: "3px 8px"
  timeline-row:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "60px"
  timeline-row-hover:
    backgroundColor: "{colors.wash}"
  timeline-row-selected:
    backgroundColor: "{colors.wash-strong}"
  timeline-return-row:
    textColor: "{colors.ink-3}"
    height: "38px"
  pod-waiting:
    backgroundColor: "{colors.pod-waiting}"
    rounded: "{rounded.pod}"
    size: "58px"
  pod-running:
    backgroundColor: "{colors.pod-running}"
    rounded: "{rounded.pod}"
    size: "58px"
  pod-blocked:
    backgroundColor: "{colors.st-blocked}"
    rounded: "{rounded.pod}"
    size: "58px"
  pod-failed:
    backgroundColor: "{colors.st-failed}"
    rounded: "{rounded.pod}"
    size: "58px"
  pod-complete:
    backgroundColor: "{colors.st-complete}"
    rounded: "{rounded.pod}"
    size: "58px"
  pod-settled:
    backgroundColor: "{colors.st-complete}"
    rounded: "{rounded.pod}"
    size: "40px"
  status-panel:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.panel}"
    padding: "16px 18px"
  status-panel-blocked:
    backgroundColor: "{colors.st-blocked}"
  status-panel-failed:
    backgroundColor: "{colors.st-failed}"
  status-panel-complete:
    backgroundColor: "{colors.st-complete}"
  reading-pane:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pane}"
    padding: "30px 36px 56px"
    width: "40%"
  child-row:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "7px 8px"
  tool-output:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  verdict-mark:
    size: "24px"
  verdict-mark-coarse:
    size: "44px"
  verdict-mark-face:
    rounded: "50%"
    size: "16px"
  verdict-mark-hover:
    backgroundColor: "{colors.wash-strong}"
  verdict-mark-pass:
    textColor: "{colors.ink}"
  verdict-mark-fail:
    textColor: "{colors.rose-ink}"
  verdict-mark-unknown:
    textColor: "{colors.ink-3}"
  verdict-mark-not-eligible:
    textColor: "{colors.ink-3}"
  verdict-mark-running:
    textColor: "{colors.ink-3}"
  change-group-heading:
    textColor: "{colors.ink-2}"
    typography: "{typography.section}"
  change-group-heading-fewer:
    textColor: "{colors.rose-ink}"
  ledger-entry:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "14px 16px 16px"
  ledger-entry-hover:
    backgroundColor: "{colors.wash}"
  ledger-entry-open:
    backgroundColor: "{colors.wash-strong}"
  evidence-rail:
    textColor: "{colors.ink}"
    padding: "0 0 0 18px"
  evidence-chip:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.chip}"
    padding: "4px 8px"
  unchanged-fold:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  unchanged-fold-hover:
    backgroundColor: "{colors.wash}"
  validity-column:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink-2}"
    rounded: "18px 0 0 0"
    padding: "26px 30px 24px"
    width: "420px"
  measure-row:
    textColor: "{colors.ink}"
    padding: "10px 0"
  key-line:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink-3}"
    padding: "12px 30px"
---

# Design System: Trellis

## Overview

**Creative North Star: "The Trained Vine"**

Trellis draws a multi-agent run as a plant trained on wires. Delegation is a fork in a moss hairline stem, a return is the stem curving back in, and every agent's state is a small botanical glyph: a leaf that sways while running, a closed bud while waiting, a pollen-yellow bud with a tie when blocked, a dusty-rose wilted leaf when failed, a lilac bloom when complete. The botany is structural, never ornamental: stems only ever mean "who delegated to whom", leaves on a stem only ever mean tool calls.

The ground is a pale sage field, not cream, with the canonical scheme light. A neutral charcoal dark scheme (warm graphite ground #1A1A19, no green cast; only stems, leaves and state glyphs stay green) follows `prefers-color-scheme` until the viewer picks light or dark with the header sun/moon switch. That choice is stored per viewer, and picking the system's own scheme returns control to the system. Hierarchy comes from type scale, weight and whitespace rather than boxes: agent names sit on the ground in bold humanist sans, a small quiet number after them only when siblings share the name. Two views share the same vocabulary. Tree (default) hangs the orchestrator at the top-left post and its agents below on wires, each in a soft state-tinted pod; Timeline grows downward in git-graph lanes with rows of text to the right. A reading pane on the right (about 40%) opens whatever is selected.

Density is calm: generous row heights, a single accent family, and motion that only ever means growth. The system refuses the node-box canvas, the trace waterfall and the dark metrics console.

**Key Characteristics:**
- Pale sage ground with faint vertical trellis wires; a neutral graphite night twin.
- Moss hairline stems (1.5 to 1.6px) that fork, grow and merge; selection traces the ancestry in a higher-contrast ink.
- Five botanical SVG state glyphs, used identically in the graph, the counts, the legend and the pane.
- No cards around nodes; the only filled containers are state-tinted pods, the status panel, chips and tool output.
- Alegreya Sans for everything human; JetBrains Mono only for paths, commands, ids and timings.
- Attention travels in three quiet places and nowhere else: the run status chip beside the run name, a labelled pill on the switcher for other runs, and a bud on the browser-tab icon with a state prefix in the tab title. None of them move, sound or interrupt.
- Sibling numbers, written as the name followed by a small quiet figure ("Researcher 2"). They count same-name agents under one parent in start order and appear only when a parent has two or more of that name. There is no "№" sign anywhere: the glyph is heavy and awkward in Alegreya Sans.
- Grades on the evaluation view are their own family of small drawn verdict marks in ink, not botanical glyphs, so a grade never reads as an agent state.

## Colors

A soft natural palette: sage and moss neutrals carry almost everything, and four botanical hues (leaf, pollen, rose, bloom) appear only where they mean a state.

### Primary
- **Moss Stem** (stem): every delegation line, the handoff rail, list markers, underline color for in-text links, the waiting-bud outline.
- **Deep Moss Ink** (stem-lit): the traced ancestry stem and the selected pod's outline ring. In the dark scheme it inverts to a pale sprout green so the trace still reads as "more ink".
- **Fern Focus** (focus): focus outlines (2px, offset 2px) and the text caret.

### Secondary
- **New Leaf** (leaf): the running glyph, tool-call leaves on stems (at 0.75 opacity in Timeline), the sprout at a growing tip.
- **Pale Leaf** (leaf-soft): text selection only.

### Tertiary (state hues, each paired with a legible ink)
- **Pollen** (pollen / pollen-ink): the blocked bud and the bloom's centre; its ink carries "blocked" state words and the "synthetic demo" label.
- **Dusty Rose** (rose / rose-ink): the failed wilted leaf; its ink carries "failed" state words, failed return summaries and failed tool timings.
- **Lilac Bloom** (bloom / bloom-ink): the complete bloom; its ink carries "complete" state words.
- **State tints** (st-blocked, st-failed, st-complete, pod-running, pod-waiting): the fills behind pods in Tree and behind the status panel in the pane. They are washes of the state hue, never saturated fills.

### Neutral
- **Sage Field** (ground): page ground; also the running/waiting status panel and tool-output blocks inside the pane.
- **Deep Sage** (ground-2): the view-switch track and chips.
- **Paper Leaf** (pane): the reading pane and the active view-switch option.
- **Forest Ink** (ink), **Bark** (ink-2), **Lichen** (ink-3): primary text, secondary text (activity lines, section heads), quiet metadata (numbers, sources, timestamps, labels).
- **Hairline** (rule): pane border, conversation dividers, legend and footer rules, scrollbar thumb.
- **Trellis Wire** (wire): the faint vertical lane wires in Timeline.
- **Wash / Wash Strong** (wash, wash-strong): hover and selected backgrounds on rows, counts and list buttons.

### Named Rules
**The Sage-Not-Cream Rule.** The light ground is a cool pale sage (ground). Warm cream or paper-white grounds are a different world.

**The State Owns the Hue Rule.** Pollen, rose and bloom appear only to mean blocked, failed and complete. Running is leaf green; waiting is the neutral outline bud. No other element borrows a state hue.

**The Gave-Up Rule.** A subagent that hands back right after a failed tool call is failed, not complete: it gave up on a failure, so it takes the rose pod, the wilted leaf and the failed count, and the run says "Agent failed". A subagent that hit a failed call and went on to another call keeps its state; the failed call shows as a notched leaf and a count ("1 call failed") on the run chip and menu note. The orchestrator is never marked this way.

**The Needs-You Rule.** An agent's state keeps its state name everywhere: running, waiting, blocked, failed, complete. "Needs you" is the call to action on a run or session and appears only where something is blocked: the status chip, the switcher pill, the menu note and the tab title. Failure on a run reads "Run failed" or "Agent failed", never a bare "Failed". Nothing in the UI says "blocked" and "needs you" for the same thing in the same place.

**The Ink Pair Rule.** Every state hue used as a fill has a darker (light scheme) or lighter (dark scheme) ink partner for text; state words are never set in the raw fill color.

**The Grade Is Not a State Rule.** Grades never borrow agent-state hues: no grade, change word, heading or entry on the evaluation view uses leaf, pollen or bloom, a state tint, a pod or a botanical glyph (the header's mark and the pollen-ink "synthetic demo" tag belong to the shell, not to grades). Pass is Ink, not green. Rose-ink is the one shared ink and means failure only: the failed cross, the "failed" check word, the "Fewer passed" heading and its "fewer passed" change words, an open entry's change line when its selected trial failed, and the regression count. Failure always keeps its cross or its word, so hue is never the only signal.

## Typography

**Display Font:** Alegreya Sans (with Gill Sans, Optima, system sans fallback), self-hosted at 400, 500, 700
**Body Font:** Alegreya Sans
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo fallback), self-hosted

**Character:** A humanist sans with calligraphic warmth carries the cute-but-serious voice; a plain mono appears only where the text is machine text.

### Hierarchy
- **Display** (700, 30px, 1.15, -0.025em, balanced wrap): the selected agent's name at the top of the reading pane. One per screen.
- **Headline** (700, 20 to 21px): the orchestrator's name, in Tree and Timeline.
- **Title** (700, 16.5 to 17.5px): agent names on nodes and rows, the run name and wordmark (17px).
- **Body** (400, 16px, 1.5, lining numerals): status text and general reading. Handoff quotes step up to 17px at 1.55 with a 62ch measure; conversation turns run at 15.5px with a 64ch measure; activity lines are 14 to 15px in Bark.
- **Section** (700, 15px, Bark, sentence case): pane section heads such as "Handed in by Orchestrator", "Conversation".
- **State word** (500, 13.5 to 14px): the lowercase state name in its ink color.
- **Label** (400, 12 to 13.5px, Lichen): numbers, sources, timestamps, turn attributions, legend, count captions.
- **Mono** (400, 11.5 to 12.5px, -0.01em, tabular): tool names and targets, timings, file paths, chips, tool output (12px/1.6).

### Named Rules
**The Mono-for-Machine Rule.** JetBrains Mono is reserved for paths, commands, ids and timings. Names, tasks, summaries and conversation stay in Alegreya Sans.

**The Tabular Clock Rule.** Anything that ticks (counts, clocks, elapsed times, agent numbers) uses tabular figures so updates never jitter.

**The Quiet Label Rule.** Section heads and labels are sentence case at normal tracking. Hierarchy comes from size and weight, not capitals or letter-spacing.

## Layout

A two-column shell on desktop: the garden (graph) takes the remaining width (about 60% at 1440) and the reading pane takes `minmax(360px, 40%)`. A slim top line spans both: the mark and lowercase wordmark; the run name as a session switcher with its status chip and the synthetic tag beside it and the meta beneath (the line wraps the chip below the name when the width runs out); the five state counts right after it, so the run's identity and its state read together; and the Tree/Timeline switch and theme toggle pushed right. Top padding is 16px 28px 14px with 32px gaps (24px under 1280px). Under 1280px the counts drop their captions and keep glyph and number (tooltips carry the words), except blocked and failed, which keep their word while non-zero; under 1100px the header may wrap; under 900px the wordmark text is dropped, the switcher pill drops its words and keeps glyph and count, the switcher becomes a full-width sheet, the tap targets grow to 44px, and the garden is the only vertical scroller (the tree never scrolls inside its own box).

**Timeline** is laid out in lanes: lane pitch 20px starting 26px from the left (13px and 16px under 900px). A spawn row is 60px tall (84px narrow; plus 30px when its handoff chips show), a return row 38px (60px narrow), and a closing "Now" row 52px. Text begins 30px to the right of the deepest lane. The view follows the growing tips until the viewer scrolls back or selects a row, so a selected row never scrolls away while its pane is read.

**Tree** hangs the orchestrator from a post at the top-left and its children from a horizontal wire 34px below it, wrapping to a new wire (30px tier gap) when a row fills. Each node gets a 152px column (132px narrow); settled complete branches collapse to 90px columns (78px narrow) with 40px pods. A child sits 60px below its wire; a level is pod (58px) + label reserve + wire (20px) + drop (60px) tall. The label reserve is measured, not fixed: a hidden full-length label (a two-line task name, a long tag, the state word and a three-line activity) is measured at the current fonts, zoom and column width, which is 150px at default type (108px for the orchestrator's label). It follows text zoom, minimum font size and font loading, but never the live content, so a growing run never moves a drawn node. The trailing padding after a row's last column never widens the graph past its width, so the tree never scrolls sideways unless one branch alone is wider than the screen. Jumping to an agent keeps the orchestrator in view when both fit on screen (and does not move when both already show), otherwise scrolls the least distance, and pans sideways when the agent sits in a branch wider than the screen. Each node's spoken name includes "delegated by" and its parent, so the hierarchy survives wrapping for screen readers.

**Reading pane** content is capped at 640px with 30px 36px 56px padding; sections are separated by 36px above each head. Under 900px the shell becomes one column, the counts spread into a five-column grid, the switch goes full-width, source columns hide, and the pane becomes a full-screen sheet that slides up from the bottom with a "Back to the run" control.

**Evaluation view** (`?evals`; `?evals=live` for an experiment still running) keeps the top line and replaces the graph and reading pane with two columns: the change ledger (`minmax(0, 1fr)`) and a fixed 420px right column for validity and measures (about 29% at 1440; the direction contract asked for about 31%, the build fixes the width). Each column scrolls on its own; the right column's key line stays pinned to its foot. The ledger is padded 6px 28px 28px, change groups sit 22px apart, and the unchanged line sits 24px below the last group under a hairline. The ledger is an inline-size container, so entries answer the column's width, not the window's: from 760px an entry is its text at left and its two-row mark grid at right (24px apart), and an open entry sets Expected and Delivered side by side (20px gap); under 760px the mark grid drops under the text, start-aligned, and the two rails stack. Under 900px of viewport the shell becomes one column and the page scrolls as a whole: the right column follows the ledger as a normal section with a hairline above it (no sheet, no rounded corner, no left edge), side padding drops to 16px, the key line is hidden, and the meta line wraps instead of truncating. On desktop the first entry of the first change group opens on its default trial; under 900px nothing is open on first paint. Nothing reorders while trials arrive.

Rhythm steps are 2, 6, 10, 16, 28 and 36px; row interiors use 6 to 10px gaps.

## Elevation & Depth

The garden is flat. Depth comes from tonal layering: the pane (pane) sits one step lighter than the ground in light and one step lifted in dark, separated by a hairline left border and an 18px top-left corner. Only two soft shadows exist, both functional: the active view-switch option (`0 2px 8px -4px`, in pod-shadow), and the mobile reading sheet when open (`0 10px 30px -12px`). In the Timeline, unselected branches recede to 0.6 opacity (0.55 in Tree) when something is selected, which is the main depth cue.

### Shadow Vocabulary
- **Switch lift** (`box-shadow: 0 2px 8px -4px rgba(34, 48, 32, 0.5)`; dark `rgba(0, 0, 0, 0.8)`): the pressed view option only.
- **Sheet** (`box-shadow: 0 10px 30px -12px rgba(34, 48, 32, 0.25)`; dark `rgba(0, 0, 0, 0.6)`): the mobile reading pane when open.

### Named Rules
**The Flat Garden Rule.** Nothing in the graph casts a shadow. Selection is shown by ink (the lit stem), a wash, or an outline ring, never by lifting.

## Shapes

Soft, rounded, organic. Interactive surfaces use gentle radii: chips 7px, summary rows 8px, counts, list buttons and tool output 10px, rows and the switch 12px, the status panel 14px, node hit areas 16px, the pane corner 18px. Pods are not circles but seed shapes (`50% 50% 47% 47% / 56% 56% 44% 44%`), slightly fuller at the top. Stems have round caps. In Tree, stems route orthogonally with 10 to 12px quarter-curve corners; in Timeline, forks and merges are single cubic curves. Borders are 1px hairlines, used only for dividers, never to enclose a node.

### State glyphs (20 x 20 viewBox, centred)
One drawing rule holds the set together: a 1.2 to 1.4 edge in the state's own ink, round joins and caps, and a short stem where the form has one.
- **running**: an upright almond leaf in leaf on a short stem, with a half-opacity leaf-ink midrib; sways ±7deg about its base over 3.6s.
- **waiting**: a closed bud on a short stem, a half-opacity leaf-soft fill and a 1.4px leaf-ink outline.
- **blocked**: the pollen bud bound with crossed twine, held shut and unable to open. One object, so it cannot be misread at 15px as a pair of shapes (a stake beside the bud read as cutlery), and the crossed binding keeps it from reading as an acorn.
- **failed**: a leaf in rose tilted 30deg from a short straight stem, its tip torn into a fork (the same notch as the failed-call leaf on stems), with a half-opacity rose-ink vein. The torn tip is what stops it reading as a pepper.
- **complete**: five rotated elliptical petals (rx 3.2, ry 4.6) with a bloom-ink outline, scaled to 0.84 so the bloom is not heavier than the others, around a pollen centre (r 2.3).
- **sprout**: a hooked stem with one small leaf; marks a growing tip in Timeline and pulses in scaleY (0.85 to 1.1, 2.8s).

### Brand mark
The wordmark is "trellis", lowercase, in Quicksand 600 at 22px with -0.015em tracking. It is the only place a second sans is used: a soft, rounded face that carries the calm, cute side of the brand, while everything else stays in Alegreya Sans. Never set the name in the UI face, and never in capitals.

The mark is a seedling: a straight stem with two outlined leaves, a smaller one to the left and a larger one to the right, drawn in `stem` with a 1.8px round stroke, round joins and no fill. The leaves are unequal on purpose. It sits at 24px before the bold "Trellis" wordmark in the header and doubles as the browser-tab icon, where the same drawing on a tight box gains a state bud (see Browser tab). It is the only two-leaf drawing in the product: the Timeline's sprout glyph is a one-leaf growing tip, and an unknown-role agent is an acorn. It is deliberately soft and curved; earlier straight-line lattice marks read as crossed swords and were dropped, so never use crossing straight lines in the mark.

### Role icons (24 x 24 viewBox, 1.7px round stroke, currentColor, no fill)
Each agent role has one authored line icon, which answers "what is this?" while the state badge answers "how is it doing?": Orchestrator (a node branching to three), Explorer (a magnifier), Planner (a clipboard with two checked items), Implementer (`</>` brackets), Security reviewer (a shield with a check), Docs writer (a page with a folded corner), Test writer (a flask), Type checker (a "T" in a rounded square), Fixer (a wrench), Test runner (a play triangle in a circle). An unknown role falls back to an acorn (a cap over a nut): a quiet garden object for an agent that has not grown into a role, deliberately not a seedling, leaf or stem, which are reserved for the brand mark, tool calls and delegation. It is an ink line icon at role size, so it stays apart from the blocked state's pollen bud, which is badge-sized and keeps its crossed twine. Sizes: 46% of a Tree pod, 24px in the pane header pod, and 17px before the name in Timeline rows.

### Traced path (selection)
Selecting an agent lights its ancestry with color alone. There is no halo, glow filter, or motion in either mode. The stem turns `stem-lit` at about 2.2px: pale mint #D6E6C8 on dark charcoal, where the contrast reads as a glow by itself, and a clean mid green #3F8F2F on light. Unrelated stems dim gently (to 0.55 to 0.6 opacity). The selected pod's ring uses the same `stem-lit`. The owner reviewed halo, neon-tube and spotlight treatments for light mode and declined all of them as too much for the minimalist aesthetic, so keep this quiet.

### Connection states
A connection carries the state of the agent at its end. While that agent is still working (running, waiting or blocked, meaning it has not yet returned) the stem is `stem-active` (mid green #5EA346 on light, #8DBA73 on dark) and its tool-call leaves keep the leaf green. Once the agent has returned, the stem, its leaves and its fork knot fade to `stem-done` (#C6D1BE light, #454C41 dark) over 700ms, so a finished branch recedes and live work is the brightest thing on the page. The selected path overrides both with `stem-lit`. Unselected stems drop only to 0.85 opacity when something is selected, because state color already does the emphasising.

### Continuity of motion
Nothing that loops may restart when the view redraws. Every redraw re-pins looping animations (breathing ring, pulsing dot, leaf sway) to the page clock, stems keep a stable identity per agent so they draw in once, and layout changes glide: pods and stems ease to their new position over 650ms, tool-call leaves fade back in afterwards, and a pod's tint eases when its state changes. Gliding stems use CSS `d` transitions, so browsers without them fall back to a clean snap for both pods and stems.

### Stem vocabulary
- **Timeline stem**: 1.5px stem, round cap; lit 2.1px stem-lit. A fork is a cubic from the parent lane into the child lane ending at the spawn row; a merge is a cubic from the child lane back into the parent just below the return row. Live agents carry their 16px state glyph at the fork and a 14px sprout at the growing end; finished agents keep a 3.2px stem-colored knot at the fork and flower with the same 16px final glyph at the merge.
- **Tree stem**: 1.6px, lit 2.2px, routed down from the parent, across the wire, and down into the child pod, stopping 8px above it.
- **Tool-call leaves**: one leaf per tool call, alternating sides of the stem. Both views draw the same 11px almond path (Timeline at 0.9 scale, 0.75 opacity), capped at four. Leaves carry a 0.9 edge in their own ink (leaf-ink, rose-ink), like the state glyphs, so they hold 3:1 against the light ground; returned leaves keep the fill faded and the edge at half strength. A failed call uses a notched-tip variant in rose, so failure does not rest on hue alone. One `ToolLeaf` component and one stylesheet draw the leaf in the tree, the timeline and the legend.
- **Wires**: 1px vertical lines in wire at each Timeline lane.

### Verdict marks (14 x 14 viewBox drawn at 10px)
Grades have their own small family, drawn in ink and never botanical. Each mark is drawn at 10px, centred in a 16px round face, inside a 24px slot (44px under a coarse pointer). Slots sit edge to edge with no gap, so faces are 8px apart. One component draws every mark on the evaluation view: closed entries and the unchanged line show them as static, hidden images (the entry's name button carries a spoken summary instead), and only the open entry's marks are buttons.
- **passed**: a filled ink disc (r 5.2).
- **failed**: a rose-ink cross (`M3.2 3.2 10.8 10.8M10.8 3.2 3.2 10.8`, 1.8 stroke, round caps). The cross is the signal; the hue repeats it.
- **unknown**: a hollow ink-3 ring (r 4.6, 1.6 stroke).
- **not eligible**: the same ring, dashed `2.2 2` with butt caps.
- **running**: a small open ink-3 ring (r 2.5, 1.6 stroke) that pulses like the running state dot (2.8s, 0.35 to 1 opacity) and is still under reduced motion.
- **States:** hover washes the face of a mark button in wash-strong. The selected trial rings its round face with a 2px stem-lit outline at 2px offset, the selected-pod ring. Keyboard focus is a distinct 2px focus outline at 2px offset on an 8px-radius rounded rectangle around the 24px slot, so the pressed ring (round) and the focus outline (square-cornered, larger) never look alike.
- **Names:** every mark button is named "Trial 2, candidate: failed"; its tooltip says the same, plus the reason for any verdict other than failed that carries one.

## Components

### Buttons (view switch and counts)
Quiet and free of chrome: buttons have no borders and no fills at rest.
- **View switch:** a Deep Sage track (3px padding, 12px radius) holding two options (5px 13px, 9px radius, 14.5px, Bark). Hover shifts text to ink. The pressed option takes the pane color, ink text at weight 500 and the switch-lift shadow.
- **Counts:** glyph (16px) + bold tabular number (17px) over a 12px Lichen caption. Hover takes the wash; a zero count is disabled at 0.45 opacity. On change the number blurs and drops in over 700ms, except the complete count, which is set in Lichen at weight 500 and never animates: it rises all run long and must not compete with blocked or failed.
- **Links in text:** inherit color, underlined in stem with a 3px offset; turn links are bold.

### Run status chip
One chip beside the run name states the whole run, so the header answers "does this need me?" before any count is read. It is a pill (999px) with the state glyph at 14px and the state hue's ink on its wash, in the state word weight (500, 14px).
- **Running:** Deep Sage with Bark text, "Running". **Waiting:** Deep Sage with Lichen text, "Waiting on agents". Both are plain, non-interactive and quiet.
- **Needs you:** st-blocked wash, pollen-ink: "Needs you · Security reviewer", or "Needs you · 2 agents". **Agent failed:** st-failed wash, rose-ink: "Agent failed · Test writer". **Run failed:** st-failed wash, rose-ink. **Done:** st-complete wash, bloom-ink: "Done · took 5m 13s".
- **Action:** when it names an agent (needs you, agent failed, run failed) the chip is a button ending in an underlined "Show" that selects that agent and scrolls it into view; it carries no border and takes the global focus ring.
- **Change:** when the state flips on the open run the chip settles in once with the same blur-and-drop as a count (700ms). Opening another run, or the first paint, never animates it. The change is also announced through the polite status region for needs you, failed and done, never for running and waiting.
- **Link lost:** while the stream is down the chip is replaced by a dashed hairline chip, "Trellis server stopped · showing the last state", in Bark. Everything on screen is the last known state, and the chip says so; the meta line never carries this.

### Switcher pill
Another live run that needs attention shows as a small pill after the chevron on the switcher: a 14px glyph, a count and, on wide screens, words ("1 other needs you", "2 others need you", "1 other failed"). Blocked takes the pollen wash and pollen-ink; failed takes the rose wash and rose-ink. It counts runs, not agents, and blocked outranks failed. It is hidden when nothing else needs attention.

### Browser tab
The tab is the one place Trellis can speak while it is not in front of you, so it is quiet and passive: no notification, sound or badge count. The favicon is the brand mark and gains a small round bud at the lower right (pollen for blocked, rose for failed, bloom for done), and the title takes a state prefix, state first so tab truncation keeps it: `● Needs you · Trellis`, `✕ Run failed · Trellis`, `✕ Agent failed · Trellis`, `✓ Done · Trellis`. Rank is needs you, run failed, done, agent failed, so a run that healed itself ends on done. Needs you follows live state and clears when the agent is unblocked. Failed and done only latch while you are away (the tab is hidden or the window is unfocused) and clear when you return, and they ignore runs and failures that were already there when the page loaded. Synthetic demo runs never signal. The idle favicon in `index.html` and the one in `lib/tabSignal.ts` must stay identical.

### Chips
- **Style:** JetBrains Mono 11.5px, Bark on Deep Sage, 3px 8px, 7px radius, no border.
- **Use:** only for handoff context (files and notes passed down). In Timeline they appear under a selected spawn row after a "handed in" label.

### Timeline rows
- **Spawn row:** the start offset from the run ("+2:11", 13.5px/500 Lichen, tabular, 5.6ch column), role icon, name (title) with the sibling number when siblings share the name, lowercase state word in its ink, the source in Lichen only when the run mixes hosts, and a 6px duration bar on one shared time axis (120px wide on desktop, a full-width line under the name on phones). Both agents of a parallel pair start at the same x, and the longer one is wider. The bar is tinted by state (leaf-ink running, pollen-ink blocked, rose-ink failed, bloom-ink complete, Lichen waiting); a running agent reaches the right end. Second line is current activity or task in Bark. Transparent at rest, wash on hover and selection.
- **Return row:** the return offset ("+0:57") in the same column as spawn offsets, then a single Lichen line "Returned to Orchestrator after 42s:" (the parent's name, not a number) followed by the summary in Bark at 500 (rose-ink when failed).
- **Now row:** clock and live count in Lichen, with an underlined "Follow the growing tips" control when the viewer has scrolled away.

### Tree nodes
- **Pod:** a 58px seed-shaped fill tinted by state (pod-waiting, pod-running, st-blocked, st-failed, st-complete). It holds the agent's **role icon** at 54% of its size, in Bark ink (pollen-ink, rose-ink or bloom-ink when blocked, failed or complete). The **state badge** is a 21px disc of ground at the lower right carrying the 15px state glyph. Every pod is the same size in every state: finishing never shrinks it, so the tree does not change shape as work completes. Nodes sit in 152px columns (132px narrow), with the name in 16.5px/700 and the state word beneath unless the agent is complete.
- **Label:** name (16.5px bold) followed by the sibling number as a small quiet figure (`cn`: 0.8em, 500, tabular, 80% opacity) when siblings share the name, the state word beneath in 13px unless the agent is complete (the badge says it), and a text line clamped to two lines (14px, Bark): the task while a subagent runs, the first sentence of its result once it has returned, with file paths cut to their file name.
- **Hover / selected:** the pod rises 3px; the selected pod gets a 2px stem-lit outline at 4px offset and its ancestry stem is lit.
- **Generic agents:** when an agent has a short task description and no named role (the "General agent" fallback), its task leads as the label (15.5px bold, two lines) and the role with its number drops beneath it as a small Lichen tag. The text line then shows live activity while it runs and the result's first sentence once it returns. Named roles (Explorer, Planner and so on) keep the role-as-name label.
- **Root:** the orchestrator sits beside its pod in a row, name at 20px, activity clamped to three lines.

### Reading pane
- **Header:** a 52px pod (role icon plus state badge, on a pane-colored badge disc) beside the display name with its number as a 16px Lichen figure; a Lichen meta line "Claude Code · delegated by Orchestrator" with the parent as an underlined link.
- **Status panel:** 14px radius, 16px 18px padding, tinted by state (ground for running and waiting). Bold state title with elapsed time right-aligned; 16px status text; an optional 13px aside. For a finished agent the panel is the answer: it holds the result summary, and an aside counts failed tool calls ("2 tool calls failed along the way; the agent still finished.").
- **Pane order:** header, status panel, the returned detail (list items, full result, note; only when there is detail beyond the summary the panel already shows), then the handed-in prompt, then delegates, tokens and conversation. The answer comes before the prompt, and the prompt previews about 240 characters behind a disclosure.
- **Handoff:** an 18px-indented block with a 1px stem rail and a 7px stem-colored dot at its head; 12.5px Lichen "from" line, 17px quote, chips beneath. The returned block repeats the form with stem-colored list markers.
- **Delegated to:** list buttons (7px 8px, 10px radius) of glyph, name with its number, and state word; wash on hover. A generic agent with a task description is listed by that task, with the role and number as a small Lichen tag.
- **Conversation:** turns in an 88px attribution column + body, divided by hairlines. Tool turns are disclosures: a 10px chevron that rotates 90deg when open, mono tool name (500) and target, timing right-aligned (rose-ink when failed, "waiting" in Bark when pending). Output opens in a ground-colored 10px-radius mono block.
- **Footer:** the source file path in mono under a hairline, stating that demo data is synthetic.

### First run (no sessions)
When there are no runs at all, the app drops to one column: only the mark and the theme toggle remain in the header, and a centered block replaces the graph and the pane. It has a 300px ghost tree drawn in dashed lines (a hollow orchestrator pod, a dashed stem that forks into three hollow child pods with a leaf on each drop, and pale placeholder bars for names), so it previews what will appear without inventing agents. Under it, "Nothing growing yet" in 30px/700, Bark copy (17px, 40ch) that names the tools whose runs will appear and says runs from the last 24 hours show (`--since` looks further back), and a single Ink-filled "Watch a demo run" button (46px tall, 12px radius) with a 13.5px Lichen note that the demo is made-up data. The button loads the replayable demo run from its very first second, and the header then also offers "Close demo", which returns to this state. The state can be previewed by opening `index.html#empty`. When the page is served but its first connection to the Trellis server fails, the same block reads "Can't reach the Trellis server" with a sentence on restarting Trellis and reloading; it never falls back to synthetic runs, and the demo stays one click away. Never add setup steps or claims here that the product cannot honor; how runs are discovered is still an open decision.

### Session switcher
There is no permanent sessions column. The run name in the header is a button with a chevron that opens a 380px popover with a 1px edge and no shadow (a full-width sheet on phones) listing runs: "Active" first, with any run that has a blocked agent sorted to the top, then a quieter "Earlier today" for runs that finished today. Each row is a 16px glyph for the run's worst state, the name in 15.5px/700 (500 in Bark for finished runs) with elapsed time or "ended HH:MM" right-aligned, a 13px Lichen repo · tool line, and one note: "Needs you: Security reviewer" in pollen-ink, a failure summary in rose-ink, a final result, or the running count. There are no per-agent glyph strips. The only ambient signal for other runs is the switcher pill (see Switcher pill); its accessible label names the run, or counts them. The popover is a `menu` with `menuitemradio` rows, opens on click or the down arrow, moves with the arrow keys, Home and End, and closes on Esc (returning focus), a click outside, or choosing a run. While open it only updates its clock text and rebuilds when something meaningful changes, so focus is never lost. Choosing a run loads it into the current view, selects its most urgent agent and scrolls that agent into view when it is blocked or failed. That is the only time the graph scrolls on its own: a live state change never moves the viewer.

### Breadcrumb
A 40px row (44px on phones) at the top of the graph column that is always present, so selecting an agent never moves the graph. It shows the path from the orchestrator to the selected agent, for example `Orchestrator › Implementer 2 › Type checker`; with nothing selected, or the orchestrator selected, it shows just `Orchestrator`. Type is one quiet style: names in Alegreya Sans 500 at 14.5px, with the agent number in a smaller 12.5px tabular figure at 80% opacity and no "№" sign; ancestors in Lichen (buttons that select that agent, washing on hover), the current agent in Ink, thin 8px chevron separators at 60% opacity. The row scrolls sideways rather than wrapping. A hairline appears beneath it only once the graph has scrolled under it. Nodes and rows use a scroll margin so nothing lands beneath the bar.

### Keyboard
Up/Down (or j/k) move through agents, `n` jumps to the next agent that needs a human (blocked first, then failed), `[` and `]` step through runs, and Esc returns to the orchestrator (on phones it closes the sheet). A skip link first in the tab order jumps to the first agent. Selection is announced through a visually hidden polite status region instead of a live pane, so a running run does not re-announce itself. The same region announces the open run turning to needs you, failed or done, and the server link stopping or returning.

### Legend
A bar pinned to the bottom of the graph column with a hairline above it (static at the end of the page on phones). Row one: the five state glyphs plus the tool-call leaf, each with a lowercase 12.5px Lichen label. Row one ends with a quiet underlined "How to read" toggle that folds row two away; the choice is stored per viewer (`trellis:legend`) and the legend starts open. Row two: one short sentence for the current view ("Icons show role, badges show state. Bright stems are working; faded ones have returned." or the Timeline equivalent), and at right a keyboard hint in small `kbd` chips (hidden on phones). The `n` hint reads "blocked or failed", which is what the key does.

### Evaluation view
Reads one experiment, baseline against candidate, over a fixed case suite, as a change ledger: what changed leads, each change carries its own evidence inline, unchanged cases fold away, and a separate column answers "is this comparison valid?" before any number is trusted. There is no single score, no headline pass rate and no card; the only filled field is the open entry's wash.
- **Experiment line:** after the mark in the header: the experiment title (18px bold), the 12.5px pollen-ink "synthetic demo" tag, and the regression count as an underlined 13px rose-ink link ("1 regression") that does what `n` does, or a 13px Lichen "no regressions" ("so far" while in progress). Beneath it one 14px Lichen meta line: "Baseline v0.8 → Candidate v0.9 context handoff · grader g3 · 8 cases × 3 trials · complete", truncated with the full text as its tooltip on desktop. The theme toggle sits at right; there is no view switch, count row or run switcher.
- **Change groups:** in this fixed order, each present only when it has cases: "Fewer passed", "More passed", "Not comparable", "Still running" (only while in progress). The head is 15px/700 Bark, "Fewer passed" in rose-ink, with its count after it in 13px Lichen ("1 case", "2 cases"). A case is still running while any of its trials runs, not comparable when a side has no finished trial, otherwise fewer, more or unchanged by candidate passed minus baseline passed. Within a group, cases keep the suite's order.
- **Unchanged line:** one full-width button after the groups (12px 16px, 12px radius, wash on hover): a 12px Lichen chevron that turns 90deg when expanded, the first unchanged case's candidate marks, the bold "4 unchanged" in 14.5px Bark, then the unchanged case names joined by " · " in 13.5px Lichen, each with "(1 awaiting a label)" when it has unknown trials. Expanding hides the names and lists the unchanged entries beneath in suite order; folding while an unchanged entry is open closes that entry.
- **Closed entry:** a 12px-radius block, 14px 16px 16px padding, transparent at rest, wash on hover, clickable anywhere. Left: the case name (16.5px/700 Ink) with its revision in 12px mono Lichen; beneath it a 13px Lichen caption, "capability · reason", where the reason is built from the data: failing trials grouped by reason on the side that explains the change ("baseline trials 2 and 3 failed: constraint missing from the handoff"), plus any regrade ("Candidate trial 1 regraded g2 failed → g3 passed."), or the grader method when there is neither. A not-comparable entry's caption is its first not-eligible reason alone. Right: a two-row grid, 13px Lichen "Baseline" and "Candidate" labels each followed by its marks. Beneath: the change word in 14px Bark, tabular ("2 more passed", "same", "1 still running"; "1 fewer passed" in rose-ink). A not-comparable entry has no change word; its caption says why.
- **Open entry:** exactly one at a time. It takes the wash-strong field, its marks become buttons, its caption becomes "capability · grader method", and the change line describes the selected trial: "1 fewer passed · candidate trial 2 failed: delivered limit is 60 requests per minute; the requirement is 100.", in rose-ink when the change is fewer or the selected trial failed. Below it (10px down, 24px between blocks): Expected and Delivered as two rails side by side. Each rail is indented 18px with a 1.5px Hairline line and an 8px stem dot at its head, a 12.5px Lichen "from" line ("Expected · public requirement", "Delivered · candidate trial 2"), a 15.5px/1.55 Ink quote, and 12px mono chips (4px 8px, 7px radius, Deep Sage, Bark): the requirement's source on Expected, the trial's citations on Delivered. A trial that delivered nothing quotes its verdict reason, else reads "Nothing delivered for this trial." in Lichen. Then a single-column 14px Bark list with 86px bold Ink terms: Checks (grader id in 12px mono Ink, version chip, method, "failed" in rose-ink or "passed", the result), then Regrades (oldest first, mono version · verdict · date, full timestamp as tooltip) and Missing data, each only when present. The name line closes the entry; clicking another entry opens it and closes this one.
- **Default trial:** opening an entry selects, for fewer passed, the first failing candidate trial; for more passed, the first failing baseline trial (what got fixed), else the first candidate trial; for not comparable, the first not-eligible candidate trial, else the first not-eligible baseline trial (the contract said "the first not-eligible trial"; the build prefers the candidate side); for unchanged and still running, the first candidate trial.
- **Right column:** the pane surface (Paper Leaf, hairline left edge, 18px top-left corner), 26px 30px 24px padding, heads in 15px/700 Bark. "Is this comparison valid?" is a checklist of bold Ink terms (86px minimum) beside 14px Bark lines, every line derived from the data: Cases ("Same 8 cases on both sides", or "6 of 8 cases have trials on both sides"), Grader ("g3 on both arms, 1 trial regraded", or "g3 on 10 of 12 checks"), Excluded and Unlabeled (one line per side and reason, "1 baseline trial · Excluded: provider outage during the trial, declared before analysis", or "No trials excluded or ineligible" and "No unknown trials"), and Running while trials run. "Measures" follows 26px below as a compact stacked list, rows separated by hairlines with 10px padding: the name (14.5px/500 Bark), the values with an arrow (15.5px/700 Ink, tabular: "15 of 20 → 17 of 20 trials"), then one 13.5px line: the change words in Bark, then the interval and coverage in Lichen, joined by " · ", each phrase kept whole (nowrap) so the line breaks only between phrases. Efficiency is one row holding wall time and tool calls ("2m 04s → 1m 38s · 13 → 11 calls"), with repeated phrases dropped. An unavailable measure has no value line, only "Not available: <reason>" in Lichen, which may wrap; never 0.
- **Key line:** pinned to the foot of the right column above a hairline (12px 30px, 12.5px Lichen on the pane fill), with kbd chips (11.5px/500 mono, Deep Sage, 6px radius): "↑ ↓ entries · Enter open · 1 to 9 trial · n next regression · Esc close". Hidden under 900px. It is a deliberate addition to the approved comp, so the keyboard paths are findable.
- **Keyboard:** Up/Down (or j/k) move focus between the visible entries' name buttons and the unchanged line without opening anything; Enter or Space opens the focused entry (or closes it when open); 1 to 9 pick that trial on the selected trial's side of the open entry and focus its mark; `n` opens the next regression in suite order, wrapping, focuses it and scrolls it into view; Esc closes the open entry and returns focus to its name. Keys are ignored while typing or with a modifier.
- **Names:** an entry's name button is `aria-expanded`, described by its change line, and carries a hidden summary of every trial ("Baseline: passed, failed, failed. Candidate: passed, passed, passed."), because closed marks are images, not buttons. Each change group is a labelled section.

**The Comparable Population Rule.** A measure counted in trials includes only the comparable cases in its scope: cases where each side has at least one finished (passed or failed) trial. Both values are passed of finished trials over those cases, the change is candidate passed minus baseline passed, and coverage counts comparable cases against all cases in scope and names the exclusion, so shown values and change words never contradict each other. Trellis displays the export's numbers; the demo fixture is held to this rule by tests.

### Motion
Running is the only ambient motion. Value changes are the only other motion, and they are one-shot: a count or the run status chip settles in over 700ms when its value changes and then rests. A running agent's pod breathes out a thin `leaf` ring (3.2s, expanding from 98% to 124% while fading from 0.55 to 0) and the dot before its "running" state word pulses (2.8s, 0.35 to 1 opacity). Waiting, blocked, failed and complete agents are completely still, so motion alone says "being worked on". Stems draw in with a 1100ms stroke-dashoffset on `cubic-bezier(.16,1,.3,1)`; new glyphs pop from scale 0 over 800ms (350ms delay) on a calm ease-out `cubic-bezier(.16,1,.3,1)`; running leaves sway; the mobile sheet slides 420ms. Hover and selection transitions are 200 to 300ms ease. Under `prefers-reduced-motion` every animation and transition is off and stems render fully drawn. On the evaluation view the running verdict mark is the only ambient motion, on the running dot's 2.8s pulse.

## Do's and Don'ts

### Do:
- **Do** show every agent state with its botanical glyph plus the lowercase state word in the matching ink (pollen-ink, rose-ink, bloom-ink; Bark for running, Lichen for waiting).
- **Do** number agents only among same-name siblings under one parent, as a small quiet figure after the name (`Researcher 2`). A lone agent and the orchestrator carry no number. In prose, use the same label ("Waiting on Researcher 1 and Researcher 2").
- **Do** let hierarchy come from type size, weight and whitespace; nodes sit directly on the ground.
- **Do** trace selection by lighting the ancestry stem in stem-lit (2.1 to 2.2px) and dimming other branches to 0.55 to 0.6 opacity.
- **Do** draw one leaf per tool call on the stem, and keep stems meaning delegation only.
- **Do** use JetBrains Mono only for paths, commands, ids and timings, and tabular figures for anything that ticks.
- **Do** ship both schemes from the same tokens: pale sage light is canonical, the neutral graphite dark scheme follows `prefers-color-scheme`.
- **Do** keep everything static under `prefers-reduced-motion`.
- **Do** draw every grade as its verdict mark, named in words ("Trial 2, candidate: failed") in its label and tooltip.
- **Do** lead the evaluation view with what changed: change groups in their fixed order (Fewer passed, More passed, Not comparable, Still running), cases in the suite's own order within each, unchanged cases folded into one line; reach regressions through the count in the experiment line and `n`.
- **Do** keep exactly one ledger entry open and show its evidence inline: Expected and Delivered side by side on rails, then checks, regrades and missing data.
- **Do** print every measure change with its interval and coverage on the same Lichen line, each phrase unbroken.

### Don't:
- **Don't** put cards, bordered boxes or shadows around graph nodes; the only node fill is the state-tinted seed pod.
- **Don't** use emoji or generic icon-font glyphs for agents. Role icons come only from the authored role set below, and state always travels as the botanical badge, never as the role icon's color alone.
- **Don't** use a state hue (pollen, rose, bloom) for anything that is not that state.
- **Don't** set prose, names or tasks in the mono face.
- **Don't** swap the sage ground for cream or white, or the graphite dark scheme for a tinted or high-contrast console.
- **Don't** add botanical decoration that carries no structure: no vines as borders, no leaf bullets or leaf dividers.
- **Don't** animate anything except growth (stems drawing, glyphs popping), the running signal (breathing ring, pulsing dot, leaf sway, sprout tip) and the one-shot settle of a changed count or status chip. Never animate the selected path, halos, or anything for a state other than running.
- **Don't** interrupt. No system notification, sound, flashing tab or modal: attention is shown in the chip, the pill and the tab, and the viewer decides when to look.
- **Don't** let a failed agent read as a failed run. "Agent failed" is a heads-up the orchestrator may recover from; "Run failed" is the verdict.
- **Don't** draw a grade with a botanical glyph, a state tint or leaf green, and don't use rose-ink on the evaluation view for anything but failure.
- **Don't** reduce an experiment to one score, a headline pass rate or KPI cards, and never show an unavailable measure as 0.
