# Editor Mode Toggle Placement Design

## Context and Root Cause

The Desktop Markdown mode switch is rendered by the shared `TextEditorFrame` and its state transition works: choosing Source Code changes the frame from `renderLive` to `renderSource`, and `MarkdownCodeMirrorEditor` removes the Live Preview extensions. The apparent failure is an interaction collision. `.editor-mode-toggle` and the shell-level `.desktop-feedback` launcher are both absolutely positioned at the bottom-right 12-pixel inset. The feedback launcher has z-index 44 while the editor control has z-index 20, so the shell overlay intercepts pointer input over the right side of the mode switch. The Source Code action is therefore inaccessible even though it is present in the DOM.

## Decision

Keep the existing two-button, single-surface mode control and move it to the bottom-left of the editor. Use `inset-inline-start: 12px` rather than the physical `left` property so the control remains at the natural starting edge in right-to-left interfaces. Remove the physical `right` declaration. Do not raise z-index, add another mode state, move the feedback launcher, or create a Desktop-specific toolbar. This leaves `TextEditorFrame` as the only mode owner and removes the collision at its source.

Alternatives considered were raising the editor control above the feedback launcher and offsetting it farther from the right edge. Raising z-index would make two controls continue to occupy the same space, while a fixed offset would remain coupled to the feedback button's current size. Moving to the opposite edge is simpler and matches the requested placement.

## Verification

Add a CSS contract test that fails while the mode control uses the right edge and requires the logical starting edge. Add a behavioral test that renders `TextEditorFrame`, clicks Source Code, and confirms the source surface becomes active. Run focused editor tests, shared UI checks, lint, and the full suite.
