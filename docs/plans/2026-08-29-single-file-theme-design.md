# Single-file Theme Design

## Goal

Make one `.css` file the preferred portable format for a coordinated PuppyOne theme. A user should be able to copy, share, rename, inspect, and edit one file instead of maintaining a manifest plus three target CSS entrypoints. Directory packages remain supported for advanced themes with multiple source files, fonts, images, or other assets.

## File contract

A coordinated single-file theme is a top-level CSS file in the Themes Folder containing one `@puppyone-theme` metadata block and one or more `@puppyone <target>` blocks:

```css
@puppyone-theme {
  id: com.example.forest;
  name: Forest;
  version: 1.0.0;
  modes: light dark;
}

@puppyone application {
  .theme-root { --po-surface-canvas: #f1f7f4; }
}

@puppyone markdown {
  .theme-root { --po-md-content-color: #2f3f38; }
}

@puppyone csv {
  .theme-root { --po-csv-surface-background: #f7fbf9; }
}
```

`id`, `name`, and `version` are required so preferences remain stable when a file is renamed and diagnostics can identify the authoring contract. `modes` accepts the existing `light` and `dark` values. Targets are inferred from the `@puppyone` blocks, eliminating duplicated manifest metadata. GitHub, Forest, Night, and Rose use all three targets and therefore appear in the primary Theme Pack selector.

## Parsing and compilation

Electron Main parses the file with PostCSS before target compilation. The metadata block and target blocks must be top-level, unique, and well formed. Rules outside target blocks are rejected for a coordinated single-file theme. Unknown or duplicate targets are rejected. For each target, Main extracts only that block's child nodes and passes them through the existing scoped CSS compiler, token allowlists, selector escape checks, import/asset resolution, and aggregate budgets.

A top-level CSS file without `@puppyone-theme` keeps its existing Typora-style Markdown behavior. This makes the new format additive rather than ambiguous. A malformed file that declares `@puppyone-theme` is isolated as an invalid coordinated theme and reported through the existing Appearance diagnostics instead of silently falling back to Markdown.

## Compatibility and starter migration

Schema-version-1 directory packages with `theme.json` and separate entrypoints remain fully supported. They are the advanced format for themes that benefit from multiple files or package-local assets.

The four application starter templates become `electron/themes/github.css`, `forest.css`, `night.css`, and `rose.css`. Fresh installations copy those files into the user's Themes Folder without wrapping directories. Starter installation receives a new version marker. If an existing path with the same filename or a legacy same-name directory is present, Main preserves it and does not install a conflicting starter, so user edits and earlier development installations are never overwritten or duplicated.

## Appearance behavior

Single-file coordinated themes participate in the same catalog, Theme Pack selection, Advanced overrides, native menu, reload, and style injection flows as directory packages. Their source remains user-editable CSS. Selecting a Theme Pack applies it across all included targets; Advanced remains the place to override an individual surface afterward.

## Verification

Tests cover valid metadata, target extraction, invalid/duplicate blocks, legacy Typora CSS, selector and token safety after extraction, real discovery of all four starter files, no renderer-bundled starter CSS, non-overwrite installation semantics, legacy-directory conflict handling, Theme Pack resolution, ASAR-readable templates, full test suite, and production build.
