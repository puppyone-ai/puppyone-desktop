# External Starter Themes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use test-driven-development and execute each task in order.

**Goal:** Move GitHub, Forest, Night, and Rose from renderer-bundled CSS to editable packages installed in the user's Themes Folder.

**Architecture:** Electron Main owns copy-if-missing installation from `electron/themes/` to user data. The normal local-package catalog compiles and serves the installed CSS; the renderer retains only Default as a built-in definition.

**Tech Stack:** Electron Main, Node.js filesystem APIs, PostCSS theme compiler, React theme catalog, Vitest.

---

### Task 1: Define the external-package contract

**Files:**
- Modify: `tests/themeStyleHost.test.tsx`
- Modify: `tests/electron.theme-service.test.mjs`
- Modify: `tests/electron.theme-css-compiler.test.mjs`

1. Add failing tests that reject renderer-bundled starter definitions/CSS.
2. Add failing tests for copy-if-missing installation and preservation of an edited destination.
3. Add failing tests for safe dark root selector compilation.
4. Run the focused tests and confirm RED for missing behavior.

### Task 2: Create starter packages and installer

**Files:**
- Create: `electron/themes/{github,forest,night,rose}/theme.json`
- Create: `electron/themes/{github,forest,night,rose}/{application,markdown,csv}.css`
- Modify: `electron/main/themes/theme-service.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/main/themes/theme-css-compiler.mjs`

1. Add the four complete packages using PuppyOne public tokens.
2. Inject the trusted template root into the theme service.
3. Install missing packages with temporary-directory copy and atomic rename.
4. Preserve every existing destination.
5. Support only the documented dark root selector forms.
6. Run the focused tests and confirm GREEN.

### Task 3: Remove renderer-bundled starter themes

**Files:**
- Modify: `src/features/themes/builtinSurfaceThemes.ts`
- Modify: `packages/shared-ui/src/styles/editor.css`
- Delete: `packages/shared-ui/src/styles/editor/theme-packs.css`
- Delete: `packages/shared-ui/src/styles/editor/theme-packs/*.css`
- Modify: affected theme tests

1. Remove the four built-in definitions and CSS imports.
2. Keep Default and existing advanced single-surface defaults unchanged.
3. Verify the four installed packages appear through the external catalog.

### Task 4: Documentation and release validation

**Files:**
- Modify: `docs/css-themes.md`
- Modify: packaging/theme architecture tests as required

1. Document starter-package location, editability, and no-overwrite behavior.
2. Run focused theme tests, TypeScript, ESLint, boundary checks, full tests, and production build.
3. Request independent code review and resolve all Critical/Important findings.
