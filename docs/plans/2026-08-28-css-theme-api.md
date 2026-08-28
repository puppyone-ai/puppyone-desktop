# CSS Theme API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Typora-style CSS theme API that discovers local theme packages, safely scopes their CSS to application, Markdown, or CSV surfaces, and lets users select and reload themes.

**Architecture:** Electron Main owns the per-device theme directory, package discovery, manifest validation, CSS parsing, selector scoping, package-local asset loading, and opening the directory. A top-level `*.css` file is recognized as a Markdown theme for a Typora-like authoring path; a directory with `theme.json` enables metadata and multiple targets. The renderer receives immutable compiled theme snapshots through trusted IPC, injects only compiled CSS, stores selected theme IDs in versioned local preferences, and marks stable surface roots with theme data attributes. Built-in surface themes use the same public token contract but ship as static product CSS.

**Tech Stack:** Electron trusted IPC, Node filesystem APIs, PostCSS parser, React 18, TypeScript, CSS custom properties, Vitest, Testing Library.

---

### Task 1: Theme package contract and CSS compiler

**Files:**
- Create: `electron/main/themes/theme-package-contract.mjs`
- Create: `electron/main/themes/theme-css-compiler.mjs`
- Test: `tests/electron.theme-package-contract.test.mjs`
- Test: `tests/electron.theme-css-compiler.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Write failing manifest tests**

Cover a valid version-1 manifest, unsupported schema versions, unsafe IDs, duplicate or missing entrypoints, path traversal, unknown targets, and invalid mode declarations.

**Step 2: Run the manifest test and verify RED**

Run: `npx vitest run tests/electron.theme-package-contract.test.mjs`

Expected: FAIL because the contract module does not exist.

**Step 3: Implement minimal manifest parsing**

Expose a parser that returns normalized immutable metadata. IDs must use a stable reverse-domain-compatible character set; entrypoints must be direct relative `.css` files; supported targets are `application`, `markdown`, and `csv`; supported modes are `light` and `dark`.

**Step 4: Run the manifest test and verify GREEN**

Run: `npx vitest run tests/electron.theme-package-contract.test.mjs`

Expected: PASS.

**Step 5: Write failing CSS compiler tests**

Verify `.theme-root` plus Typora-style `:root`, `html`, `body`, and `#write` aliases; automatically scope ordinary document selectors to target and theme-ID attributes; reject remote imports/URLs, selectors that escape the root, fixed positioning, and non-token declarations for the application target. Verify package-local imports and font/image assets resolve only through host callbacks.

**Step 6: Run the compiler test and verify RED**

Run: `npx vitest run tests/electron.theme-css-compiler.test.mjs`

Expected: FAIL because the compiler module does not exist.

**Step 7: Implement the compiler with PostCSS**

Parse CSS with PostCSS rather than regular expressions. Permit nested `@media` rules, inline bounded package-local imports, rewrite each comma-separated selector independently, rewrite local assets to validated data URLs, and produce deterministic compiled CSS. Move `postcss` to production dependencies because Electron Main executes the parser in packaged builds.

**Step 8: Run compiler and contract tests**

Run: `npx vitest run tests/electron.theme-package-contract.test.mjs tests/electron.theme-css-compiler.test.mjs`

Expected: PASS.

**Step 9: Commit**

Stage only the contract, compiler, tests, and dependency manifests.

Commit: `feat(theme): define safe CSS theme contract`

### Task 2: Host-owned theme discovery service

**Files:**
- Create: `electron/main/themes/theme-service.mjs`
- Test: `tests/electron.theme-service.test.mjs`

**Step 1: Write failing service tests**

Create temporary user-data directories containing Typora-style top-level CSS files plus valid, malformed, duplicate, and partially unreadable packages. Assert deterministic theme ordering, one package snapshot per manifest, local import/font resolution, isolated diagnostics, bounded file sizes, and a stable `${userData}/themes` root.

**Step 2: Run the service test and verify RED**

Run: `npx vitest run tests/electron.theme-service.test.mjs`

Expected: FAIL because the service module does not exist.

**Step 3: Implement minimal discovery**

Create the theme root on demand, scan direct child `*.css` files as Markdown themes, scan direct child package directories for `theme.json`, compile declared CSS entrypoints, keep errors attached to the offending source, and never expose absolute paths to the renderer. Package CSS may navigate among files inside its own canonical package root but may not escape it through `..` or symlinks.

**Step 4: Add open-directory and reload behavior**

`openDirectory()` creates the root and delegates only that exact host-owned path to Electron `shell.openPath`. `listThemes()` performs a fresh scan so the Reload action has deterministic behavior without a long-lived watcher.

**Step 5: Run service tests and verify GREEN**

Run: `npx vitest run tests/electron.theme-service.test.mjs`

Expected: PASS.

**Step 6: Commit**

Commit: `feat(theme): discover local CSS theme packages`

### Task 3: Trusted IPC and preload bridge

**Files:**
- Create: `electron/main/ipc/theme-ipc.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/types/electron.d.ts`
- Test: `tests/electron.theme-ipc.test.mjs`
- Test: `tests/themePreloadArchitecture.test.mjs`

**Step 1: Write failing IPC tests**

Verify `theme:list`, `theme:reload`, and `theme:open-directory` register through trusted IPC and delegate to the service without accepting renderer-provided paths.

**Step 2: Run tests and verify RED**

Run: `npx vitest run tests/electron.theme-ipc.test.mjs tests/themePreloadArchitecture.test.mjs`

Expected: FAIL because the channels and bridge do not exist.

**Step 3: Implement IPC, bootstrap, and types**

Instantiate the service with Electron's `userData` directory, register narrow handlers, expose a nested `themes` preload API, and declare the immutable renderer snapshot types.

**Step 4: Run tests and verify GREEN**

Run: `npx vitest run tests/electron.theme-ipc.test.mjs tests/themePreloadArchitecture.test.mjs tests/electron.trusted-ipc.test.mjs`

Expected: PASS.

**Step 5: Commit**

Commit: `feat(theme): expose trusted theme host API`

### Task 4: Renderer theme catalog and durable preferences

**Files:**
- Create: `src/features/themes/themeTypes.ts`
- Create: `src/features/themes/themePreferences.ts`
- Create: `src/features/themes/useThemeCatalog.ts`
- Create: `src/features/themes/ThemeStyleHost.tsx`
- Test: `tests/themePreferences.test.ts`
- Test: `tests/themeStyleHost.test.tsx`
- Modify: `src/features/app-shell/useDesktopPreferences.ts`
- Modify: `src/features/app-shell/preferences.ts`
- Modify: `src/preferences.ts`

**Step 1: Write failing preference tests**

Specify a versioned preference with independent `application`, `markdown`, and `csv` IDs. Verify missing, malformed, legacy, and unknown values fall back safely while syntactically valid installed-theme IDs remain representable.

**Step 2: Run preference tests and verify RED**

Run: `npx vitest run tests/themePreferences.test.ts`

Expected: FAIL because the preference module does not exist.

**Step 3: Implement preferences and persistence**

Add parsing, serialization, defaults, state, cross-window storage synchronization, and setters without coupling to installed-theme availability.

**Step 4: Write failing catalog/style-host tests**

Verify external CSS loads once per theme-target pair, reload replaces stale style elements, diagnostics remain visible, and rejected/missing themes never inject CSS.

**Step 5: Implement catalog and style host**

Load the host snapshot at app startup, merge it with built-in definitions, render deterministic `<style data-po-theme-style>` nodes, and expose reload/open-directory actions.

**Step 6: Run tests and verify GREEN**

Run: `npx vitest run tests/themePreferences.test.ts tests/themeStyleHost.test.tsx`

Expected: PASS.

**Step 7: Commit**

Commit: `feat(theme): manage renderer theme catalog`

### Task 5: Built-in Markdown and CSV themes with stable surface contracts

**Files:**
- Create: `src/features/themes/builtinSurfaceThemes.ts`
- Create: `src/styles/surface-themes.css`
- Modify: `src/styles.css`
- Modify: `src/App.tsx`
- Modify: `packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor.tsx`
- Modify: `packages/shared-ui/src/editor/viewers/csv/CsvTableEditor.tsx`
- Modify: `packages/shared-ui/src/styles/editor/markdown-content.css`
- Modify: `packages/shared-ui/src/styles/editor/csv-table-editor.css`
- Test: `tests/themeSurfaceArchitecture.test.ts`
- Test: `tests/markdownEditorLayout.test.ts`
- Test: `tests/csvTableVisualArchitecture.test.ts`

**Step 1: Write failing surface-contract tests**

Assert stable `data-po-theme-surface` and `data-po-theme-id` attributes on Markdown and CSV roots, semantic `--po-md-*` and `--po-csv-*` consumption, static built-in themes, and no document transaction or remount coupling.

**Step 2: Run tests and verify RED**

Run: `npx vitest run tests/themeSurfaceArchitecture.test.ts tests/markdownEditorLayout.test.ts tests/csvTableVisualArchitecture.test.ts`

Expected: FAIL on the missing theme surface contract.

**Step 3: Implement scoped theme roots**

Pass selected IDs through an appearance context or stable root attributes without changing document values, editor keys, or working-copy revisions. Request CodeMirror measurement after a theme change that can alter typography.

**Step 4: Add built-in themes**

Ship `default`, `newsprint`, and `focus` for Markdown; ship `default`, `spreadsheet`, and `ledger` for CSV. Built-ins use the same public tokens and scope selectors as external themes.

**Step 5: Run tests and verify GREEN**

Run: `npx vitest run tests/themeSurfaceArchitecture.test.ts tests/markdownEditorLayout.test.ts tests/csvTableVisualArchitecture.test.ts`

Expected: PASS.

**Step 6: Commit**

Commit: `feat(editor): apply scoped content themes`

### Task 6: Settings management and quick theme selection

**Files:**
- Create: `src/features/settings/main/ThemeSettingsSection.tsx`
- Modify: `src/features/settings/main/EditorSettingsViews.tsx`
- Modify: `src/features/settings/types.ts`
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/features/settings/SettingsWorkspaceSurface.tsx`
- Modify: `src/styles/settings-controls.css`
- Modify: `locales/renderer/*/settings.json`
- Test: `tests/themeSettings.test.tsx`

**Step 1: Write failing settings tests**

Render built-in and installed themes grouped by Application, Markdown, and Table. Verify checked selection, missing-theme fallback messaging, Reload Themes, Open Themes Folder, diagnostics, and accessible labels.

**Step 2: Run test and verify RED**

Run: `npx vitest run tests/themeSettings.test.tsx`

Expected: FAIL because the settings section does not exist.

**Step 3: Implement the management UI**

Use compact select/menu controls suitable for an unbounded installed-theme list. Keep ordinary Settings rows transparent and reuse existing control styling.

**Step 4: Run test and verify GREEN**

Run: `npx vitest run tests/themeSettings.test.tsx tests/settingsVisualArchitecture.test.ts tests/rtlArchitecture.test.ts`

Expected: PASS.

**Step 5: Commit**

Commit: `feat(settings): manage CSS themes`

### Task 7: macOS native Theme menu

**Files:**
- Modify: `electron/main/native-menu-service.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/types/electron.d.ts`
- Modify: `src/features/themes/useThemeCatalog.ts`
- Modify: `locales/native/*`
- Test: `tests/electron.native-menu-service.test.mjs`
- Test: `tests/themeNativeMenuBridge.test.tsx`

**Step 1: Write failing menu tests**

Assert a macOS Theme menu contains Application, Markdown, and Table groups, checkmarks the renderer-reported selections, offers Open Themes Folder and Reload Themes, and sends a narrow selection request to the focused renderer.

**Step 2: Run tests and verify RED**

Run: `npx vitest run tests/electron.native-menu-service.test.mjs tests/themeNativeMenuBridge.test.tsx`

Expected: FAIL because the Theme menu is absent.

**Step 3: Implement menu state synchronization**

The renderer reports selected IDs; Main validates them against built-in/default IDs plus the discovered registry, refreshes the native menu, and sends selection requests only to the focused trusted application window. The renderer remains the preference authority.

**Step 4: Run tests and verify GREEN**

Run: `npx vitest run tests/electron.native-menu-service.test.mjs tests/themeNativeMenuBridge.test.tsx`

Expected: PASS.

**Step 5: Commit**

Commit: `feat(theme): add native theme menu`

### Task 8: Documentation, integration verification, and review

**Files:**
- Create: `docs/architecture/css-theme-api.md`
- Create: `docs/examples/themes/newsprint/theme.json`
- Create: `docs/examples/themes/newsprint/markdown.css`
- Modify: `docs/architecture/desktop-appearance-settings.md`
- Modify: `README.md`

**Step 1: Document the public contract**

Document package layout, manifest schema, public tokens/selectors, security restrictions, storage scope, missing-theme behavior, author workflow, and compatibility policy. Include a copyable example package.

**Step 2: Run focused verification**

Run all theme, Markdown layout, CSV layout, settings, IPC, and native menu tests.

Expected: PASS with no warnings.

**Step 3: Run repository checks**

Run: `npm run check:shared-ui`

Run: `npm run check:boundaries`

Run: `npm run typecheck`

Run: `npm run build`

Expected: PASS.

**Step 4: Run visual smoke checks**

Run: `npm run smoke:csv-table-layout`

Run the relevant Markdown renderer smoke command documented in `package.json` or the Markdown architecture documentation.

Expected: PASS for default and non-default themes in light and dark application modes.

**Step 5: Review the complete diff**

Verify only theme-related paths are staged, generated files are current, no absolute user paths are present, and no unrelated worktree or branch changed.

**Step 6: Commit documentation and integration fixes**

Commit: `docs: document CSS theme API`
