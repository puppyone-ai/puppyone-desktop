# Single-file Themes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a portable one-CSS coordinated theme format and migrate GitHub, Forest, Night, and Rose to it without breaking Typora CSS or directory packages.

**Architecture:** Electron Main recognizes a top-level CSS as coordinated only when it declares `@puppyone-theme`, extracts target-specific `@puppyone` blocks, and delegates each extracted stylesheet to the existing scoped compiler. Legacy top-level CSS remains Markdown-only, while manifest directory packages remain the advanced multi-file format.

**Tech Stack:** Electron Main ESM, PostCSS, React theme catalog, Vitest, TypeScript.

---

### Task 1: Define the single-file parsing contract

**Files:**
- Create: `electron/main/themes/theme-single-file-contract.mjs`
- Test: `tests/electron.theme-single-file-contract.test.mjs`

**Step 1: Write failing parser tests**

Cover a valid `@puppyone-theme` block, inferred targets, extracted target CSS, optional author, light/dark modes, duplicate metadata, duplicate/unknown targets, nested target blocks, rules outside target blocks, and a source without metadata returning the legacy classification.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run tests/electron.theme-single-file-contract.test.mjs`

Expected: FAIL because the parser module does not exist.

**Step 3: Implement the minimal parser**

Parse with PostCSS, validate metadata using the same ID/name/version/mode constraints as `theme-package-contract.mjs`, clone each target block's nodes into target-specific CSS, and return either `null` for legacy CSS or a frozen coordinated-theme descriptor.

**Step 4: Run the tests and verify GREEN**

Run: `npx vitest run tests/electron.theme-single-file-contract.test.mjs tests/electron.theme-package-contract.test.mjs`

Expected: PASS.

**Step 5: Commit**

Stage only the parser and its tests, then commit `feat(theme): parse single-file theme packs`.

### Task 2: Load and compile single-file packs

**Files:**
- Modify: `electron/main/themes/theme-service.mjs`
- Modify: `tests/electron.theme-service.test.mjs`
- Test: `tests/electron.theme-css-compiler.test.mjs`

**Step 1: Write failing service tests**

Create one top-level CSS containing application, Markdown, and CSV blocks. Assert that discovery returns one three-target `local-css` theme and that compiled CSS is scoped to the exact target and ID. Retain a separate assertion that metadata-free top-level CSS remains Markdown-only.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run tests/electron.theme-service.test.mjs`

Expected: FAIL because the current loader compiles the entire file as Markdown.

**Step 3: Implement service integration**

Read the top-level source once, detect the coordinated descriptor, compile each extracted target with one aggregate compilation budget, and preserve the existing standalone Markdown path when the descriptor is `null`.

**Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/electron.theme-single-file-contract.test.mjs tests/electron.theme-service.test.mjs tests/electron.theme-css-compiler.test.mjs`

Expected: PASS.

**Step 5: Commit**

Stage only the service and focused tests, then commit `feat(theme): load coordinated single-file themes`.

### Task 3: Migrate all four starter themes

**Files:**
- Create: `electron/themes/github.css`
- Create: `electron/themes/forest.css`
- Create: `electron/themes/night.css`
- Create: `electron/themes/rose.css`
- Delete: `electron/themes/{github,forest,night,rose}/application.css`
- Delete: `electron/themes/{github,forest,night,rose}/markdown.css`
- Delete: `electron/themes/{github,forest,night,rose}/csv.css`
- Delete: `electron/themes/{github,forest,night,rose}/theme.json`
- Modify: `electron/main/themes/theme-service.mjs`
- Modify: `tests/electron.theme-service.test.mjs`
- Modify: `tests/themeStyleHost.test.tsx`

**Step 1: Write failing starter installation tests**

Assert that the bundled template root contains four CSS files and no same-name starter directories, fresh installation copies four files, all compile as three-target packs, an existing CSS file is preserved, a legacy same-name directory suppresses the conflicting starter, and the new marker respects later deletion.

**Step 2: Run the tests and verify RED**

Run: `npx vitest run tests/electron.theme-service.test.mjs tests/themeStyleHost.test.tsx`

Expected: FAIL against the current directory templates and installer.

**Step 3: Convert templates and installer**

Combine each starter's declarations under metadata plus application/Markdown/CSV target blocks. Replace the directory installer descriptor list with file descriptors, use ASAR-compatible `readFile` plus atomic file write, increment the starter marker version, and preserve any existing file or legacy directory.

**Step 4: Run focused tests and ASAR smoke**

Run: `npx vitest run tests/electron.theme-single-file-contract.test.mjs tests/electron.theme-service.test.mjs tests/themeStyleHost.test.tsx`

Then package `electron/themes` into a temporary ASAR and use the repository Electron runtime to read and install one starter file.

Expected: all tests and the ASAR smoke pass.

**Step 5: Commit**

Stage explicit starter, installer, and test paths, then commit `refactor(theme): ship portable starter CSS files`.

### Task 4: Document the preferred and advanced formats

**Files:**
- Modify: `docs/css-themes.md`
- Modify: `docs/plans/2026-08-29-external-starter-themes-design.md`
- Test: `tests/themeSettings.test.tsx`

**Step 1: Update the documentation contract**

Document single-file CSS first, including a complete metadata/target example, target safety, reload behavior, and sharing instructions. Reframe `theme.json` packages as the advanced multi-file option for assets and imports. Mark the older starter directory distribution section as superseded by the single-file design.

**Step 2: Run documentation and architecture checks**

Run: `npm run check:boundaries`

Expected: PASS.

**Step 3: Commit**

Stage only documentation and related contract tests, then commit `docs: recommend single-file CSS themes`.

### Task 5: Final verification and review

**Files:**
- Review: all changes since `3f1a9ad1`

**Step 1: Run static verification**

Run: `npx tsc --noEmit`, `npm run lint`, `node --check` for modified Electron modules, and `git diff --check`.

Expected: PASS.

**Step 2: Run full verification**

Run: `npm test -- --reporter=dot` and `npm run build`.

Expected: PASS.

**Step 3: Request independent code review**

Review parsing ambiguity, selector/target isolation, budget accounting, path containment, legacy compatibility, non-overwrite installation, marker semantics, ASAR behavior, and documentation. Fix all Critical and Important findings with failing tests first.

**Step 4: Confirm repository state**

Verify the `theme` worktree is clean, report its divergence from `origin/theme`, and leave unrelated worktrees untouched. Do not push without explicit authorization.
