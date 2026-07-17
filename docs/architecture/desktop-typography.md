# Desktop Typography Architecture

Status: semantic roles, built-in catalog, preferences, and runtime lifecycle are
implemented. Importing local font files is intentionally deferred.

## Goals

- Keep application chrome metric-stable while allowing knowledge content to
  use a different reading font.
- Store durable font identities, never CSS supplied by a preference.
- Let a future imported-font service join the same catalog without changing
  Settings, preference shape, or content-surface CSS.
- Re-measure metric-sensitive renderers after a font changes or finishes
  loading.

## Semantic roles

Typography has four independent roles:

| Role | Token | Current owner |
| --- | --- | --- |
| Interface | `--po-font-ui` | App chrome, navigation, controls, dialogs |
| Content | `--po-font-content` | Markdown, plain text, rendered safe HTML, long-form Agent output |
| Code | `--po-font-code` | CodeMirror code surfaces, diffs, code spans |
| Terminal | `--po-font-terminal` | xterm's separately verified character-grid stack |

`--po-font-sans` and `--po-font-mono` remain compatibility aliases for feature
CSS that has not yet adopted a more specific role. They are re-declared at each
appearance root so inline role values are resolved at the correct boundary.

Document-owned surfaces are outside this contract. DOCX, PDF, embedded web
content, and viewer packs retain their authored or sandbox-owned fonts.

## Preference and catalog model

`puppyone.desktop.typography` stores this versioned value:

```ts
type TypographyPreferences = {
  version: 1;
  uiFontId: string;
  contentFontId: string;
  codeFontId: string;
  terminalFontId: string;
};
```

IDs are namespace-qualified (`builtin:*`, later `imported:*`). Parsing validates
the ID grammar but does not require the entry to be present. The resolver keeps
the requested ID and temporarily falls back to the role default when its entry
is unavailable. This prevents a slow catalog restore or a temporarily missing
asset from destroying the user's preference.

A catalog entry owns the trusted CSS family and its permitted roles:

```ts
type FontCatalogEntry = {
  id: string;
  source: "bundled" | "system" | "imported";
  family: string;
  roles: readonly ("ui" | "content" | "code" | "terminal")[];
};
```

Preference data never becomes CSS directly. Only a resolved catalog entry may
write a family to a root token.

## Runtime flow

```text
local preference ID
  -> catalog resolver (role validation + fallback)
  -> app/onboarding/overlay root CSS variables
  -> font load settles
  -> puppyone:typography-change
       -> CodeMirror requestMeasure()
       -> Mermaid redraw + font-aware cache key
       -> xterm terminal-font option update + fit/PTY resize
```

The lifecycle emits both `applied` and `ready` phases. The first updates an
already-loaded/system font immediately; the second corrects geometry after an
asynchronous bundled or future imported font finishes loading.

## Future imported-font adapter

The future implementation adds catalog entries; it does not add another
preference format or CSS path. Its host boundary must:

1. Let Electron Main own the native picker and the store under `userData`.
2. Validate extension, file signature, size, count, and metadata before an
   asset is registered.
3. Return an opaque asset ID and trusted metadata through a narrow preload API;
   never expose a persistent absolute path to the renderer.
4. Register loaded faces under an application-generated family name, then add
   an `imported:*` entry to the runtime catalog.
5. Keep font files local to the device. Project files and Cloud sessions never
   carry imported font binaries.
6. Preserve a missing entry's preference and render the role fallback until
   the entry becomes available again.

The adapter may use a validated byte/`FontFace` path or a dedicated secure
protocol. That transport choice is deliberately below the catalog boundary.

## Invariants

- No raw family, URL, `@font-face`, or file path is accepted from localStorage.
- Content font selection cannot alter UI or terminal metrics.
- A terminal font is not selectable until its monospace metrics and xterm
  re-fitting behavior are verified.
- A font-loading failure leaves the product usable with the role fallback.
- Overlay roots receive the same resolved role variables as the owning app
  surface.
- The Appearance selector renders an immediate content-font sample; the
  surrounding Settings chrome remains on the interface role so the scope of a
  change is visible without destabilizing application metrics.
- Multi-window preference changes propagate through the browser storage event;
  imported catalog synchronization will be owned by its future host adapter.
