# Coordinated Theme Pack Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Theme Pack the only selectable packaged theme, remove the legacy Light/Dark preset rows and per-surface theme overrides, and reserve an accessible Add Theme marketplace action.

**Architecture:** Appearance continues to own system/light/dark mode and interface style, while the removed Light/Dark palette presets reset to product defaults. A complete Theme Pack supplies application, Markdown, and CSV CSS atomically as one unit. Surface preferences migrate to version 4 with one `pack` plus the existing target-scoped Custom CSS enablement; older per-surface overrides are deliberately discarded. The renderer and native menu exchange only pack selection state. Add Theme reads a single nullable marketplace URL, so the control stays disabled until the product URL is configured.

**Tech Stack:** React, TypeScript, Electron, CSS, Vitest, Testing Library via Happy DOM.

---

### Task 1: Lock theme preferences to one coordinated pack

**Files:**
- Modify: `tests/themePreferences.test.ts`
- Modify: `tests/desktopThemePreferences.test.tsx`
- Modify: `src/features/themes/themePreferences.ts`
- Modify: `src/features/app-shell/useDesktopPreferences.ts`

**Steps:**
1. Write tests that expect version 4 preferences to contain only `pack` and `customCss`, and that migrate version 1–3 values without preserving surface overrides.
2. Run the focused preference tests and confirm they fail because version 3 overrides still exist.
3. Implement the version 4 parser, migration, serializer, pack selection, and atomic all-surfaces selection resolver.
4. Remove the renderer preference setter for packaged surface overrides.
5. Run the focused tests and confirm they pass.

### Task 2: Simplify Appearance controls and reserve Add Theme

**Files:**
- Modify: `tests/interfaceStyleSettings.test.tsx`
- Modify: `tests/themeSettings.test.tsx`
- Modify: `tests/themeCustomCssSettings.test.tsx`
- Modify: `src/features/settings/main/InterfacePaletteSettings.tsx`
- Modify: `src/features/settings/main/ThemeSettingsSection.tsx`
- Create: `src/features/themes/themeMarketplace.ts`
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/features/settings/SettingsWorkspaceSurface.tsx`
- Modify: `src/features/settings/types.ts`
- Modify: `src/styles/settings-controls.css`
- Modify: `locales/renderer/*/settings.json`

**Steps:**
1. Write component tests that reject Light/Dark preset rows and per-surface selectors, require a Theme Pack selector plus Add Theme button, and retain Custom CSS.
2. Run the focused UI tests and confirm the old controls cause the expected failures.
3. Remove preset rows and packaged surface override props/components, and normalize retired palette values to product defaults.
4. Add a same-row Add Theme button backed by a nullable marketplace URL; disable it with explanatory text until configured.
5. Update responsive layout and translations, then run the focused UI tests to green.

### Task 3: Remove Customize from the native Theme menu

**Files:**
- Modify: `tests/electron.native-menu-service.test.mjs`
- Modify: `tests/themeCatalog.test.tsx`
- Modify: `tests/electron.theme-ipc.test.mjs`
- Modify: `electron/main/native-menu-service.mjs`
- Modify: `electron/main/ipc/theme-ipc.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/features/themes/useThemeCatalog.ts`
- Modify: `src/types/electron.d.ts`
- Modify: `src/App.tsx`

**Steps:**
1. Write tests that require Theme Pack, Open Themes Folder, and Reload Themes only, and reject override requests/state.
2. Run focused native-menu and catalog tests and confirm they fail on Customize and override payloads.
3. Remove Customize menu construction and narrow native synchronization and selection events to pack-only data.
4. Remove renderer override callbacks and run the focused tests to green.

### Task 4: Align public theme documentation and verify

**Files:**
- Modify: `electron/themes/README.md`

**Steps:**
1. Update documentation to state that shareable themes must contain all three targets and are selected as a coordinated pack; describe Custom CSS as a separate advanced overlay.
2. Run all focused theme, settings, localization, IPC, and native-menu tests.
3. Run the repository test suite and production build.
4. Review the complete diff, stage only explicit task paths, and create one reviewable local commit on `theme` without pushing.
