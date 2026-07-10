# Desktop Appearance Settings

This document records the durable design contract for the Appearance settings
surface, the decision record from comparing against deep-customization settings
pages (Codex-style), and the current to-do list.

## Part 1: Durable Design Contract

### Principle: Curate, Don't Configure

PuppyOne Desktop is a minimal, opinionated product. The Appearance surface
makes decisions for the user instead of handing decisions to the user.

- The unit of visual choice is a **complete curated preset**, never an
  individual color, font family, or numeric parameter.
- Every selectable option must be a state the team has designed and verified.
  No setting may produce a visual state we have not seen.
- A setting earns its place only if it is (a) accessibility, (b) a genuinely
  different working context, or (c) clearer presentation of an existing
  choice. Aesthetic micro-tuning does not qualify.
- When users want more visual variety, the answer is **adding a new curated
  preset**, not adding a knob.
- Zero-UI beats a toggle when the OS already expresses the preference
  (example: reduce motion follows `prefers-reduced-motion` with no setting).

### Decision Record

Compared against Codex-style appearance settings (free accent/background/
foreground color inputs, custom font families, contrast slider, theme
import/copy, translucent sidebar toggle).

Accepted, because they are accessibility or curated choices:

| Item | Shape |
| --- | --- |
| Text size | One three-tier control (Small / Default / Large). UI and code text scale together from one root factor. Never two free px inputs. |
| Dock icon | Curated set of 2-3 official icons only. No custom image upload. macOS only. |
| Pointer cursors | Single toggle. Default off (macOS-native arrow cursor). |
| Third dark preset | A warm dark preset pairing with the light `warm` preset, giving 3 light + 3 dark. |
| Theme preview cards | Mini app-preview cards for theme mode and preset pickers, rendered from live tokens with CSS (no screenshots). Replaces swatch dots. |
| Reduce motion | Zero-UI. Respect system `prefers-reduced-motion` automatically. Not a settings row. |
| Diff markers | Color vs `+/-` markers toggle for diff surfaces (color-blind accessibility). Lives in the Editor section, not Appearance. |

Rejected, and why:

| Item | Reason |
| --- | --- |
| Free color customization (accent / background / foreground) | Presets are designed as complete sets in `tokens.css`; opening one channel breaks the set and produces unverifiable states. |
| Custom font families | Geist Sans / Geist Mono are part of the product identity; free fonts break metrics and layout. |
| Contrast slider | Infinite intermediate states cannot be visually verified. If contrast demand appears, ship a curated high-contrast preset instead. |
| Theme import / copy | Only meaningful with a theme editor, which we will not build. |
| Custom dock icon upload | Same failure as free colors: uncurated brand surface. |
| Translucent sidebar toggle | An opinionated product decides. Either vibrancy becomes the default design (all themes adapted) or we skip it. Not a toggle. |
| Interface density | Backlog. Row heights are tokenized so it is cheap, but no real user demand yet, and each density tier multiplies visual QA. |
| High contrast switch | Would ship as one more curated preset, not an independent switch. |

### Page Shape

The Appearance section stays a single flat list (Theme, presets, Text size,
File icons, Navigation, Header elements, Pointer cursors, Dock icon). It must
fit in roughly one screen. Do not adopt grouped-card layouts while the list
stays this small.

## Part 2: Implementation Status

All accepted items were implemented on 2026-07-10. Current code boundaries:

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
   `small | default | large`. It is applied as a root attribute that scales the
   `--po-text-size-*` tokens by one factor. Code font size follows the same
   factor.
2. **Third dark preset.** A warm dark preset is included in `DARK_THEME_PRESETS` and
   `tokens.css`, mirroring the light `warm` palette direction.
3. **Theme preview cards.** Mini preview cards (sidebar + panel + accent bar)
   drawn with CSS from each preset's tokens replace text-only theme-mode
   buttons and swatch dots.
4. **Reduce motion.** `src/styles/animations.css` disables animations and
   transition-heavy styles behind `@media (prefers-reduced-motion: reduce)`.
   No setting row.
5. **Pointer cursors.** `puppyone.desktop.pointerCursors` (default false)
   uses a root `data-pointer-cursors` attribute; CSS opts interactive elements
   into `cursor: pointer`.
6. **Dock icon.** `puppyone.desktop.dockIcon` selects among packaged
   official icons via `app.dock.setIcon()` in the main process. Follows the
   packaging contract in [Desktop App Icon](../DESKTOP_APP_ICON.md) (raw PNG
   resources, not `.icns` slots).
7. **Diff markers.** `puppyone.desktop.diffMarkers`
   (`color | symbols`) is rendered in diff surfaces; its settings row lives in the
   Editor section.

## Invariants

- Do not add a settings control that accepts a free color, free font family,
  or unbounded numeric value.
- Do not add an appearance option whose visual result the team has not
  designed and verified.
- New visual variety ships as a complete preset in `preferences.ts` +
  `tokens.css`, keeping light and dark preset counts balanced.
- Preset counts stay small (3-4 per mode); adding a preset beyond that
  requires removing or merging one.
- Appearance preferences are per-device (`localStorage`, `puppyone.desktop.*`
  keys); they do not sync through cloud sessions.
