# Theme Folder Packages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use test-driven development to implement this plan task-by-task.

**Goal:** Let PuppyOne load a coordinated single-file theme from `themes/<theme>/theme.css`, then reorganize the development theme library so every theme owns its CSS and assets.

**Architecture:** Directory discovery keeps existing `theme.json` packages compatible. When a directory has no manifest but contains `theme.css`, the service parses it with the existing coordinated single-file contract and resolves assets relative to that directory. The shareable library uses one directory per theme, with optional fonts in `fonts/`.

**Tech Stack:** Electron main-process theme service, PostCSS theme compiler, Vitest, CSS.

---

### Task 1: Add directory single-file discovery

**Files:**
- Modify: `tests/electron.theme-service.test.mjs`
- Modify: `electron/main/themes/theme-service.mjs`

1. Add a failing service test for `themes/reader/theme.css` with a nested font asset.
2. Run the focused test and confirm the directory is rejected because `theme.json` is absent.
3. Add directory dispatch that prefers `theme.json`, otherwise loads `theme.css` through the single-file parser.
4. Run the focused theme-service suite.

### Task 2: Reorganize the development theme library

**Files:**
- Modify: `/Users/herbert/Library/Application Support/puppyone-development/themes/README.md`
- Move: ten top-level theme CSS files into matching `<theme>/theme.css` paths
- Move: GitHub, Gothic, Newsprint, and Whitey font/license assets into matching `<theme>/fonts/` paths

1. Create one directory per theme.
2. Move each CSS file to `theme.css` without changing its theme identity or styling.
3. Move assets and update relative `url(...)` references.
4. Update the README to document the directory package as the recommended format.

### Task 3: Verify the catalog and repository

1. Run theme contract, compiler, and service tests.
2. Load the real development theme directory and require ten themes with zero diagnostics.
3. Verify every relative asset reference exists and the repository contains no copied theme assets.
4. Report the working-tree state without committing or pushing.
