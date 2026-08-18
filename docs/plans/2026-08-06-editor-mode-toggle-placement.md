# Editor Mode Toggle Placement Implementation Plan

**Goal:** Move the Desktop Markdown Live View / Source Code switch into the existing three-dot pane menu and make shortcut coverage platform-complete.

## Implementation

1. Add an explicit pane-menu placement option to `TextEditorFrame` without moving mode or snapshot ownership out of the frame.
2. Publish a document-scoped Source Code toggle through `EditorPaneMenuContributionProvider` and use the existing inline control only when no pane-menu provider exists.
3. Configure `MarkdownViewer` to use pane-menu placement.
4. Make the Electron shortcut controller accept an injected platform for deterministic tests while retaining `process.platform` in production.
5. Cover macOS Command shortcuts, Windows/Linux Control shortcuts, rejected modifier combinations, focused-editor gating, trusted IPC, renderer mode shortcuts, and the full Desktop three-dot menu interaction.

## Verification

Run the focused Markdown menu and shortcut tests, TypeScript, shared UI architecture checks, lint, repository boundary checks, and the complete Vitest suite before updating the pull request.
