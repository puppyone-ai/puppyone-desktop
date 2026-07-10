# Desktop Sidebar Scroll Lists

This document records the shared layout contract for scrollable sidebar lists:
the files explorer, Git working tree, Git history, cloud sidebar lists, and
future sidebar list surfaces. It also records the app-wide scrollbar styling
rule that the contract depends on.

Git status semantics and Source Control state ownership are documented in
[Local Source Control Sidebar](git/local-source-control-sidebar.md).

## Problem

Sidebar lists historically had two failure classes:

1. Competing layout models. Some lists let the scroll container own native
   scrollbar layout, others detected `is-scrollable` and changed row width or
   row right margin to compensate for scrollbar width. The second model
   couples row geometry to scrollbar presence and regresses easily.

2. Non-deterministic scrollbar geometry. The stylesheet set both the standard
   properties (`scrollbar-width`, `scrollbar-color`) and the WebKit
   pseudo-elements (`::-webkit-scrollbar*`). Since Chromium 121, setting
   either standard property on an element makes Chromium ignore all
   `::-webkit-scrollbar` styling for that element and render native
   scrollbars instead. On macOS, native scrollbars overlay or reserve layout
   space depending on System Settings > Appearance > "Show scroll bars"
   (and on whether a mouse is connected). The same build therefore showed
   scrollbars that "sometimes take width, sometimes do not" depending on the
   machine, which repeatedly broke row alignment in ways no CSS change could
   fix while both systems were present.

## Design Goal

Scrollbar behavior must be deterministic: identical on every machine,
independent of macOS scrollbar settings, and independent of whether a list
currently overflows.

Sidebar list layout keeps three separate responsibilities:

- Scroll area owns overflow, scrollbar style, and the reserved scrollbar
  gutter.
- List owns content padding.
- Row owns its own height, radius, internal content padding, and
  `width: 100%`.

Rows must not know whether the list is scrollable.

The shared visual edge contract is:

- `12px` effective inline space on both sides of a sidebar row;
- `8px` block space at the outer start and end of a sidebar list;
- `6px` internal row content inset after the row's outer edge.

These are visual measurements, not a requirement that every sidebar use the
same four-value `padding` declaration. A reserved `6px` scrollbar gutter means
a scrolling list has only `6px` of CSS padding on the inline end while still
producing the same effective `12px` edge. Git's outer wrapper does not scroll,
so its section rows and nested scroll lists own the inline edge instead.

## Scrollbar Styling Rules (app-wide)

1. Style scrollbars only through `::-webkit-scrollbar*` pseudo-elements.

   Never set the standard `scrollbar-width` or `scrollbar-color` properties
   anywhere in the app, including `* { ... }` resets, third-party widget
   overrides (xterm, CodeMirror widgets), menus, and dialogs. One standard
   declaration on an element silently disables every WebKit rule for it and
   reintroduces platform-dependent native scrollbars. To hide a scrollbar,
   use `::-webkit-scrollbar { display: none; }`, not `scrollbar-width: none`.

   The global baseline lives in `src/styles/scrollbars.css`: 6px
   (`--po-scrollbar-size`) classic scrollbars with a transparent track.
   Custom WebKit scrollbars are always "classic": when a container
   overflows, the scrollbar consumes layout width. They never overlay.

2. Reserve the gutter in sidebar scroll containers.

   Every sidebar scroll container sets `scrollbar-gutter: stable`, so the
   scrollbar width (`--desktop-sidebar-scrollbar-width`) is reserved whether
   or not the list currently overflows. Row width is therefore identical in
   short and long lists.

   Note `scrollbar-gutter: stable` also reserves space when `overflow` is
   `hidden`. Non-scrolling flex wrappers that share a class with scroll
   containers must opt out with `scrollbar-gutter: auto` (see
   `.desktop-git-sidebar-list`).

3. Compensate the reserved gutter in the list's right padding.

   The reserved gutter sits between the border and the padding area, so
   content would be inset by gutter + padding on the right. Lists inside a
   reserved-gutter scroll container reduce their right padding by the
   scrollbar width so the total right inset equals the standard row gap:

   - shared token: `--desktop-sidebar-scroll-right-gap` =
     `calc(--desktop-sidebar-row-right-gap - --desktop-sidebar-scrollbar-width)`
   - feature-level equivalents use the same `calc()` with their local gap
     aliases (for example
     `calc(var(--git-sidebar-right-gap) - var(--git-sidebar-scrollbar-width))`).

   Lists whose rows own their horizontal margins through
   `--desktop-sidebar-row-right-gap` (cloud sidebar) instead override that
   token to `--desktop-sidebar-scroll-right-gap` on the scroll container.

## Implementation Rules

1. Keep scrollbar layout in the scroll area.

   Scroll containers may use `is-scrollable` only for scroll-area behavior
   such as showing a hidden thumb while the user is hovering or actively
   scrolling (`::-webkit-scrollbar-thumb` background swaps only). Do not use
   `is-scrollable` to reserve gutter space or to change row width, row
   margin, or row padding.

2. Put horizontal gutters on the list, not on every row.

   Sidebar lists should use the product sidebar gutter tokens as
   `padding-inline`, with the right side reduced per Scrollbar Styling
   Rule 3. Rows inside those lists should use `width: 100%` and
   vertical-only margins or list gaps.

3. Keep rows independent from native scrollbar width.

   Do not introduce variables such as `scroll-row-width`,
   `scroll-row-right-gap`, or `row-gap-minus-scrollbar` at the row level.
   Gutter compensation happens exactly once, on the scroll container or its
   list, never on rows.

4. Use `ResizeObserver` only to classify scroll containers.

   `useScrollableState` and `useScrollableDescendantClasses` may add
   `is-scrollable` to scroll containers. That state must remain a
   scroll-area state, not a row-layout state.

5. Keep shared tokens at the sidebar level.

   Use `--desktop-sidebar-row-left-gap`, `--desktop-sidebar-row-right-gap`,
   `--desktop-sidebar-scroll-right-gap`,
   `--desktop-sidebar-scrollbar-width`, `--desktop-sidebar-row-height`,
   `--desktop-sidebar-row-radius`, and content inset tokens.
   Feature-specific aliases are acceptable, but they must not reintroduce
   row-level scrollbar compensation.

6. Share visual contracts, not incidental shorthands.

   Data, Git, Settings, Cloud, Access, Integrations, and Changes must resolve
   to the same outer edge rhythm even though their scroll ownership differs. Use
   `--desktop-sidebar-list-padding-block` for the `8px` list edge and the
   shared row gap tokens for the `12px` inline edge. Use logical
   `padding-block` / `padding-inline` properties when declaring those roles.
   Keep tree depth indentation and section spacing on their own tokens; they
   are content structure, not outer padding.

## Current Code Boundaries

- `src/styles/scrollbars.css`
  - global WebKit scrollbar baseline and the ban on standard scrollbar
    properties
- `src/styles/tokens.css`
  - `--po-scrollbar-size`, `--desktop-sidebar-scrollbar-width`,
    `--desktop-sidebar-scroll-right-gap`, and
    `--desktop-sidebar-list-padding-block`
- `src/features/data-workspace/browser.css`
  - maps the shared sidebar edge tokens into the shared explorer tree contract
- `vendor/shared-ui/src/styles/data-workspace.css`
  - files explorer scroll area (`.explorer-tree-scroll`, reserved gutter),
    list padding compensation (`.explorer-tree-list`), tree row geometry
- `src/features/source-control/styles/sidebar-base.css`
  - generic tool sidebar scroll list (`.desktop-tool-sidebar-list`) and
    sidebar row model
- `src/features/source-control/styles/sidebar-layout.css`
  - `.desktop-git-sidebar-list` gutter opt-out and outer block edge
- `src/features/source-control/styles/sidebar-resources.css`
  - Git section scroll containers (working tree, remote/committed previews)
    and their compensated list padding
- `src/features/source-control/styles/history-list.css`,
  `src/features/source-control/styles/history-detail.css`
  - Git history list rows, history scroll areas, and bottom outer edge
- `src/styles/settings-view.css`
  - Settings-specific separators; list edges inherit the shared tool-sidebar
    contract
- `src/features/cloud/styles/sidebar-shell.css`
  - Cloud and Integrations sidebar list edges (token-override compensation)
- `src/features/cloud/styles/access/scope-sidebar.css`,
  `src/features/cloud/styles/access/service-sidebar.css`
  - Access scope list edges and service-shell scrollbar ownership
- `src/features/changes/changes.css`
  - legacy Changes review-list edge mapping
- `vendor/shared-ui/src/primitives/useScrollableClass.ts`
  - scrollability detection and `is-scrollable` class assignment

## Invariants

- No stylesheet sets `scrollbar-width` or `scrollbar-color`. Scrollbar
  styling is WebKit-only, so geometry never depends on macOS scrollbar
  settings.
- Every sidebar scroll container reserves the scrollbar gutter with
  `scrollbar-gutter: stable`; sidebar scrollbars occupy exactly
  `--desktop-sidebar-scrollbar-width`, always.
- Sidebar rows keep the same width in short lists, long lists, and while a
  list transitions between the two.
- Total right inset of list content (reserved gutter + list right padding)
  equals `--desktop-sidebar-row-right-gap`, matching non-scrolling siblings.
- Every page-level sidebar list uses `--desktop-sidebar-list-padding-block`
  for its outer `8px` list edge; feature section gaps must not substitute for
  it.
- Sidebar rows use `width: 100%` inside their list.
- `is-scrollable` must not appear in selectors that change row width, row
  margin, or row padding.
- If a row appears too wide or too narrow when a scrollbar appears, fix the
  scroll/list boundary instead of adding row-specific scrollbar math.
