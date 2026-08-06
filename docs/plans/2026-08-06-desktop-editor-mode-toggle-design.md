# Desktop Editor Mode Toggle Design

## Context

The shared Markdown editor already supports two mutually exclusive presentations: Live View and Source Code. `TextEditorFrame` owns the mode state, renders the appropriate CodeMirror configuration, and exposes the existing bottom-right toggle. The standalone Desktop composition currently passes `hidePreviewSourceView` to `DataWorkspace`, which forces Live View and removes that toggle. This is why the shared capability exists in code but is unreachable in the Desktop application.

## Decision

The Desktop file workspace will stop hiding the shared source-view controls. No new toolbar, preference, or editor state will be introduced. Markdown files will continue to open in Live View by default, and users can switch to Source Code with the existing bottom-right control. Switching remains single-surface: the editor never renders source and preview side by side. The existing shared editor remains the sole owner of mode state and source snapshots, so editing, automatic persistence, and external-change reconciliation keep their current data flow.

This approach is preferred over adding a second Desktop-specific button because it avoids duplicate controls and preserves the shared UI contract. It is also preferred over a preference flag because the user requested a directly available control rather than another configuration choice.

## Verification

Add an application-composition architecture test that fails while `DesktopDataWorkspaceSurface` hides the source view and also records that the shared frame retains both localized mode actions. Then remove only the Desktop hiding prop. Run the focused regression test, the Markdown editor tests, the shared UI architecture checks, and the full relevant test suite. Manual verification should confirm that opening a Markdown file shows the bottom-right Live View and Source Code buttons and that switching does not create a split view.
