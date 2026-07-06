# Desktop Sidebar Scroll Lists

This document records the shared layout contract for scrollable sidebar lists:
the files explorer, Git working tree, Git history, and future sidebar list
surfaces.

## Problem

Sidebar lists had two competing layout models:

- Some lists used the scroll container to own native scrollbar layout.
- Other lists detected `is-scrollable` and then changed row width or row right
  margin to compensate for scrollbar width.

The second model is fragile. It couples row geometry to scrollbar presence and
creates subtle regressions where rows become wider or narrower for the wrong
reason.

## Design Goal

Sidebar list layout has three separate responsibilities:

- Scroll area owns overflow, scrollbar style, and scrollbar gutter.
- List owns content padding.
- Row owns its own height, radius, internal content padding, and `width: 100%`.

Rows must not know whether the list is scrollable.

## Implementation Rules

1. Keep scrollbar layout in the scroll area.

   Scroll containers may use `is-scrollable` only for scroll-area behavior such
   as showing a hidden thumb while the user is hovering or actively scrolling.
   Do not use `is-scrollable` to reserve gutter space or to change row width,
   row margin, or row padding.

2. Put horizontal gutters on the list, not on every row.

   Sidebar lists should use the product sidebar gutter tokens as
   `padding-inline`. Rows inside those lists should use `width: 100%` and
   vertical-only margins or list gaps.

3. Keep rows independent from native scrollbar width.

   Do not introduce variables such as `scroll-row-width`,
   `scroll-row-right-gap`, `row-gap-minus-scrollbar`, or product-owned
   reserved scrollbar gutters. macOS overlay scrollbars may draw over the
   scrollport; sidebar rows should keep the same width in short and long lists.

4. Use `ResizeObserver` only to classify scroll containers.

   `useScrollableState` and `useScrollableDescendantClasses` may add
   `is-scrollable` to scroll containers. That state must remain a scroll-area
   state, not a row-layout state.

5. Keep shared tokens at the sidebar level.

   Use `--desktop-sidebar-row-left-gap`,
   `--desktop-sidebar-row-right-gap`, `--desktop-sidebar-row-height`,
   `--desktop-sidebar-row-radius`, and content inset tokens. Feature-specific
   aliases are acceptable, but they must not reintroduce scrollbar compensation.

## Current Code Boundaries

- `vendor/shared-ui/src/styles/data-workspace.css`
  - files explorer scroll area, list padding, tree row geometry, and guide-line
    positioning
- `src/features/source-control/styles/sidebar-base.css`
  - Git sidebar main scroll list and generic sidebar row model
- `src/features/source-control/styles/history-list.css`
  - Git history list rows and nested history scroll area
- `src/features/source-control/styles/sidebar-resources.css`
  - Git working tree rows and nested resizable-section scroll areas
- `vendor/shared-ui/src/primitives/useScrollableClass.ts`
  - scrollability detection and `is-scrollable` class assignment

## Invariants

- Sidebar scrollbars do not reserve product layout space. They may overlay the
  scrollport according to platform behavior.
- Sidebar lists own horizontal gutters through padding.
- Sidebar rows use `width: 100%` inside their list.
- `is-scrollable` must not appear in selectors that change row width, row
  margin, or row padding.
- If a row appears too wide or too narrow when a scrollbar appears, fix the
  scroll/list boundary instead of adding row-specific scrollbar math.
