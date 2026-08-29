# External Theme Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove distributable theme CSS from PuppyOne Desktop while preserving the theme engine, user-owned themes, and an automatically installed authoring guide.

**Architecture:** Replace the versioned starter-theme installer with a documentation-only installer. Keep all discovery and compilation paths unchanged so CSS from the user-data Themes Folder continues to work. Remove bundled theme assets and rewrite documentation around the external theme-repository boundary.

**Tech Stack:** Electron Main, Node.js filesystem APIs, Vitest, Markdown, CSS

---

### Task 1: Define the documentation-only installation contract

**Files:**
- Modify: `tests/electron.theme-service.test.mjs`

**Step 1: Write the failing test**

Replace starter installation expectations with assertions that `README.md` is installed, no bundled `.css` file is copied, and an existing user CSS theme remains discoverable and unchanged.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/electron.theme-service.test.mjs`

Expected: FAIL because the existing service still copies eight starter CSS files.

### Task 2: Implement the documentation-only installer

**Files:**
- Modify: `electron/main/themes/theme-service.mjs`
- Delete: `electron/themes/alto.css`
- Delete: `electron/themes/forest.css`
- Delete: `electron/themes/github.css`
- Delete: `electron/themes/jade.css`
- Delete: `electron/themes/newsprint.css`
- Delete: `electron/themes/night.css`
- Delete: `electron/themes/rainbow.css`
- Delete: `electron/themes/rose.css`

**Step 1: Write minimal implementation**

Remove the starter-name catalog and CSS copy loop. Install only `README.md` behind a documentation-specific marker, using create-if-missing writes so user files remain protected.

**Step 2: Run test to verify it passes**

Run: `npx vitest run tests/electron.theme-service.test.mjs`

Expected: PASS.

### Task 3: Align public documentation

**Files:**
- Modify: `electron/themes/README.md`
- Modify: `docs/css-themes.md`

**Step 1: Remove bundled-theme claims**

Describe the desktop repository as the theme engine and authoring-guide owner. Explain that downloadable CSS themes live outside this repository and must be copied into the Themes Folder.

**Step 2: Verify stale references are gone**

Run: `rg -n "installs these|starter themes|alto\.css|forest\.css|github\.css|jade\.css|newsprint\.css|night\.css|rainbow\.css|rose\.css" electron/themes docs/css-themes.md electron/main/themes/theme-service.mjs tests/electron.theme-service.test.mjs`

Expected: no stale bundled-theme claims or asset references.

### Task 4: Verify and commit

**Files:**
- Test: `tests/electron.theme-service.test.mjs`
- Test: repository test suite

**Step 1: Run focused and full checks**

Run the focused theme-service tests, the repository test suite, `git diff --check`, and the production build.

**Step 2: Review the final diff**

Confirm the eight CSS files are absent from the `origin/qubits...theme` tree diff and the local user-data Themes Folder is unchanged.

**Step 3: Commit explicit paths**

Create one local commit that removes bundled theme assets and updates installer behavior, tests, and documentation. Do not push without separate authorization.
