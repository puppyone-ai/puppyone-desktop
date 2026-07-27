# Desktop Renderer Style Architecture

This document defines the global CSS ownership contract for the Electron
renderer. Feature documents own their visual semantics; this document owns the
cascade, reset, and stylesheet entry boundaries that keep those features from
silently overriding one another.

## Layer and import contract

The renderer registers one cascade before loading any component stylesheet:

```text
reset -> tokens -> primitives -> patterns -> features -> overrides
```

The entry order is equally explicit:

```text
styles/cascade.css
    |
    v
cloud-globals.css       Tailwind utilities; no document reset
    |
    v
Shared UI styles        process-neutral primitives
    |
    v
Desktop product styles feature composition and exceptional overrides
```

`src/styles/base.css` in the `reset` layer is the sole owner of document-wide
element defaults. Tailwind Preflight remains disabled. Preflight is an
unscoped reset; when emitted outside the named layers it can erase padding,
borders, backgrounds, and typography from button-backed components across
Settings, Source Control, Cloud, and Sidebars even though their feature
selectors are correct.

Tailwind remains available for explicit utility classes. Its three directives
live only in `src/cloud-globals.css`; features must not create another Tailwind
entry or rely on a second reset.

## Ownership rules

- Static component presentation lives in CSS, not embedded TS/TSX style tags.
- Tokens own theme values; primitives own reusable geometry; patterns compose
  primitives; features own domain-specific presentation.
- Feature CSS may not repair another feature or redefine the global reset.
- `overrides` is reserved for documented platform and accessibility behavior,
  not import-order patches.
- Runtime inline styles are limited to measured values exposed through
  documented CSS custom properties.

## Native window chrome boundary

Electron draggable regions are native window hit-test metadata, not ordinary
component presentation. They therefore have one renderer owner:

```text
BrowserWindow
└── DesktopCloudShell
    ├── DesktopWindowChrome  native drag/no-drag boundary
    └── desktop-shell-body
        └── product surfaces and Shared UI
```

`src/components/DesktopWindowChrome.tsx` owns normal and Minimal Mode chrome
composition. Standalone pre-workspace screens reuse its
`DesktopWindowDragRegion` primitive. `src/styles/window-chrome.css` is the only
source file allowed to declare `-webkit-app-region`.

The markup contract is explicit:

- `data-window-drag-region="true"` identifies app-owned chrome.
- Native controls inside that region are excluded by a selector scoped to the
  region; controls elsewhere in the renderer are never added to the native
  hit-test map.
- A non-button surface that overlaps chrome, such as a titlebar menu, modal
  backdrop, or the Minimal Mode dock, uses
  `data-window-no-drag="true"`.
- Shared UI, editors, scroll containers, resize handles, and feature content
  must not declare either native window attribute or `app-region`.

Do not repair a drag bug with editor `z-index`, sticky-position, or scroll
rules. Window chrome and the workbench are sibling ownership domains; only the
chrome domain may participate in native hit testing.

## Verification

`scripts/check-renderer-style-architecture.mjs` runs in `check:boundaries` and
rejects reset, import-order, duplicate-Tailwind-entry, native-window ownership,
or Shared UI leakage regressions.
`tests/rendererStyleArchitecture.test.ts` covers the cascade contract, while
`tests/titlebarDragRegionArchitecture.test.ts` covers the native window
boundary. Feature-level visual contract tests, including
`settingsVisualArchitecture.test.ts` and `sidebarArchitecture.test.ts`, then
verify their own dimensions and ownership without duplicating global policy.
