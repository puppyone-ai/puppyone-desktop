# Desktop Sidebar Scroll Lists

This document records the shared layout contract for scrollable sidebar lists:
the files explorer, Git working tree, Git history, cloud sidebar lists, and
future sidebar list surfaces. It also records the app-wide scrollbar styling
rule that the contract depends on.

For the app-wide rule that separates scrollbar and pane-resizer pointer areas,
see [Pane Edge Interaction Lanes](pane-edge-interaction-lanes.md).

For the complete sidebar composition, ownership, registry, file layout, CSS,
performance, and testing architecture, see
[Desktop Sidebar Architecture](desktop-sidebar-architecture.md). This document
is the focused scroll-geometry contract beneath that architecture.

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
same four-value `padding` declaration. A reserved `12px` product scrollbar
gutter means a scrolling list has `0px` of CSS padding on the inline end while
still producing the same effective `12px` edge. Git's outer wrapper does not scroll,
so its section rows and nested scroll lists own the inline edge instead.

## Scrollbar Styling Rules (app-wide)

1. Register every scroll owner explicitly.

   The actual element that owns `overflow` carries one `data-po-scrollbar`
   variant:

   - `content`: editor, page, dialog, transcript, or other ordinary content
   - `sidebar`: stable-gutter navigation/list content
   - `menu`: bounded menu content
   - `horizontal`: horizontal-only editor widgets
   - `hidden`: intentionally scrollable controls whose indicator is hidden

   The product scrollbar primitive lives exclusively in
   `src/styles/scrollbars.css`, imported into the `primitives` cascade layer.
   Feature styles own overflow and content layout but never thumb/track paint.

2. Keep system and product rendering as separate modes.

   `data-po-scrollbar-mode="product"` on the document root enables the
   deterministic PuppyOne geometry. For normal DOM scroll owners, `system`
   mode intentionally has no author thumb, track, width, or height rules,
   allowing Chromium/macOS to honor the user's platform scrollbar preferences.
   xterm remains the documented exception because it renders a private slider.
   Do not combine the two models on the same owner.

3. In product mode, style scrollbars only through
   `::-webkit-scrollbar*` pseudo-elements.

   Never set the standard `scrollbar-width` or `scrollbar-color` properties
   anywhere in the app, including `* { ... }` resets, third-party widget
   overrides (xterm, CodeMirror widgets), menus, and dialogs. One standard
   declaration on an element silently disables every WebKit rule for it and
   reintroduces platform-dependent native scrollbars. To hide a scrollbar,
   use `::-webkit-scrollbar { display: none; }`, not `scrollbar-width: none`.

   The product baseline lives in `src/styles/scrollbars.css`: a 12px
   interaction track (`--po-scrollbar-size`) containing a 6px idle thumb
   (`--po-scrollbar-thumb-size`) with a 3px transparent inset. While the
   surface is hovered, scrolling, or dragging, the thumb expands to
   8px (`--po-scrollbar-thumb-active-size`) with a 2px inset. This geometry is
   shared by sidebar lists, code editors, CSV tables, and horizontal Markdown
   widgets. Custom WebKit scrollbars keep classic layout geometry even though
   the default skin mimics the macOS overlay presentation: the reserved track
   consumes layout width, while the thumb itself fades away when idle.

4. Preserve the transparent thumb inset in every state.

   Stateful thumb rules must change `background-color`, never the
   `background` shorthand. The shorthand resets `background-clip` to
   `border-box`, paints beneath the transparent border, and silently turns the
   intended 6px thumb back into an 8px bar. All default-interface scroll owners
   use `--po-scrollbar-presentation-thumb` and its hover companion, so sidebar,
   editor, menu, and page surfaces cannot drift independently.

5. Reserve the gutter in sidebar scroll containers.

   Every sidebar scroll container sets `scrollbar-gutter: stable`, so the
   scrollbar width (`--desktop-sidebar-scrollbar-width`) is reserved whether
   or not the list currently overflows. Row width is therefore identical in
   short and long lists. This contract is product-mode only; system mode
   resets the gutter to `auto` and the compensation width to `0px` so native
   macOS behavior owns layout as well as paint.

   Note `scrollbar-gutter: stable` also reserves space when `overflow` is
   `hidden`. Non-scrolling flex wrappers that share a class with scroll
   containers must opt out with `scrollbar-gutter: auto` (see
   `.desktop-git-sidebar-list`).

6. Compensate the reserved gutter in the list's right padding.

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

7. Keep resize and scroll hit targets adjacent, never overlapping.

   The explorer scrollbar owns the final 12px inside the sidebar. The shared
   `.po-pane-edge-resize-handle` contract owns the next 8px inside the main
   pane. Do not place the resizer inside `.explorer-column`, center it across
   the boundary, or translate it back toward the sidebar: its higher stacking
   order would intercept scrollbar drags. The complete cross-pane contract is
   documented in `pane-edge-interaction-lanes.md`.

## Implementation Rules

1. Keep the ownership hierarchy stable.

   ```text
   Pane
   ├── Header / toolbar (not scrollable)
   ├── Scroll owner [data-po-scrollbar]
   │   └── Content / list (owns content padding)
   ├── Footer (not scrollable)
   └── Resize handle (adjacent sibling, never overlapping)
   ```

   Do not add wrapper elements solely to paint a scrollbar. The data attribute
   preserves semantic `main`, `nav`, `ol`, `textarea`, and CodeMirror scroll
   nodes without creating a fake scrollbar component.

2. Keep scrollbar layout in the scroll area.

   `ScrollbarActivity` owns transient active-state presentation. Scroll
   containers may still use `is-scrollable` only for non-paint scroll-area
   behavior. Do not use `is-scrollable` to reserve gutter space or to change
   row width, row margin, or row padding.

3. Put horizontal gutters on the list, not on every row.

   Sidebar lists should use the product sidebar gutter tokens as
   `padding-inline`, with the right side reduced per Scrollbar Styling
   Rule 6. Rows inside those lists should use `width: 100%` and
   vertical-only margins or list gaps.

4. Keep rows independent from native scrollbar width.

   Do not introduce variables such as `scroll-row-width`,
   `scroll-row-right-gap`, or `row-gap-minus-scrollbar` at the row level.
   Gutter compensation happens exactly once, on the scroll container or its
   list, never on rows.

5. Use `ResizeObserver` only to classify scroll containers.

   `useScrollableState` and `useScrollableDescendantClasses` may add
   `is-scrollable` to scroll containers. That state must remain a
   scroll-area state, not a row-layout state.

6. Keep shared tokens at the sidebar level.

   Use `--desktop-sidebar-row-left-gap`, `--desktop-sidebar-row-right-gap`,
   `--desktop-sidebar-scroll-right-gap`,
   `--desktop-sidebar-scrollbar-width`, `--desktop-sidebar-row-height`,
   `--desktop-sidebar-row-radius`, content inset tokens, and the shared
   typography tokens (`--desktop-sidebar-font-size`,
   `--desktop-sidebar-font-weight`, `--desktop-sidebar-line-height`,
   `--desktop-sidebar-icon-label-gap`). Feature-specific aliases are
   acceptable, but they must not reintroduce row-level scrollbar compensation
   or a quieter primary-row weight than Data.

7. Share visual contracts, not incidental shorthands.

   Data, Git, Settings, Cloud, Access, Automation, and Changes must resolve
   to the same outer edge rhythm even though their scroll ownership differs. Use
   `--desktop-sidebar-list-padding-block` for the `8px` list edge and the
   shared row gap tokens for the `12px` inline edge. Use logical
   `padding-block` / `padding-inline` properties when declaring those roles.
   Keep tree depth indentation and section spacing on their own tokens; they
   are content structure, not outer padding.

8. Keep third-party adapters local and token-driven.

   CodeMirror registers its real `view.scrollDOM` as a `content` owner. xterm
   renders a private slider rather than a normal browser scrollbar, so its
   adapter stays in `desktop-terminal.css` and consumes the shared geometry,
   color, motion, and active-state tokens. No other feature may declare
   scrollbar pseudo-elements.

## Current Code Boundaries

- `src/styles/scrollbars.css`
  - opt-in product scrollbar primitive, variants, transient state, reduced
    motion, forced-colors support, and the system/product rendering boundary
- `src/components/ScrollbarActivity.tsx`
  - one delegated passive listener that marks registered owners active while
    scrolling; unregistered and hidden surfaces are ignored
- `src/styles/tokens.css`
  - `--po-scrollbar-size`, `--po-scrollbar-thumb-size`,
    `--po-scrollbar-thumb-active-size`, `--po-scrollbar-thumb-inset`,
    `--po-scrollbar-thumb-active-inset`, `--desktop-sidebar-scrollbar-width`,
    `--po-scrollbar-presentation-thumb`,
    `--po-scrollbar-presentation-thumb-hover`,
    `--desktop-sidebar-scroll-right-gap`, and
    `--desktop-sidebar-list-padding-block`
- `packages/shared-ui/src/sidebar/SidebarScrollArea.tsx`,
  `SidebarList.tsx`, `SidebarRow.tsx`
  - process-neutral semantic components for scroll/list/row ownership;
    scroll owners register the `sidebar` variant
- `packages/shared-ui/src/styles/sidebar-primitives.css`
  - canonical `.po-sidebar-*` root, scroll, list, row, action, resize, and
    virtual-list geometry in the `primitives` cascade layer
- `packages/shared-ui/src/sidebar/VirtualSidebarList.tsx`,
  `useVirtualSidebarWindow.ts`, `virtualizationPolicy.ts`
  - native-list virtual window, 200-row activation threshold, and 120 mounted
    row budget
- `src/components/sidebar/`, `src/styles/sidebar/patterns.css`
  - Desktop-only group/header/status/surface patterns in the `patterns` layer
- `src/features/data-workspace/browser.css`
  - maps the shared sidebar edge tokens into the shared explorer tree contract
- `packages/shared-ui/src/styles/data-workspace.css`
  - files explorer scroll area (`.explorer-tree-scroll`, reserved gutter),
    list padding compensation (`.explorer-tree-list`), tree row geometry
- `src/features/source-control/styles/sidebar-base.css`
  - Source Control-scoped semantic accents only; it no longer owns shared
    root/list/row/action geometry
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
  - Cloud and Automation sidebar list edges (token-override compensation)
- `src/features/cloud/styles/access/scope-sidebar.css`,
  `src/features/cloud/styles/access/service-sidebar.css`
  - Access scope list edges and service-shell scrollbar ownership
- `src/features/changes/changes.css`
  - legacy Changes review-list edge mapping
- `packages/shared-ui/src/primitives/useScrollableClass.ts`
  - scrollability detection and `is-scrollable` class assignment
- `src/features/source-control/sidebar/SourceControlResourceLists.tsx`,
  `src/features/source-control/GitStatusView.tsx`,
  `src/features/cloud/history/CloudHistorySidebar.tsx`
  - current scalable-list consumers of the shared virtualization policy

## Invariants

- No stylesheet sets `scrollbar-width` or `scrollbar-color`. Product mode is
  WebKit-only and deterministic; system mode has no author geometry and follows
  macOS/Chromium preferences.
- Only the central primitive, historical interface skins, and the xterm
  adapter may contain `::-webkit-scrollbar` selectors. Feature CSS never owns
  scrollbar paint.
- Every product scroll owner is explicitly registered with a supported
  `data-po-scrollbar` variant. The global `*::-webkit-scrollbar` selector is
  forbidden.
- Every sidebar scroll container reserves the scrollbar gutter with
  `scrollbar-gutter: stable`; sidebar scrollbars occupy exactly
  `--desktop-sidebar-scrollbar-width` (12px in the default skin), while the
  thumb uses 6px idle geometry while fading away at rest and expands to 8px
  while active.
- The explorer scrollbar's 12px track and the resizer's 8px target are adjacent
  on opposite sides of the pane boundary and never overlap.
- Default transient visibility responds to hover, scrolling, and dragging.
  Focus alone must not pin the indicator onscreen.
- Scrollbar thumb state rules use `background-color`; no modern scrollbar
  thumb rule may reset `background-clip` with the `background` shorthand.
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
