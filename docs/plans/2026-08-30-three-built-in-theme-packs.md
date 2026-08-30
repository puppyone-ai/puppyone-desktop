# Three Built-in Theme Packs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use test-driven-development to implement this plan task-by-task.

**Goal:** Make Default, GitHub, and Newspaper the only product-owned built-in Theme Packs and remove GitHub/Newspaper from every user or official-extension Themes Folder.

**Architecture:** PuppyOne Desktop owns three CSS entrypoints in its renderer source and registers exactly three complete built-in packs. GitHub and Newspaper use scoped CSS bundled as raw strings and injected by the existing unlayered runtime ThemeStyleHost; Default intentionally adds no visual overrides beyond the product baseline. The independent official-theme repository retains only downloadable extensions, while the development user-data Themes Folder contains only installed extensions.

**Tech Stack:** React, TypeScript, Vite CSS imports, Electron, Vitest, Node test runner.

---

### Task 1: Lock the built-in catalog contract

**Files:**
- Modify: `tests/themeStyleHost.test.tsx`
- Modify: `tests/themeSurfaceArchitecture.test.ts`
- Modify: `src/features/themes/builtinSurfaceThemes.ts`

1. Write tests asserting that the built-in catalog contains exactly `default`, `builtin.pack.github`, and `builtin.pack.newspaper`, with all three targets and `source: "builtin"`.
2. Run the focused Vitest files and confirm they fail against the current partial surface-theme catalog.
3. Replace the partial Newsprint/Focus/Spreadsheet/Ledger definitions with the three complete packs.
4. Run the focused tests and confirm they pass.

### Task 2: Bundle product-owned CSS

**Files:**
- Create: `src/styles/default.css`
- Create: `src/styles/github.css`
- Create: `src/styles/newspaper.css`
- Modify: `tests/themeSurfaceArchitecture.test.ts`

1. Add a failing architecture test requiring the three CSS imports and scoped GitHub/Newspaper selectors.
2. Run it and confirm the missing imports/selectors fail.
3. Add an explicit no-override Default CSS entrypoint and compile the existing GitHub/Newspaper application, Markdown, and CSV rules to built-in scoped selectors.
4. Import the three files as raw strings from the built-in registry and inject the selected pack through ThemeStyleHost. This preserves the existing unlayered Theme Pack precedence over CodeMirror runtime CSS while keeping the generated Interface Style import last.
5. Run the focused style and architecture tests.

### Task 3: Preserve bundled fonts outside Themes Folders

**Files:**
- Move to: `public/fonts/open-sans/*`
- Move to: `public/fonts/pt-serif/*`
- Modify: `src/styles/github.css`
- Modify: `src/styles/newspaper.css`

1. Move the Open Sans and PT Serif font files and OFL notices from the official-theme packages into the product font assets.
2. Point built-in CSS at renderer-relative `./fonts/open-sans/` and `./fonts/pt-serif/` paths so they resolve in both Vite development and the packaged Electron renderer.
3. Run the production build so Vite verifies the bundled asset paths.

### Task 4: Remove built-ins from extension locations

**Files:**
- Delete: `/Users/herbert/Puppyone-Official-Theme/themes/github/`
- Delete: `/Users/herbert/Puppyone-Official-Theme/themes/newspaper/`
- Modify: `/Users/herbert/Puppyone-Official-Theme/README.md`
- Modify: `/Users/herbert/Puppyone-Official-Theme/tests/theme-library.test.mjs`

1. Add a failing official-library test asserting GitHub and Newspaper are not extension directories.
2. Remove their source packages only after product CSS and fonts are present.
3. Update the official catalog documentation and validation test.
4. Move the two generated development copies out of `/Users/herbert/Library/Application Support/puppyone-development/themes/` to the macOS Trash so recovery remains possible.
5. Run the official repository test and validation suite.

### Task 5: Final verification

1. Run focused theme tests and ESLint.
2. Run `npm run check:boundaries` and `npm run build` in PuppyOne Desktop.
3. Run `npm test` in Puppyone-Official-Theme.
4. Confirm Settings exposes exactly three built-in packs and no duplicate local GitHub/Newspaper entries.
5. Report both repositories' branches, dirty paths, remaining worktrees, validation, and Trash recovery locations. Do not commit or push while unrelated user-owned changes remain in the worktrees.
