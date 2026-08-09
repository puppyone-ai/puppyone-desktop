# Pane Edge Interaction Lanes

This document defines the app-wide contract for a scrollbar next to a
resizable pane boundary. It applies to the Data explorer, the Markdown/editor
surface next to the auxiliary panel, Git History, and future split panes.

## Problem

A scrollbar and a resize handle cannot share the same pointer area. A resize
handle normally has a higher stacking order, so centering it across a pane
boundary intercepts drags intended for the scrollbar. Making either control
wider does not solve that ownership conflict.

## Contract

Every vertical pane boundary has two adjacent, non-overlapping lanes:

1. The scroll pane owns its final `--po-scrollbar-size` (12px). Its thumb uses
   6px idle geometry while fading away at rest, then expands to 8px while the
   surface is active.
2. The neighboring pane owns the next `--po-pane-resizer-hit-size` (8px).
   The resize handle starts exactly at the boundary and extends away from the
   scroll pane.

The resize lane uses `SidebarResizeHandle paneEdge`, which adds the shared
`.po-pane-edge-resize-handle` contract. Feature CSS may choose the boundary
anchor and visual treatment, but it must not redefine the hit width, translate
the handle across the boundary, or use a negative half-width offset.

## Current Boundary Mapping

- Data explorer: the resize handle is a sibling after `.explorer-column`,
  anchored at `--data-explorer-width`, and extends into the main editor pane.
- Git History: the resize handle is a sibling after the history tree, anchored
  at `--desktop-history-tree-width`, and extends into the commit-detail pane.
- Auxiliary panel: the resize handle starts at the panel's inline-start edge
  and extends into the panel. The Markdown/CodeMirror scrollbar remains wholly
  inside the editor on the opposite side of that boundary.

Logical inset properties preserve the same ownership in RTL.

## Invariants

- Every vertical pane resize handle uses `paneEdge`.
- `.po-pane-edge-resize-handle` is the only owner of pane-resizer hit width.
- Pane-edge handles never use `transform` for placement.
- Pane-edge handles never use a negative offset to straddle a boundary.
- A scrollbar and a pane resizer never occupy the same pixels, regardless of
  stacking order.
- Table cell, row, column, and diagonal table-resize controls are not pane
  boundaries and are outside this contract.

The architecture checks live in `tests/scrollbarArchitecture.test.ts`.
