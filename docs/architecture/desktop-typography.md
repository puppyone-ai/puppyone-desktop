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

## Document language boundary

The interface locale and a document's language are different state. A Markdown
pane resolves its own `lang` once per document session: explicit document
metadata wins, otherwise a bounded script sample distinguishes Simplified or
Traditional Chinese, Japanese, and Korean; content without a script signal
falls back to the interface locale. The result is pane-local and remains stable
while the user edits, so another pane cannot change its fallback face or text
metrics.

The locale layer owns optical corrections for long-form reading. Default/Latin
content uses weight `450`; Chinese content explicitly uses weight `500`.
Every script uses the font's native spacing (`letter-spacing: 0`) and the same
`24px` leading at the default `14px` size, producing one stable `30px` Live
Preview row after its
`3px` padding on each edge. This is intentional: PingFang does not expose a
stable intermediate face between Regular and Medium, so the product selects
Medium explicitly instead of relying on browser matching for `450`. Markdown
consumes the product-level
`--po-content-reading-*` tokens and does not name PingFang or another CJK face
itself.

Light and dark appearances never select different font weights. Light Markdown
uses the complete semantic foreground because regular CJK strokes lose
definition when mixed toward muted text. Dark Markdown keeps the same face and
weight, but softens the foreground through its color token to compensate for
the heavier optical appearance of light-on-dark text. Theme changes therefore
cannot change line wrapping, cursor geometry, or CodeMirror measurements.

Language inference is a fallback, not durable metadata. Future project format
metadata should pass an explicit BCP 47 language to the editor and bypass the
heuristic.

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
- Interface-language changes cannot relabel an already resolved CJK document
  or mutate a sibling pane's reading metrics.
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
