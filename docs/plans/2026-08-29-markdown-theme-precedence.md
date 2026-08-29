# Markdown Theme Precedence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate current `qubits` with the Theme branch and implement an explicit Theme → Editor overrides → Custom CSS cascade.

**Architecture:** Merge the published integration branch without rewriting Theme history. Preserve `qubits` structural refactors, then adapt the Theme preference model and style host so each customization layer has one owner and deterministic priority.

**Tech Stack:** React, TypeScript, Electron, CSS, Vitest

---

### Task 1: Integrate current qubits without losing either feature set

**Files:**
- Merge: `origin/qubits` into `theme`
- Resolve: the 13 files reported by `git merge-tree`
- Test: merge-sensitive settings, Markdown, Onboarding, and theme tests

**Step 1: Merge without committing**

Run `git merge --no-commit --no-ff origin/qubits` and confirm the expected conflict set.

**Step 2: Resolve from the current qubits structure**

Keep current `qubits` Editor settings, Markdown presentation, Onboarding intro, Telemetry, CSV resizing, and updated native API signatures. Reapply Theme providers, theme identifiers, Theme settings props, and public theme tokens at the new extension points.

**Step 3: Verify the integration baseline**

Run focused tests for settings, Markdown presentation, Onboarding, native APIs, CSV, and Theme behavior. Fix only integration regressions before continuing.

**Step 4: Commit the merge**

Commit the resolved merge without pushing.

### Task 2: Define theme-aware Markdown presentation preferences

**Files:**
- Modify: `src/features/markdown/markdownPresentation.ts`
- Modify: `src/features/settings/main/EditorSettingsView.tsx`
- Test: `tests/markdownPresentation.test.ts`
- Test: `tests/editorSettings.test.tsx`

**Step 1: Write failing model tests**

Assert that new defaults follow the theme, legacy product defaults migrate to theme-following values, non-default legacy choices remain explicit, and resolved CSS omits theme-following properties.

**Step 2: Run tests and observe RED**

Run the two focused test files and confirm failures are caused by the missing `theme` state and migration.

**Step 3: Implement the versioned model**

Add explicit theme-following values, versioned serialization, legacy migration, partial token resolution, and Reset semantics.

**Step 4: Run tests and observe GREEN**

Run the same focused tests.

### Task 3: Make Custom CSS an independent overlay

**Files:**
- Modify: `src/features/themes/themePreferences.ts`
- Modify: `src/features/themes/builtinSurfaceThemes.ts`
- Modify: `src/features/themes/ThemeStyleHost.tsx`
- Modify: `src/features/settings/main/ThemeSettingsSection.tsx`
- Test: `tests/themePreferences.test.ts`
- Test: `tests/themeStyleHost.test.tsx`
- Test: `tests/themeCustomCssSettings.test.tsx`

**Step 1: Write failing preference and cascade tests**

Assert version 3 migration, per-target Custom CSS enablement, exclusion of Custom CSS from theme selectors, and style order of selected theme → Markdown preferences → Custom CSS.

**Step 2: Run tests and observe RED**

Confirm current behavior still replaces the Markdown theme with Custom CSS.

**Step 3: Implement the overlay model**

Persist enablement separately, migrate existing overrides, emit deterministic style order, and expose enable/disable controls without deleting sources.

**Step 4: Run tests and observe GREEN**

Run all three focused test files.

### Task 4: Connect the Editor experience to the active theme

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/app-shell/DesktopWorkspaceContent.tsx`
- Modify: `src/features/settings/SettingsWorkspaceSurface.tsx`
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/features/settings/types.ts`
- Modify: renderer locale `settings.json` files
- Test: `tests/editorSettings.test.tsx`
- Test: `tests/themeCatalog.test.tsx`

**Step 1: Write failing UI tests**

Assert the active theme summary, Manage Themes navigation, Theme choices, Reset action, and final preview theme identity.

**Step 2: Run tests and observe RED**

Confirm the merged UI lacks these integration behaviors.

**Step 3: Implement the connected UI**

Pass current theme information through Settings, preserve controlled components and accessible labels, and make the real preview consume the same runtime cascade.

**Step 4: Run tests and observe GREEN**

Run focused UI and theme tests plus localization checks.

### Task 5: Verify and review

**Files:**
- Review: complete `origin/qubits...theme` diff
- Verify: repository tests and build

**Step 1: Run focused suites**

Run all Theme, Markdown presentation, settings, Onboarding, CSV, Electron IPC, and native menu tests.

**Step 2: Run repository checks**

Run `npm test`, `npm run build`, and `git diff --check`.

**Step 3: Request independent code review**

Review precedence, migration, accessibility, conflict resolution, absence of the eight CSS files, and regression risk.

**Step 4: Commit explicit task paths**

Create local commits on `theme`; do not push without explicit authorization.
