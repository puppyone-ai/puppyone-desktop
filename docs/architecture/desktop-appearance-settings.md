# Desktop Appearance Settings

This document records the durable design contract for the Appearance settings
surface, the decision record from comparing against deep-customization settings
pages (Codex-style), and the current to-do list.

The font catalog and runtime lifecycle are specified in
[Desktop Typography Architecture](./desktop-typography.md).

## Part 1: Durable Design Contract

### Principle: Curate, Don't Configure

PuppyOne Desktop is a minimal, opinionated product. The Appearance surface
makes decisions for the user instead of handing decisions to the user.

- The unit of interface visual choice is a **complete curated preset**, never
  an individual color or numeric parameter. Knowledge content typography is a
  deliberate exception: users choose a catalog font by stable ID while the
  application interface remains curated.
- Every selectable option must be a state the team has designed and verified.
  No setting may produce a visual state we have not seen.
- A setting earns its place only if it is (a) accessibility, (b) a genuinely
  different working context, or (c) clearer presentation of an existing
  choice. Aesthetic micro-tuning does not qualify.
- When users want more interface visual variety, the answer is **adding a new
  curated preset**, not adding a knob. Content-font ownership stays inside the
  catalog exception above.
- Zero-UI beats a toggle when the OS already expresses the preference
  (example: reduce motion follows `prefers-reduced-motion` with no setting).

### Decision Record

Compared against Codex-style appearance settings (free accent/background/
foreground color inputs, custom font families, contrast slider, theme
import/copy, translucent sidebar toggle).

Accepted, because they are accessibility, curated interface choices, or
deliberate ownership of knowledge content:

| Item | Shape |
| --- | --- |
| Text size | One three-tier control (Small / Default / Large). `Default` is an exact identity state that preserves every hand-tuned component font size, line height, and spacing value. Small/Large may scale semantic typography tokens; never bulk-rewrite existing component CSS or introduce two free px inputs. |
| Content font | One catalog-backed selector with an inline live content sample. Built-in entries are Geist, System, and Serif. Preferences store an opaque font ID rather than a CSS family or file path, so a future local imported-font catalog can extend the same surface without changing the preference schema. UI, code, and terminal fonts remain fixed until separately designed. |
| Dock icon | Curated set of 2-3 official icons only, presented in the shared content-sized segmented control. No custom image upload. macOS only. |
| Pointer cursors | Single toggle. Default off (macOS-native arrow cursor). |
| Third dark preset | A warm dark preset pairing with the light `warm` preset, giving 3 light + 3 dark. |
| Theme previews | Mini app-preview cards for System / Light / Dark mode, rendered from live tokens with CSS (no screenshots). Individual light and dark presets use compact palette swatches inside the same segmented-control pattern as Text size, File icons, and Navigation. |
| Reduce motion | Zero-UI. Respect system `prefers-reduced-motion` automatically. Not a settings row. |
| Diff markers | Color vs `+/-` markers toggle for compact AI review surfaces. The full Git Changes view always shows structural `+/-` markers. Lives in the Editor section, not Appearance. |

Rejected, and why:

| Item | Reason |
| --- | --- |
| Free color customization (accent / background / foreground) | Presets are designed as complete sets in `tokens.css`; opening one channel breaks the set and produces unverifiable states. |
| Free interface/code font fields | Geist Sans / Geist Mono remain part of the product identity and metric contract. Do not expose raw CSS-family inputs or let content customization implicitly replace chrome or terminal typography. |
| Contrast slider | Infinite intermediate states cannot be visually verified. If contrast demand appears, ship a curated high-contrast preset instead. |
| Theme import / copy | Only meaningful with a theme editor, which we will not build. |
| Custom dock icon upload | Same failure as free colors: uncurated brand surface. |
| Translucent sidebar toggle | An opinionated product decides. Either vibrancy becomes the default design (all themes adapted) or we skip it. Not a toggle. |
| Interface density | Backlog. Row heights are tokenized so it is cheap, but no real user demand yet, and each density tier multiplies visual QA. |
| High contrast switch | Would ship as one more curated preset, not an independent switch. |

### Page Shape

The Appearance section stays a single flat list (Theme, presets, Text size,
Content font, File icons, Navigation, Header elements,
Pointer cursors, Dock icon). It must fit in roughly one screen. Do not adopt grouped-card layouts
while the list stays this small.

Language is an application preference rather than an Appearance customization.
It lives as a first-class page under `Desktop App`, between General and
Appearance. Its compact select applies immediately through the localization
runtime; do not add a separate Change or Save step or re-embed it in Appearance.

Light theme, dark theme, Text size, Content font, File icons, Navigation, and
Dock icon reuse the same segmented-control surface. Buttons are content-sized
around their icon or palette glyph and label; do not add a fixed group width,
equal-width flex growth, control-specific background, or control-specific
active treatment.

Every ordinary row uses the same single-line muted label treatment. Do not turn
Pointer cursors or Dock icon into a separate subsection with a bold title and
visible description. Explanatory copy may remain as a native tooltip and an
accessible description without changing the page hierarchy.

### Settings-Wide Visual Contract

Appearance defines the visual grammar for every Desktop Settings page. Page
content is capped at `1040px` with `24px 28px 40px` padding. Page titles use
`14px / 720`, descriptions use `12px / 1.35`, ordinary labels use `12.5px`,
and label descriptions use `11px / 520`. Interactive rows are at least `42px`;
read-only rows are at least `30px`; both use `10px` inline padding and an
`18px` gap.

Ordinary rows and subsections remain transparent and have no outer border or
row-level hover. Borders belong only to actual inputs, actions, and Theme
Preview. Necessary conceptual grouping uses the shared lightweight subsection
title (`12px / 500`, sentence case), never a panel/card shell. At widths of
`760px` or less, wide controls move below their labels while switches remain
compact. Direction-sensitive spacing uses logical CSS properties, and
technical URLs remain explicit LTR islands.

These controls depend on the renderer-wide single-reset contract in
[Desktop Renderer Style Architecture](./desktop-renderer-style-architecture.md).
Tailwind utilities remain available, but Tailwind Preflight must stay disabled:
an unscoped form-element reset would otherwise remove the borders, padding,
backgrounds, and typography owned by the layered Settings controls.

### Typography Preset Matrix

Text size is a curated token set, not a multiplier. Every value is an integer
pixel size. Changing text size does not modify line height, padding, gaps, row
height, or any other spacing token.

| Role | Small | Default | Large |
| --- | ---: | ---: | ---: |
| Micro | 9px | 10px | 11px |
| Caption | 10px | 11px | 12px |
| Metadata | 11px | 12px | 13px |
| Sidebar / chrome | 12px | 13px | 14px |
| UI body | 12px | 13px | 14px |
| Content body | 13px | 14px | 16px |
| Code | 12px | 13px | 15px |
| Title | 15px | 16px | 18px |
| Page title | 18px | 20px | 22px |
| Display | 22px | 24px | 28px |

### Header Typography Contract

The desktop header is chrome, not a heading surface. Its project name, branch
name, and any static context name use `--po-font-size-chrome` and
`--po-font-weight-chrome`; individual titlebar selectors must not introduce a
heavier local weight. The default chrome weight is medium (`500`), matching
ordinary sidebar rows rather than promoting workspace identity to a heading.

Keep all header context labels on the same token pair so project and branch
typography cannot drift independently. The architecture test in
`tests/titlebarTypographyArchitecture.test.ts` enforces this binding.

## Part 2: Implementation Status

The initial accepted items were implemented on 2026-07-10; the extensible
typography foundation followed on 2026-07-13. Current code boundaries:

- `src/preferences.ts` - preset definitions, storage keys
  (`puppyone.desktop.*`), parse/normalize helpers.
- `src/features/settings/SettingsView.tsx` - the Appearance section rendering.
- `src/styles/tokens.css` - all `--po-*` design tokens per theme and preset.
- `src/App.tsx`, `src/features/app-shell/DesktopOverlayPortal.tsx`,
  `src/components/MinimalOnboarding.tsx`,
  `src/features/app-shell/RestoringWorkspaceScreen.tsx` - root elements that
  carry `data-theme-mode` / `data-light-theme-preset` /
  `data-dark-theme-preset` and must carry any new appearance attributes.

Implemented:

1. **Text size.** `puppyone.desktop.textSize` has values
   `small | default | large`. It is applied as a root attribute that selects
   one explicit integer-valued `--po-text-size-*` token set. `default` preserves
   the original 13px sidebar / 14px content / 13px code sizes and does not
   change component spacing. Broader token adoption must be deliberate and
   reviewed component by component.
2. **Extensible typography.** `puppyone.desktop.typography` stores a versioned
   UI/content/code/terminal font-ID tuple. `--po-font-ui`,
   `--po-font-content`, `--po-font-code`, and `--po-font-terminal` are the
   semantic runtime contract; the legacy
   `--po-font-sans` / `--po-font-mono` names remain compatibility aliases.
   Built-in catalog entries provide Geist, System, and Serif content choices.
   Unknown but syntactically safe IDs are preserved and resolve to the role
   default until a catalog provider supplies them. This is the extension seam
   for a future host-owned imported-font store; importing files is not part of
   the current implementation.
3. **Third dark preset.** A warm dark preset is included in `DARK_THEME_PRESETS` and
   `tokens.css`, mirroring the light `warm` palette direction.
4. **Theme previews.** Mini preview cards (sidebar + panel + accent bar) drawn
   with CSS from live tokens replace the text-only System / Light / Dark mode
   buttons. Light and dark preset rows use compact three-color palette swatches
   inside the shared segmented-control treatment.
5. **Reduce motion.** `src/styles/animations.css` disables animations and
   transition-heavy styles behind `@media (prefers-reduced-motion: reduce)`.
   No setting row.
6. **Pointer cursors.** `puppyone.desktop.pointerCursors` (default false)
   uses a root `data-pointer-cursors` attribute; CSS opts interactive elements
   into `cursor: pointer`.
7. **Dock icon.** `puppyone.desktop.dockIcon` selects among packaged
   official icons via `app.dock.setIcon()` in the main process. Follows the
   packaging contract in [Desktop App Icon](../DESKTOP_APP_ICON.md) (raw PNG
   resources, not `.icns` slots).
8. **Diff markers.** `puppyone.desktop.diffMarkers`
   (`color | symbols`) is rendered in compact AI review surfaces; its settings
   row lives in the Editor section. The full Git Changes review surface always
   renders `+/-` because color alone cannot communicate its row structure.
## Invariants

- Do not add a settings control that accepts a free color, raw CSS font family,
  file path, URL, or unbounded numeric value. Font choices enter through the
  catalog and preferences store only validated IDs.
- Do not add an appearance option whose visual result the team has not
  designed and verified.
- `textSize=default` must remain visually identical to the pre-setting product.
  Do not bulk-convert hard-coded font sizes, line heights, row heights, padding,
  or gaps merely to make them respond to the text-size preference.
- Typography preset values are always whole pixels. Do not derive them with a
  scale factor or introduce fractional computed sizes such as `15.68px`.
- Project, branch, and static context labels in the desktop header must use the
  shared chrome size and weight tokens. Do not hard-code a heavier titlebar
  label weight in a feature selector.
- New visual variety ships as a complete preset in `preferences.ts` +
  `tokens.css`, keeping light and dark preset counts balanced.
- Preset counts stay small (3-4 per mode); adding a preset beyond that
  requires removing or merging one.
- Appearance preferences are per-device (`localStorage`, `puppyone.desktop.*`
  keys); they do not sync through cloud sessions.
- Interaction toggles must remove their runtime extension and event ownership
  when disabled; hiding an affordance while retaining active commands is not a
  valid off state.
- Interface, content, code, and terminal typography remain separate roles. A
  content font must not change chrome metrics or the terminal grid.
- Font readiness emits the shared typography lifecycle event. CodeMirror must
  request a measure, Mermaid must render with the resolved content family in
  its cache key, and xterm must refit after terminal-font metrics settle.
- A future imported-font implementation is host-owned, local-only, and exposed
  to the renderer as catalog entries. It must not store raw paths in renderer
  preferences or sync font binaries through projects/cloud.
