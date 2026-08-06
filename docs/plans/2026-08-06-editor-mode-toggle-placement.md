# Editor Mode Toggle Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Desktop editor's Source Code action clickable by moving the existing mode control away from the bottom-right feedback launcher.

**Architecture:** Preserve `TextEditorFrame` as the sole owner of Live View and Source Code state. Change only the shared editor chrome placement from the physical right edge to the logical inline-start edge, and verify both layout and behavior.

**Tech Stack:** React, TypeScript, CSS logical properties, Vitest, happy-dom.

---

### Task 1: Reproduce the collision contract and verify mode behavior

**Files:**
- Create: `tests/editorModeToggle.test.tsx`
- Inspect: `packages/shared-ui/src/styles/editor/editor-chrome.css`
- Inspect: `src/features/app-shell/desktop-help-launcher.css`
- Inspect: `packages/shared-ui/src/editor/viewers/TextEditorFrame.tsx`

**Step 1: Write the failing placement test**

Read the `.editor-mode-toggle` CSS block and require `inset-inline-start: 12px`, while forbidding a physical `right` declaration.

**Step 2: Write the behavioral regression test**

Render `TextEditorFrame` with distinct Live View and Source Code outputs, click the localized Source Code action, and assert that only the source output remains.

**Step 3: Run the tests to verify RED**

Run: `npx vitest run tests/editorModeToggle.test.tsx`

Expected: the behavior assertion passes, while the placement assertion fails because the control still uses `right: 12px`.

### Task 2: Move the control to the starting edge

**Files:**
- Modify: `packages/shared-ui/src/styles/editor/editor-chrome.css:26-38`
- Test: `tests/editorModeToggle.test.tsx`

**Step 1: Write the minimal implementation**

Replace `right: 12px` in `.editor-mode-toggle` with `inset-inline-start: 12px`. Do not change mode state, feedback placement, or z-index.

**Step 2: Run the focused test to verify GREEN**

Run: `npx vitest run tests/editorModeToggle.test.tsx tests/desktopEditorArchitecture.test.ts`

Expected: PASS.

**Step 3: Run editor and architecture regressions**

Run: `npx vitest run tests/markdownPreviewReadiness.test.tsx tests/markdownSourceSnapshot.test.tsx tests/localMarkdownEditorPersistence.test.tsx tests/rtlArchitecture.test.ts`

Expected: PASS.

**Step 4: Run required shared UI and project checks**

Run: `npm run check:shared-ui`, `npm run lint`, and `npm test`.

Expected: PASS.

**Step 5: Commit**

Commit the CSS fix, behavioral regression, and planning documents with a focused fix message.
