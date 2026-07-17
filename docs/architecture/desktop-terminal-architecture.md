# Desktop Terminal Architecture

This document has two parts with different lifetimes:

- **Part 1 — Architecture specification.** The durable contract for the
  right-sidebar terminal: layer boundaries, the character-grid rendering
  model, the geometry/resize pipeline, session lifecycle, and the width
  invariant that every change must preserve. It remains the reference for
  everyone working on the terminal after the current work is done.
- **Part 2 — Remediation plan.** The to-do list and code change map for
  fixing the CJK right-edge clipping defect and closing the gaps between
  the current implementation and Part 1. It is scoped to this one round of
  work; delete or archive it once the fixes have shipped and stabilized.

---

# Part 1 — Architecture specification

## 1. Scope and design goal

The desktop app embeds one interactive terminal in the right sidebar. It
must behave like a native terminal: byte-accurate PTY I/O, a stable
character grid at any panel width, correct rendering of CJK and Unicode
content, theme integration, and no visual artifacts while the sidebar
opens, closes, or resizes.

The architecture is the industry-standard three-layer stack (the same
shape VS Code, Hyper, and Tabby use):

```text
renderer (React)                       main process (Node)
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ features/desktop-terminal    │ IPC  │ ipc/terminal-ipc.mjs         │
│  RightTerminalPanel          │◄────►│  terminal-service.mjs        │
│  TerminalSurfaceHeader       │      │   node-pty sessions          │
│  fit / resize orchestration  │      │   (login shell per session)  │
│  theme from CSS variables    │      │                              │
└──────────────────────────────┘      └──────────────────────────────┘
        styles: src/features/desktop-terminal/ui/desktop-terminal.css
        bridge: electron/preload.cjs (window.puppyoneDesktop)
```

No terminal state lives outside these files. The renderer owns geometry
and rendering; the main process owns processes; the preload bridge is a
dumb pipe. Application chrome (titlebar) only toggles surface visibility —
Clear/Reset and PTY session reset belong to the terminal surface itself.

## 2. Layer responsibilities

**Renderer — `src/features/desktop-terminal/ui/`.**
`RightTerminalPanel` is the composition root: it owns the xterm.js instance,
lazy PTY lifecycle, fit/resize orchestration, drag-and-drop of file paths,
theme resolution, and focus management. `TerminalSurfaceHeader` is the
presentational chrome for Clear and Reset. Reset increments an internal
`sessionGeneration` so the panel recreates the PTY without App remounting
the tree.

**Bridge — `electron/preload.cjs`.** Exposes exactly six calls:
`createTerminal` / `closeTerminal` (invoke), `writeTerminal` /
`resizeTerminal` (fire-and-forget send), `onTerminalData` /
`onTerminalExit` (subscriptions). No logic.

**Main — `electron/main/ipc/terminal-ipc.mjs` +
`electron/main/terminal-service.mjs`.** A session map keyed by a
renderer-supplied UUID (validated server-side). Spawns the user's login
shell via node-pty with `TERM=xterm-256color`, `COLORTERM=truecolor`, and
app-identifying env vars. Confines `cwd` to the workspace root, clamps
cols/rows (20–400 / 8–120), kills sessions when their window closes, and
reports exit code/signal back to the renderer.

**Styles — `src/features/desktop-terminal/ui/desktop-terminal.css`.**
Co-located `.desktop-terminal-*` rules and `.xterm` overrides: the panel is
`overflow: hidden`, the outer terminal body carries the visual padding
(`14px 0 16px 16px`), the xterm geometry container remains padding-free, and
scrollbars use the product scrollbar tokens (`--po-scrollbar-*`) with a
terminal-specific xterm adapter. Global `layout.css` must not own terminal
presentation classes.

**Titlebar — `src/features/app-shell/`.** The Terminal icon is a stable
visibility toggle only. It must not morph into a split/dropdown control and
must not host Clear/Reset.

## 3. The width invariant (why terminals clip or drift)

A terminal is a character grid. Three independent width systems must
agree for every cell, or rendering breaks:

1. **wcwidth** — how many grid columns a character occupies (1 or 2).
   Both the PTY-side program (which wraps its own output) and xterm's
   buffer compute this, each from their own Unicode tables.
2. **CSS cell width** — xterm measures the primary font ("W" at the
   configured size) and derives one cell width in px. The grid is
   `cols × cellWidth` wide; FitAddon inverts this to pick `cols`.
3. **Actual glyph advance** — what the font renderer really draws. For
   glyphs outside the primary font (all CJK under a Latin monospace
   stack) this comes from a fallback font and rarely equals an exact
   multiple of the cell width.

Renderers differ in how they reconcile (2) and (3):

- **GPU renderers (`@xterm/addon-webgl`)** rasterize every glyph into a
  per-cell texture-atlas tile. A glyph wider than its cell(s) is rescaled
  (`rescaleOverlappingGlyphs`) or clipped **inside its own cell**; error
  can never accumulate across a row. This is what VS Code ships and is
  the correct choice for an Electron app.
- **The DOM renderer (xterm core default)** lets the browser lay out
  text and compensates per character: it measures each glyph in a hidden
  container (`WidthCache`, measuring `char.repeat(32)`) and sets
  `letter-spacing = wcwidth × cellWidth − measuredWidth` on the span. The
  grid then only aligns **if the measurement equals what the browser
  actually renders in context**. Any measure-vs-render disagreement
  accumulates linearly across the row and spills past the grid edge,
  where `overflow: hidden` cuts it off.

Hence the invariant every terminal change must preserve:

> For every character the terminal can display, the rendered advance must
> equal `wcwidth × cellWidth` exactly — by construction (GPU renderer) or
> by verified measurement parity (DOM renderer).

## 4. Known failure mode: CJK punctuation vs `text-spacing-trim`

This is the mechanism behind the right-edge clipping defect (diagnosed
July 2026, xterm 6.0.0, Electron 41 / Chromium 146). It is durable
knowledge: any future DOM-renderer usage can regress the same way.

Chromium 123+ applies the CSS `text-spacing-trim` initial value `normal`
to CJK text: a fullwidth punctuation mark (`，` `。` `、` `：` `“` `”` …)
is rendered **half-width when adjacent to another fullwidth punctuation
mark**, full-width otherwise. This breaks the DOM renderer's measurement
parity in one direction:

- `WidthCache` measures `，` as `"，".repeat(32)` — every mark sits next
  to another mark, so trimming applies → measured **6.70px**.
- In real output, marks sit between Han characters → rendered
  **13.00px** (full width).
- The renderer compensates for the wrong width:
  `letter-spacing = 15.66 − 6.70 = +8.94px`, so the cell renders at
  `13.00 + 8.94 = 21.95px` instead of `15.66px` — **+6.28px of drift per
  punctuation mark**.

Measured consequences (headless Electron probe, exact production font
stack/options/CSS, sidebar widths 500–680px):

| Row content                          | Overflow past the grid edge |
| ------------------------------------ | --------------------------- |
| Chinese prose with 3–5 fullwidth marks | **+17 to +31px → visibly clipped** |
| Pure Han rows (`月月月…`)             | 0px (compensation exact: 13.00 measured = 13.00 rendered) |
| Box-drawing rules (`────`)            | ≤ +1.2px (sub-pixel noise, absorbed by the 14px scrollbar reserve) |

This matches the user-visible symptom exactly: separator lines and pure
Han lines look fine while punctuation-bearing prose loses its last one or
two characters at the panel edge.

Countermeasure: `text-spacing-trim: space-all` on the terminal container
disables trimming, so measurement and rendering are both full-width.
Verified by the same probe: worst-row overflow drops from +31px to
+1.2px. A terminal is a grid, not typeset prose — trimming is never
wanted there. (GPU renderers are immune, but the rule must stay for the
DOM fallback path.)

Two adjacent facts worth pinning:

- `customGlyphs` and `rescaleOverlappingGlyphs` are texture-atlas options.
  **They are no-ops under the DOM renderer** — passing them without the
  WebGL addon configures nothing.
- xterm core defaults to Unicode **6** width tables. Modern CLI programs
  wrap against newer wcwidth tables, so emoji and newer symbols can
  disagree between the PTY program's wrapping and xterm's grid.
  `@xterm/addon-unicode11` narrows this gap.

## 5. Geometry and resize pipeline

Sizing flows one way: **DOM size → FitAddon → xterm grid → PTY winsize**.

1. `FitAddon.proposeDimensions()` reads the xterm container width,
   subtracts the `.xterm` element's own CSS padding and a 14px scrollbar
   reserve, and divides by the measured cell size to get cols/rows. In
   this app the visual inset lives outside that fit target, so `.xterm`
   padding must stay at `0`; otherwise the PTY grid becomes visibly
   narrower than the viewport/scrollbar edge.
2. `fitAndResize()` guards against zero-size containers (hidden panel),
   calls `fit()`, then syncs `terminal.cols/rows` to the PTY via
   `resizeTerminal`. The PTY must always be told the same grid xterm
   uses, or programs wrap against the wrong width.
3. Fit triggers: a `ResizeObserver` on the container, a `transitionend`
   listener on the sidebar's `width`/`flex-basis` transition (the sidebar
   animates open/close over 160ms), rAF-coalesced scheduling, and settle
   retries at 80/180/260ms for layouts that land late. A pending-size ref
   replays the latest size once the PTY session finishes creating.
4. Ordering rule: `terminal.open()` → first fit → `createTerminal` with
   the fitted cols/rows → replay pending size when the session is ready.

This pipeline is sound and stays. The one durable rule: **any style that
changes glyph metrics (font, size, weight, letter-spacing, padding,
spacing-trim) must be in place before the terminal opens, and changing
one at runtime requires a refit.**

## 6. Session lifecycle

- Renderer generates the session UUID; main validates the format and
  owns the session map. Duplicate create for an id closes the old PTY.
- `cwd` is resolved against and confined to the workspace root.
- Spawn: user's `$SHELL` (login-shell args for bash/zsh),
  `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=PuppyOne`,
  `NO_COLOR` stripped.
- Exit surfaces in-terminal ("Process exited with …"); window close and
  app quit kill all sessions for that window.
- The React effect tears down symmetrically: observers, listeners,
  timers, xterm disposables, PTY close — in that order.

## 7. Theming

Terminal colors are derived from app CSS variables (`--po-terminal-*`
with `--po-*` fallbacks) resolved via `getComputedStyle` at mount and
re-applied when the app-shell theme attributes or stylesheets mutate
(two `MutationObserver`s). ANSI palette, cursor, selection, and scrollbar
colors all follow the active theme without recreating the terminal.

## 8. References

- xterm.js DOM renderer measurement/letter-spacing design and limits:
  <https://github.com/xtermjs/xterm.js/issues/5164>,
  <https://github.com/xtermjs/xterm.js/discussions/5217>
- GPU vs DOM cell-width discrepancies accumulate per cell:
  <https://github.com/xtermjs/xterm.js/issues/6015>
- `text-spacing-trim` semantics (Chromium 123+ default `normal`):
  <https://developer.mozilla.org/en-US/docs/Web/CSS/text-spacing-trim>
- WebGL addon usage and context-loss handling:
  <https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl>
- Unicode width tables addon:
  <https://github.com/xtermjs/xterm.js/tree/master/addons/addon-unicode11>
- FitAddon dimension math (padding + scrollbar accounting):
  `@xterm/addon-fit` `proposeDimensions()`

---

# Part 2 — Remediation plan (current work)

Scope: renderer layer and CSS only. No IPC, preload, or PTY service
changes. No behavior change other than correct rendering. Everything is
additive and reversible.

Current versions: `@xterm/xterm` 6.0.0, `@xterm/addon-fit` 0.11.0,
Electron 41 (Chromium 146). New dependencies: `@xterm/addon-webgl`,
`@xterm/addon-unicode11` (install latest compatible with xterm 6 via
npm; do not pin invented versions).

## 9. To-do list

**Phase 1 — stop the clipping (one CSS rule):**

- [ ] Add `text-spacing-trim: space-all;` to the `.desktop-terminal-xterm
      .xterm` block in
      `src/features/desktop-terminal/ui/desktop-terminal.css`, with a comment
      explaining the measurement-parity requirement (Part 1 §4). This alone
      removes the visible CJK truncation under the DOM renderer.

**Phase 2 — GPU renderer with graceful fallback:**

- [ ] Add `@xterm/addon-webgl`. In `RightTerminalPanel`, after
      `terminal.open(...)`, try to load the addon inside `try/catch`; on
      failure keep the DOM renderer silently.
- [ ] Handle `webglAddon.onContextLoss`: dispose the addon and fall back
      to the DOM renderer (which Phase 1 keeps correct).
- [ ] Dispose the addon in the effect cleanup before `terminal.dispose()`.
- [ ] Refit once after the renderer swaps (cell metrics can differ by a
      fraction of a pixel between renderers).
- [ ] Note: this makes the existing `customGlyphs` and
      `rescaleOverlappingGlyphs` options meaningful (they are no-ops
      under the DOM renderer today).

**Phase 3 — Unicode width tables:**

- [ ] Add `@xterm/addon-unicode11`, load it, and set
      `terminal.unicode.activeVersion = "11"` before the first fit, so
      grid wcwidth matches modern CLI programs for emoji/symbols
      (e.g. `⚠`).

**Phase 4 — fit hygiene (small):**

- [ ] After `document.fonts.ready` resolves, run one `fitAndResize()` —
      guards against first-fit measurements taken before font fallback
      resolution settles.

**Verification (all phases):**

- [ ] Manual: in the terminal, `cat` or echo a CJK sample containing
      fullwidth punctuation (`，。、：“”`), box-drawing rules, pure Han
      runs, and `⚠`; confirm no right-edge truncation at sidebar widths
      500 / 560 / 604 / 646 / 680px, including during and after the
      open/close animation and while dragging the resizer.
- [ ] Probe (optional, definitive): headless Electron page that opens a
      Terminal with production options + CSS, writes the same sample, and
      asserts every row's rightmost span edge ≤ the `.xterm-screen` right
      edge + 2px. Run with `ELECTRON_RUN_AS_NODE` unset.
- [ ] `npm run lint` and `npm run build` pass; terminal still opens,
      echoes, resizes, and exits cleanly (`exit` shows the exit message).

## 10. Code change map

| File | Change |
| --- | --- |
| `src/features/desktop-terminal/ui/desktop-terminal.css` | Phase 1 CSS rule on `.desktop-terminal-xterm .xterm` |
| `src/features/desktop-terminal/ui/RightTerminalPanel.tsx` | Phases 2–4: addon imports, load/fallback/dispose wiring, unicode activation, fonts-ready refit |
| `package.json` | Add `@xterm/addon-webgl`, `@xterm/addon-unicode11` |

Everything else (preload bridge, terminal IPC, PTY service, panel layout)
is intentionally untouched.

## 11. Implementation notes

1. **Load order in the mount effect:** construct `Terminal` → `loadAddon`
   (fit, unicode11) → set `unicode.activeVersion` → `open(container)` →
   try WebGL addon → first `fitAndResize()`. Keep the existing
   create-PTY-then-replay-size sequencing as is.
2. **Do not remove the DOM-renderer CSS fix after Phase 2.** WebGL can be
   unavailable (GPU blocklist, context exhaustion, remote desktop); the
   DOM path must stay correct on its own.
3. **Fallback must be silent** — a `writeSystemLine` warning is noise for
   users; log to console at most.
4. **Do not add per-cell width hacks** (custom letter-spacing, font
   scaling) in app code; correctness comes from the renderer contract in
   Part 1 §3. If a new drift appears, first check measurement parity
   (§4), then file/fix upstream rather than patching row widths.
5. **Font stack stays Latin-monospace.** Pinning a CJK monospace font
   would also satisfy the invariant but changes the terminal's look and
   depends on user-installed fonts; the renderer-level fix is the
   portable one.
