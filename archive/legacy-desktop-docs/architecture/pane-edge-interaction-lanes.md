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

Every vertical pane boundary has two adjacent, non-overlapping pointer lanes
but only two layout panes:

1. The scroll pane owns its final `--po-scrollbar-size` (12px). Its thumb uses
   6px idle geometry while fading away at rest, then expands to 8px while the
   surface is active.
2. An overlay sash owns the next `--po-pane-resizer-hit-size` (8px). It starts
   exactly at the shared boundary and extends over the neighboring pane without
   consuming grid or flex layout width.

The visual divider remains at the junction between those lanes. The Sidebar
and Editor both terminate at that same coordinate. The overlay sash is
transparent until hover or drag; it must never be represented by a third grid
track, padding compensation, or an extension of either pane's frame.

The resize lane uses `SidebarResizeHandle paneEdge`, which adds the shared
`.po-pane-edge-resize-handle` contract. Feature CSS may choose the boundary
anchor and visual treatment, but it must not redefine the hit width, translate
the handle across the boundary, or use a negative half-width offset.

Electron native child views are composited above renderer DOM. Any overlay sash
that can intersect a `WebContentsView` registers its viewport rectangle through
the owner-scoped native pointer-routing contract. The main process forwards an
initial primary `mouseDown` in that exact rectangle to the renderer; the normal
pointer-passthrough lease then forwards move/up for the active gesture. Routing
regions affect hit testing only and never alter native surface or pane bounds.
Non-interactive pane presentation chrome may paint above the sash so selection
or drag outlines remain complete; it must retain `pointer-events: none`.

## Current Boundary Mapping

- Data explorer: the resize handle is a sibling after `.explorer-column`,
  absolutely anchored at `--data-explorer-width`, and extends into the Editor.
  `.data-content` remains a two-column grid. The Desktop composition measures
  the sash and registers its rectangle for native initial-press routing.
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
- Pane-edge handles never create a dedicated grid/flex layout track.
- A scrollbar and a pane resizer never occupy the same pixels, regardless of
  stacking order.
- A resize sash is transparent over the neighboring pane and places its visual
  divider on the scroll-facing edge; it never appears as extra pane padding.
- Native pointer routing is limited to published sash rectangles and primary
  presses. Ordinary input inside a native surface is never intercepted.
- Table cell, row, column, and diagonal table-resize controls are not pane
  boundaries and are outside this contract.

The architecture checks live in `tests/scrollbarArchitecture.test.ts`.

## Third-party scroll surfaces

Third-party widgets that render a private scrollbar DOM, such as xterm, cannot
attach the product primitive to their actual scroll owner. They must still use
the same `--po-scrollbar-size`, thumb-size, color, radius, and activity tokens.
The widget's hit track and its painted thumb are separate geometry: the track
stays at the pane edge while the thumb is centered inside it. Do not add outer
panel padding or a second spacer merely to imitate a scrollbar gutter.

The xterm adapter is feature-owned in
`src/features/desktop-terminal/ui/desktop-terminal.css`; its architecture checks
live in `tests/desktop-terminal.architecture.test.ts`.
