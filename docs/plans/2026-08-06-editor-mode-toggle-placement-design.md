# Editor Mode Toggle Placement Design

## Context

The Markdown editor supports mutually exclusive Live View and Source Code modes. The mode state and source-snapshot transition belong to `TextEditorFrame`, while the Desktop editor pane already owns interaction chrome through its three-dot actions menu. Rendering another floating control inside the document surface duplicates pane chrome, competes with document content and shell overlays, and requires independent positioning and stacking rules.

The pane actions menu already accepts document-scoped Viewer contributions. It provides the shared menu surface, focus management, keyboard navigation, outside dismissal, localization, and pane isolation used by other structured editors.

## Decision

Keep mode state and source snapshots in `TextEditorFrame`, but let Markdown request pane-menu placement. While the frame is mounted under an `EditorPaneMenuContributionProvider`, it publishes one checked menu item named Source Code. Enabling the item switches to Source Code; disabling it returns to Live View. This models the two mutually exclusive presentations as one boolean view setting and reuses the existing menu interaction contract.

Do not render the floating mode control inside a Desktop Markdown pane. Retain the inline control only as a compatibility fallback when the shared Markdown viewer is embedded without pane-menu infrastructure. Continue to scope the keyboard shortcut to events originating inside the current editor host.

## Verification

Cover contribution publication, checked-state updates, absence of floating editor chrome, and a full Desktop interaction that opens the three-dot menu and switches to source mode. Keep macOS and Control-based shortcut behavior deterministic through explicit platform injection in Electron shortcut tests.
