# Desktop Menu Surface

This document records the shared surface contract for desktop menus: titlebar
project and branch menus, file-tree creation menus, node action menus, and
future shell menus.

## Problem

Menus were styled by feature-local selectors. That made project switcher menus,
branch menus, node action menus, and create-entry menus drift in background,
border, radius, shadow, row padding, and icon alignment. It also made small
visual fixes look like one-off patches instead of a durable product rule.

## Design Goal

Desktop menus should share one official component structure and surface style
while still allowing each menu to own its placement, size, and content.

- Menu background, border, shadow, and radius come from shared tokens.
- Menu row left inset, icon slot, label gap, height, and item radius come from
  shared tokens.
- Menu rows use the same React primitive for icon, label, detail, trailing
  status, selected, disabled, and destructive states.
- Existing menu classes remain compatible.
- New menu containers and rows use the shared desktop menu primitives.
- Feature CSS owns only feature-specific geometry and scroll layout.

## Implementation Rules

1. Use the shared menu surface tokens.

   Menu surfaces must use `--po-menu-bg`, `--po-menu-border`,
   `--po-menu-shadow`, and `--po-menu-radius`. Menu items should use
   `--po-menu-padding`, `--po-menu-item-height`,
   `--po-menu-item-padding-inline`, `--po-menu-item-gap`,
   `--po-menu-icon-slot-size`, and `--po-menu-item-radius` unless a component
   has a stricter local reason.

2. Use the React primitives for menu structure.

   New desktop menu surfaces should render `DesktopMenuSurface`, and new menu
   rows should render `DesktopMenuItem`. Use `DesktopMenuSection` for grouped
   lists and `DesktopMenuSeparator` for dividers. Legacy menu classes such as
   `desktop-titlebar-menu`, `desktop-branch-menu`, and
   `desktop-node-action-menu` may still be passed as feature geometry classes,
   but they should not define row internals.

3. Keep shared surface styling in `src/styles/menus.css`.

   Feature CSS may set position, width, max-height, and scroll regions.
   It should not hard-code a menu's background, border color, radius, or
   shadow with panel/sidebar variables. It should also avoid ad hoc row
   padding, font size, font weight, icon slot, or icon-label gap values that
   make menu rows drift from the shared menu rhythm.

4. Keep interactive trailing actions outside the row button.

   A menu row that needs a secondary control (for example Copy path on a
   project switcher item) must not nest a button inside `DesktopMenuItem`.
   Use a feature row wrapper with a primary `menuitem` button plus a sibling
   action button, and keep the row visuals on the shared menu item tokens.

5. Keep React abstraction proportional.

   `DesktopMenuSurface` and `DesktopMenuItem` intentionally do not own opening,
   closing, focus trapping, or collision placement. Those behaviors still belong
   to each feature until they are shared enough to justify a behavior-level
   primitive. The current primitive owns structure and visual rhythm.

## Current Code Boundaries

- `src/styles/tokens.css`
  - defines product menu tokens for light, dark, and preset themes
- `src/styles/menus.css`
  - defines the shared menu surface, item structure, row typography, and states
- `src/components/DesktopMenu.tsx`
  - defines `DesktopMenuSurface`, `DesktopMenuItem`, `DesktopMenuSection`, and
    `DesktopMenuSeparator`
- `src/styles/titlebar.css`
  - owns titlebar menu positioning
- `src/styles/layout.css`
  - owns project switcher menu list and scroll layout
- `src/styles/file-actions.css`
  - owns create-entry and node action menu positioning and sizing
- `src/features/app-shell/*`
  - titlebar project, branch, and external-open menu rendering
- `src/features/data-workspace/nodeActions.tsx`
  - file-tree create-entry and node action menu rendering

## Invariants

- Do not introduce a desktop menu background that bypasses `--po-menu-bg`.
- Do not use `--po-sidebar`, `--po-panel`, or `--po-overlay` directly as a
  menu surface background.
- Do not hard-code menu item left padding, icon slot width, or icon-label gap
  when the shared item tokens can express the layout.
- Do not hand-roll menu row button markup when `DesktopMenuItem` can express
  the row.
- Do not nest interactive controls inside `DesktopMenuItem`; secondary actions
  such as Copy path belong in a sibling control on a feature row wrapper.
- Use `DesktopMenuSurface` for new menu containers.
- Keep shared surface and row visuals in `menus.css`; keep menu-specific
  geometry in the feature stylesheet.
