# CSS themes

PuppyOne Desktop treats themes as part of Appearance. Open **Settings → Appearance → Theme** to choose one coordinated Theme Pack for the application shell, Markdown editor, and CSV table view. Expand **Advanced theme overrides and Custom CSS** only when one surface needs a different theme or hand-authored CSS.

The visual precedence is Interface Style → resolved System/Light/Dark mode and base palette → Theme Pack → advanced per-surface override. Appearance continues to own navigation, file icons, motion, pointer behavior, and other interface preferences; theme CSS cannot change those product settings.

Default is the only coordinated Theme Pack bundled into the renderer. On first access to the theme catalog, PuppyOne installs GitHub, Forest, Night, and Rose into the platform-specific Themes Folder as ordinary editable packages:

```text
${app.getPath("userData")}/themes/
├── github/
├── forest/
├── night/
└── rose/
```

These starter packages use the same discovery, validation, diagnostics, and reload path as a package created by the user. PuppyOne never overwrites an existing starter path. A versioned hidden marker records the initial installation, so later edits, replacements, and deliberate deletions remain user-owned. The four designs are original PuppyOne implementations informed by common document-theme characteristics and use only PuppyOne's public scoped tokens.

## Custom CSS editor

The Advanced section contains a target-scoped editor for Application, Markdown, or CSV CSS. **Save and Apply** validates the source in Electron Main, atomically preserves it, reloads the catalog, and selects **My Custom CSS** as that surface's override. Invalid CSS is reported without replacing the last valid source.

Managed sources live below Electron's platform-specific user-data directory:

```text
${app.getPath("userData")}/themes/puppyone-custom-css/
├── theme.json
├── application.css
├── markdown.css
├── csv.css
└── assets/
```

Use **Open Themes Folder** for external editing, local assets/imports, complete packages, and Typora-style files. Do not place user themes in the application installation directory or source tree; the user-data directory survives application upgrades and maps correctly on macOS, Windows, and Linux.

## Typora-style Markdown theme

Place a CSS file directly in the themes directory:

```css
/* newsprint.css */
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

Top-level CSS files appear as Markdown themes. PuppyOne treats Typora's `:root`, `html`, `body`, and `#write` selectors as aliases for the Markdown surface and scopes ordinary selectors so they cannot style another part of the application. Relative local quoted imports and `@import url(...)`, images, fonts, and `@charset` are supported. Network and `file:` URLs are rejected.

This is a restricted, safety-scoped Typora-style dialect rather than drop-in compatibility with every Typora theme. Container rules such as `@media` and `@supports` plus `@font-face` are supported; global rules such as `@keyframes`, `@page`, and plugin-specific Typora chrome selectors are rejected. Port those effects to scoped declarations and PuppyOne's public variables.

## Multi-surface theme package

Use a directory containing `theme.json` to name a theme and target more than one surface:

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

An entrypoint may target any subset of `application`, `markdown`, and `csv`; `targets` and `entrypoints` must match. Packages that cover all three targets appear in the primary Theme Pack selector. Partial packages and managed Custom CSS remain available only as Advanced overrides. Theme IDs use a lowercase reverse-domain form with at least three segments.

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

Markdown themes can use the public `--po-md-*` variables, including `--po-md-surface-background`, `--po-md-content-color`, `--po-md-content-font`, `--po-md-content-size`, `--po-md-content-line-height`, `--po-md-block-gap`, and heading size/weight variables.

CSV themes can use `--po-csv-surface-background`, `--po-csv-surface-color`, and the shared `--po-editable-table-*` variables for borders, cell spacing, header styling, font sizing, and focus rings.

Each entrypoint is parsed and compiled by the desktop host. Package manifests, entrypoints, imports, and assets must remain inside their canonical package directory; symlink escapes are rejected. Import counts plus aggregate CSS, compiled CSS, expanded assets, and source asset sizes are bounded. Invalid packages are isolated and reported in Appearance without preventing other themes from loading. Only the effective three selected theme entrypoints are injected into the renderer.
