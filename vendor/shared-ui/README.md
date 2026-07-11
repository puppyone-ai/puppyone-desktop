# PuppyOne Shared UI

This directory is the Desktop-owned UI implementation. PuppyOne Cloud and
Desktop are separate products and their UI trees intentionally evolve
independently. This directory is not generated from the Cloud repository and
there is no cross-repository runtime or synchronization dependency.

Edit this tree directly and run `npm run check:ui-boundaries`. The historical
`check:shared-ui` command remains only as a compatibility alias for that local
boundary check; it does not claim cross-repository parity.

## Boundaries

Shared UI may depend on React, browser-safe DOM APIs, and local files in this
directory. It must not depend on Next.js routing, Supabase, SWR, Electron,
Tauri, Node filesystem APIs, or app-specific source trees.

Desktop shell code stays outside this vendored UI tree.

