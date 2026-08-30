# CSS themes

PuppyOne Desktop treats themes as part of Appearance. Open **Settings → Appearance → Theme** to choose one coordinated Theme Pack for the application shell, Markdown editor, and CSV table view.

Selecting a Theme Pack applies its Application, Markdown, and CSV styles together. PuppyOne does not expose separate per-surface selectors or an in-app Custom CSS overlay; install or edit a complete Theme Pack when those surfaces should change.

The visual precedence is Interface Style → resolved System/Light/Dark mode and base palette → Theme Pack → Editor Markdown property overrides. Appearance continues to own navigation, file icons, motion, pointer behavior, and other interface preferences; theme CSS cannot change those product settings.

Default is the only coordinated Theme Pack bundled into the renderer. Distributable theme CSS is maintained outside the desktop application repository so theme collections can be released and shared independently. On first access to the theme catalog, PuppyOne installs a bilingual `README.md` with installation, authoring, and sharing guidance into the platform-specific Themes Folder:

```text
${app.getPath("userData")}/themes/
└── README.md
```

PuppyOne never overwrites an existing README or theme file. A documentation-specific hidden marker records guide installation, while CSS already present in the Themes Folder remains user-owned and continues to use the normal discovery, validation, diagnostics, and automatic refresh path. The desktop application does not restore or delete themes that were installed by a user or by an earlier version. A legacy `puppyone-custom-css` directory created by an earlier build is retained on disk but is no longer loaded.

Use **Open Themes Folder** for external editing, local assets/imports, complete packages, and Typora-style files. Do not place user themes in the application installation directory or source tree; the user-data directory survives application upgrades and maps correctly on macOS, Windows, and Linux.

## Typora-style Markdown theme

Place a CSS file directly in the themes directory:

```css
/* paper.css */
:root {
  --po-md-surface-background: #f6f1e7;
  --po-md-content-color: #342f29;
  --po-md-content-font: Georgia, serif;
  --po-md-content-line-height: 1.78;
  --po-md-h1-size: 2.1em;
}

#write h1 {
  letter-spacing: -0.02em;
}
```

Top-level CSS files are parsed as Markdown-only themes for Typora compatibility, but they are not selectable in Theme Pack. Convert one into a complete three-target PuppyOne theme to make it selectable. PuppyOne treats Typora's `:root`, `html`, `body`, and `#write` selectors as aliases for the Markdown surface and scopes ordinary selectors so they cannot style another part of the application. Relative local quoted imports and `@import url(...)`, images, fonts, and `@charset` are supported. Network and `file:` URLs are rejected.

This is a restricted, safety-scoped Typora-style dialect rather than drop-in compatibility with every Typora theme. Container rules such as `@media` and `@supports` plus `@font-face` are supported; global rules such as `@keyframes`, `@page`, plugin-specific Typora chrome selectors, and `!important` in ordinary themes are rejected. Port those effects to scoped declarations and PuppyOne's public variables so Theme Pack and Editor preference precedence stays predictable.

## Portable single-file Theme Pack

The recommended format for a coordinated, shareable theme is one top-level CSS file. Metadata identifies the theme; each `@puppyone` block declares one supported surface:

```css
@puppyone-theme {
  id: com.example.graphite;
  name: Graphite;
  version: 1.0.0;
  author: Example Studio;
  modes: light dark;
}

@puppyone application {
  .theme-root {
    --po-surface-panel: #18181b;
    --po-text: #f4f4f5;
    --po-accent: #8b7cf6;
  }
}

@puppyone markdown {
  .theme-root { --po-md-content-line-height: 1.78; }
  .theme-root .cm-md-heading-1,
  .theme-root h1 { text-align: center; }
}

@puppyone csv {
  .theme-root {
    --po-csv-surface-background: #18181b;
    --po-editable-table-cell-focus-ring: #8b7cf6;
  }
}
```

Targets are inferred from the blocks, so no separate target list or entrypoint map is required. A file with all three targets appears in Theme Pack. Partial files, including CSS without `@puppyone-theme`, can still be parsed for compatibility but are not selectable coordinated packs.

## Advanced directory package

Use a directory containing `theme.json` only when a theme needs multiple CSS files or local assets:

```json
{
  "schemaVersion": 1,
  "id": "com.example.graphite",
  "name": "Graphite",
  "version": "1.0.0",
  "modes": ["light", "dark"],
  "targets": ["application", "markdown", "csv"],
  "entrypoints": {
    "application": "application.css",
    "markdown": "markdown.css",
    "csv": "csv.css"
  }
}
```

An entrypoint may target any subset of `application`, `markdown`, and `csv`; `targets` and `entrypoints` must match. Only packages that cover all three targets appear in the Theme Pack selector. Theme IDs use a lowercase reverse-domain form with at least three segments.

Application themes customize the public color-token allowlist from their scoped root; arbitrary application selectors and structural typography, cursor, density, and layout tokens are intentionally not accepted:

```css
.theme-root {
  --po-accent: #6b5dd3;
  --po-surface-panel: #18181b;
  --po-control: #24242a;
  --po-text: #f4f4f5;
  --po-text-muted: #a1a1aa;
  --po-divider: #3f3f46;
}
```

Use the supported dark-root forms when a package provides both light and dark values:

```css
.theme-root.dark,
.dark .theme-root {
  --po-surface-panel: #18181b;
  --po-text: #f4f4f5;
}
```

For Application CSS, `.theme-root.dark` addresses a dark application root and `.dark .theme-root` is accepted as its equivalent package-authoring form. For Markdown and CSV CSS, `.dark .theme-root` addresses the themed surface below the dark application root. The compiler scopes both forms to the exact surface and selected theme ID.

Markdown themes can use the public `--po-md-*` variables, including `--po-md-surface-background`, `--po-md-content-color`, `--po-md-content-font`, `--po-md-content-size`, `--po-md-content-line-height`, `--po-md-block-gap`, and heading size/weight variables. The Editor page can optionally override heading size, bold color, and bold weight. Leave those controls on **Theme** to use the CSS values unchanged.

CSV themes can use `--po-csv-surface-background`, `--po-csv-surface-color`, and the shared `--po-editable-table-*` variables for borders, cell spacing, header styling, font sizing, and focus rings.

Each entrypoint is parsed and compiled by the desktop host. Package manifests, entrypoints, imports, and assets must remain inside their canonical package directory; symlink escapes are rejected. Import counts plus aggregate CSS, compiled CSS, expanded assets, and source asset sizes are bounded. Invalid packages are isolated and reported in Appearance without preventing other themes from loading. Only the effective three selected theme entrypoints are injected into the renderer.
