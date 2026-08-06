# Desktop Editor Mode Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the existing Live View and Source Code switch in the standalone Desktop Markdown editor.

**Architecture:** Keep `TextEditorFrame` as the single owner of editor mode and source snapshots. Change only the Desktop composition so it no longer forces `hidePreviewSourceView`, preserving the shared default behavior and existing bottom-right control.

**Tech Stack:** React, TypeScript, Vitest, shared PuppyOne editor components.

---

### Task 1: Lock the Desktop composition contract

**Files:**
- Create: `tests/desktopEditorArchitecture.test.ts`
- Inspect: `src/features/app-shell/DesktopDataWorkspaceSurface.tsx`
- Inspect: `packages/shared-ui/src/editor/viewers/TextEditorFrame.tsx`

**Step 1: Write the failing test**

Add a Vitest source-contract test which expects the Desktop surface not to contain `hidePreviewSourceView`, while confirming the shared editor retains `editor.mode.live` and `editor.mode.source` actions.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktopEditorArchitecture.test.ts`

Expected: FAIL because `DesktopDataWorkspaceSurface` currently contains `hidePreviewSourceView`.

**Step 3: Commit the regression test**

Commit the failing contract test separately if the repository workflow permits red commits; otherwise include it with the minimal implementation commit after observing the failure.

### Task 2: Expose the existing mode control

**Files:**
- Modify: `src/features/app-shell/DesktopDataWorkspaceSurface.tsx:194`
- Test: `tests/desktopEditorArchitecture.test.ts`

**Step 1: Write minimal implementation**

Remove the `hidePreviewSourceView` prop from the Desktop `DataWorkspace` composition. Do not add another state variable, preference, toolbar, or mode implementation.

**Step 2: Run test to verify it passes**

Run: `npx vitest run tests/desktopEditorArchitecture.test.ts`

Expected: PASS.

**Step 3: Run focused editor regressions**

Run: `npx vitest run tests/markdownPreviewReadiness.test.tsx tests/markdownSourceSnapshot.test.tsx tests/localMarkdownEditorPersistence.test.tsx`

Expected: PASS with both modes using the existing source snapshot and persistence behavior.

**Step 4: Run required shared UI checks**

Run: `npm run check:shared-ui`

Expected: PASS.

**Step 5: Run project verification**

Run: `npm test -- --run`

Expected: PASS.

**Step 6: Commit**

Commit the implementation, regression test, design, and plan with a focused feature message.
