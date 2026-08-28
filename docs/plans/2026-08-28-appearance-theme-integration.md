# Appearance Theme Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Appearance the single theme entry point with coordinated theme packs, advanced surface overrides, managed Custom CSS, and several Typora-inspired built-in packs.

**Architecture:** Persist theme intent as a versioned pack-plus-overrides preference, resolve it against the immutable catalog and active color mode, and pass only the effective selection to rendering/native surfaces. Electron Main owns managed Custom CSS source and validates it through the existing compiler before atomic persistence.

**Tech Stack:** React 19, TypeScript, Electron IPC/preload, PostCSS, CSS custom properties, Vitest, Testing Library/React DOM test harnesses.

---

### Task 1: Theme preference intent and resolver

**Files:**
- Modify: `src/features/themes/themePreferences.ts`
- Modify: `src/features/themes/builtinSurfaceThemes.ts`
- Test: `tests/themePreferences.test.ts`

1. Write failing tests for version 1 migration, version 2 parsing, pack selection, nullable overrides, missing target fallback, and light/dark compatibility.
2. Run `npx vitest run tests/themePreferences.test.ts` and verify the new expectations fail.
3. Implement the version 2 preference helpers and pure effective-selection resolver.
4. Run the focused test and commit `feat(theme): model theme packs and overrides`.

### Task 2: Typora-inspired built-in theme packs

**Files:**
- Create: `packages/shared-ui/src/styles/editor/theme-packs/github.css`
- Create: `packages/shared-ui/src/styles/editor/theme-packs/forest.css`
- Create: `packages/shared-ui/src/styles/editor/theme-packs/night.css`
- Create: `packages/shared-ui/src/styles/editor/theme-packs/rose.css`
- Create: `packages/shared-ui/src/styles/editor/theme-packs.css`
- Modify: `packages/shared-ui/src/styles/editor.css`
- Modify: `src/features/themes/builtinSurfaceThemes.ts`
- Test: `tests/themeStyleHost.test.tsx`

1. Add failing catalog/style assertions for four complete three-target packs and public scoped selectors.
2. Run the focused test and verify failure.
3. Implement original PuppyOne CSS using the Typora files only as palette/character references.
4. Run the focused tests and commit `feat(theme): add coordinated built-in theme packs`.

### Task 3: Managed Custom CSS host API

**Files:**
- Modify: `electron/main/themes/theme-service.mjs`
- Modify: `electron/main/ipc/theme-ipc.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/types/electron.d.ts`
- Test: `tests/electron.theme-service.test.mjs`
- Test: `tests/themePreloadArchitecture.test.mjs`

1. Write failing tests for bounded reads, invalid target rejection, invalid CSS preserving the prior source, atomic valid save, and narrow preload methods.
2. Run the focused tests and verify failure.
3. Add the managed `puppyone-custom-css` package, compile-before-replace atomic writes, and narrow read/save IPC.
4. Run the focused tests and commit `feat(theme): manage custom CSS source`.

### Task 4: Catalog controller and renderer integration

**Files:**
- Modify: `src/features/themes/useThemeCatalog.ts`
- Modify: `src/features/themes/ThemeStyleHost.tsx`
- Modify: `src/features/app-shell/useDesktopPreferences.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/settings/SettingsWorkspaceSurface.tsx`
- Modify: `src/features/settings/types.ts`
- Test: `tests/desktopThemePreferences.test.tsx`
- Test: `tests/themeCatalog.test.tsx`
- Test: `tests/themeSurfaceArchitecture.test.ts`

1. Write failing tests for pack/override persistence, effective selection, mode fallback, Custom CSS controller errors, and resolved surface IDs.
2. Run the focused tests and verify failure.
3. Wire the new preference intent and catalog selection through application, settings, style host, and native synchronization.
4. Run the focused tests and commit `feat(theme): resolve theme intent at runtime`.

### Task 5: Appearance UI and Custom CSS editor

**Files:**
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/features/settings/main/EditorSettingsViews.tsx`
- Modify: `src/features/settings/main/ThemeSettingsSection.tsx`
- Modify: `src/styles/settings-controls.css`
- Modify: `locales/renderer/*/settings.json`
- Test: `tests/themeSettings.test.tsx`

1. Write failing tests proving Theme is absent from Editor, present in Appearance, has one pack selector, hides surface overrides in Advanced, and supports load/save/apply Custom CSS states.
2. Run the focused test and verify failure.
3. Implement the Appearance section, accessible disclosure, selectors, editor, actions, and localized feedback for all eight locales.
4. Run localization/boundary checks and commit `feat(appearance): unify theme settings`.

### Task 6: Native menu and documentation

**Files:**
- Modify: `electron/main/native-menu-service.mjs`
- Modify: `electron/main/ipc/theme-ipc.mjs`
- Modify: `electron/main.mjs`
- Modify: `locales/native/*.json`
- Modify: `docs/css-themes.md`
- Test: `tests/electron.native-menu-service.test.mjs`
- Test: `tests/themeNativeMenuBridge.test.tsx`

1. Write failing tests for a primary Theme Pack group and Customize submenu.
2. Run the focused tests and verify failure.
3. Implement the menu requests and update documentation for Appearance, managed Custom CSS, preference precedence, and package locations.
4. Run focused tests and commit `feat(theme): align native theme controls`.

### Task 7: Verification and review

1. Run focused theme/settings tests, `npx tsc --noEmit`, `npm run lint`, and `npm run check:boundaries`.
2. Run `npm test` and `npm run build`.
3. Request independent code review from the base commit through HEAD and fix all Critical/Important findings with failing regression tests.
4. Confirm `git diff --check`, a clean `theme` worktree, and report that remote push remains pending explicit authorization.
