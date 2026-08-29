# Rich Markdown Theme Packs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Alto, Jade, Newsprint, and Rainbow as portable coordinated single-file themes with distinctive Markdown typography.

**Architecture:** Add four files to the existing `electron/themes/` starter catalog and advance the non-overwriting installer marker. Use only the existing `@puppyone-theme` and three-surface CSS contract, with direct Markdown selectors for both CodeMirror-native and rendered HTML surfaces.

**Tech Stack:** CSS, PostCSS theme compiler, Electron Main theme service, Vitest.

---

### Task 1: Define the expanded starter catalog contract

**Files:**
- Modify: `tests/electron.theme-service.test.mjs`
- Modify: `electron/main/themes/theme-service.mjs`

1. Change the starter-catalog test to expect eight coordinated local CSS themes.
2. Add assertions for Alto, Jade, Newsprint, and Rainbow Markdown signature rules.
3. Run `npx vitest run tests/electron.theme-service.test.mjs` and confirm it fails because the four files are missing.
4. Add the four names to `STARTER_THEME_NAMES` and advance the marker from v2 to v3.

### Task 2: Author Alto

**Files:**
- Create: `electron/themes/alto.css`

1. Add metadata for `builtin.pack.alto` and all three targets.
2. Define light/dark blue-gray Application and CSV tokens.
3. Add centered H1, blue-label H2, quote, code, and table rules for native and rendered Markdown.
4. Run the focused service/compiler tests and confirm Alto compiles without diagnostics.

### Task 3: Author Jade, Newsprint, and Rainbow

**Files:**
- Create: `electron/themes/jade.css`
- Create: `electron/themes/newsprint.css`
- Create: `electron/themes/rainbow.css`

1. Implement each visual identity from the design document.
2. Include intentional dark-mode values for every surface.
3. Run the focused service/compiler tests and confirm all signature assertions pass.

### Task 4: Install into the development Themes Folder

**Files:**
- Create: `/Users/herbert/Library/Application Support/puppyone-development/themes/{alto,jade,newsprint,rainbow}.css`

1. Verify no same-name user files or directories exist.
2. Copy the four validated starter files into the development Themes Folder.
3. Scan that folder with `createThemeService` and require eight themes with zero diagnostics.

### Task 5: Document and verify

**Files:**
- Modify: `docs/css-themes.md`

1. Document the eight editable starter themes and the single-file authoring example.
2. Run theme-focused tests, the repository test suite, and the production build.
3. Review `git diff --check`, commit only explicit theme-task paths, and report branch/worktree state without pushing.
