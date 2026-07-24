# File icon themes

File-format detection stays outside this directory. A theme receives a semantic
`FileIconRenderContext` and owns only its visual treatment.

## Semantic coverage invariant

- `core/fileFormats.ts` owns the runtime `FILE_SEMANTIC_KINDS` tuple and its
  `FileSemanticKind` type. The icon layer aliases that contract; it must not
  maintain a second semantic union.
- A base theme must select a renderer for every semantic kind with
  `FileIconRendererMap` (or an equally exhaustive `Record`). Several kinds may
  deliberately point at the same generic document renderer.
- Base themes are assembled by `createIconTheme` or
  `createCustomPreviewIconTheme`; both factories require that exhaustive map.
  Variants are assembled by `createThemeVariant` and inherit base coverage.
- Do not use a partial renderer map followed by a generic document/file
  fallback. That hides omissions and turns new or forgotten kinds into the
  wrong icon.
- A variant may use partial overrides because every missing key delegates to an
  already exhaustive base theme.

## Dependency direction

```text
iconThemeTypes/shared
        ↓
theme implementations
        ↓
registry
        ↓
fileIcons
```

- Theme implementations may import contracts, shared visual primitives, and
  another theme only when inheritance is intentional.
- Themes must not import the registry, `fileIcons`, or the compatibility entry.
- The registry is the only module that assembles all built-in themes.
- `fileIconThemeRegistry.tsx` remains a thin compatibility re-export.

## Theme organization

- Keep compact tree glyphs in `glyphs.tsx`.
- Split large preview renderers into `previews.tsx`.
- Keep small themes in one `index.tsx` until another split improves ownership.
- Share only stable visual primitives. Theme-specific SVG paths stay with their
  theme even when a more generic abstraction would be possible.

The `lines` theme intentionally inherits the `default` theme and overrides the
Markdown glyph and preview. Changes to inherited Default renderers therefore
also affect Lines unless Lines adds an explicit override.
