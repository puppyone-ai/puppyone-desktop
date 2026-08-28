# CSS themes

PuppyOne Desktop supports local CSS themes for the application shell, Markdown editor, and CSV table view. Open **Settings → Editor → CSS themes → Open Themes Folder** to reach the device-local theme directory, then use **Reload Themes** after editing a file.

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

Top-level CSS files appear as Markdown themes. PuppyOne treats Typora's `:root`, `html`, `body`, and `#write` selectors as aliases for the Markdown surface and scopes ordinary selectors so they cannot style another part of the application. Relative local `@import`, image, and font URLs are supported. Network and `file:` URLs are rejected.

## Multi-surface theme package

Use a directory containing `theme.json` to name a theme and target more than one surface:

```json
{
  "schemaVersion": 1,
  "id": "com.example.graphite",
  "name": "Graphite",
  "version": "1.0.0",
  "modes": ["light", "dark"],
  "entrypoints": {
    "application": "application.css",
    "markdown": "markdown.css",
    "csv": "csv.css"
  }
}
```

An entrypoint may target any subset of `application`, `markdown`, and `csv`. Theme IDs use a lowercase reverse-domain form with at least three segments.

Application themes customize product tokens from their scoped root; arbitrary application selectors are intentionally not accepted:

```css
.theme-root {
  --po-accent: #6b5dd3;
  --po-panel: #18181b;
  --po-control: #24242a;
  --po-text: #f4f4f5;
  --po-text-muted: #a1a1aa;
  --po-divider: #3f3f46;
}
```

Markdown themes can use the public `--po-md-*` variables, including `--po-md-surface-background`, `--po-md-content-color`, `--po-md-content-font`, `--po-md-content-size`, `--po-md-content-line-height`, `--po-md-block-gap`, and heading size/weight variables.

CSV themes can use `--po-csv-surface-background`, `--po-csv-surface-color`, and the shared `--po-editable-table-*` variables for borders, cell spacing, header styling, font sizing, and focus rings.

Each entrypoint is parsed and compiled by the desktop host. Invalid packages are isolated and reported in Settings without preventing other themes from loading. Only the three selected theme entrypoints are injected into the renderer.
