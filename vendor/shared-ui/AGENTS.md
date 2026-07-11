# Shared UI Instructions

- This is the editable Desktop UI source. Cloud UI is a separate product tree.
- Do not import from `frontend/`, `desktop/`, `@/`, `next/*`, `electron`,
  `@tauri-apps/*`, `@supabase/*`, or `swr`.
- Prefer product-semantic component names such as `ExplorerTree`,
  `EditorHost`, and `FilePreview`.
- Keep app shell concerns out of this package. Cloud auth/routing and desktop
  native window behavior belong in their app directories.
- After changes, run `npm run check:ui-boundaries`. No cross-repository sync
  command or parity promise exists.

