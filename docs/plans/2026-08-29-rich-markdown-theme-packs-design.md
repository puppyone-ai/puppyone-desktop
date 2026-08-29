# Rich Markdown Theme Packs Design

## Goal

Add four portable single-file Theme Packs—Alto, Jade, Newsprint, and Rainbow—to the editable PuppyOne theme catalog. Each pack coordinates Application, Markdown, and CSV colors while giving Markdown a materially different typographic identity.

## Source and adaptation policy

Alto is an original PuppyOne adaptation of the user's Alto/Lapis Typora setup. Jade, Newsprint, and Rainbow are original themes informed by recurring patterns in the supplied Typora library and screenshots. The implementation re-authors those patterns against PuppyOne's public theme contract; it does not copy Typora application selectors, bundle third-party fonts, or depend on Typora's DOM.

All four themes remain one-file packages under `electron/themes/` and are installed as editable files in the platform Themes Folder. Existing user files and legacy directories remain authoritative and are never overwritten.

## Visual identities

### Alto

Alto uses its recognizable blue-gray palette, pale-blue shell, restrained rounded surfaces, centered serif H1, blue H2 label, blue quote rule, soft code blocks, and bordered tables. Its dark mode uses the original family of ink-blue surfaces rather than mechanically inverting light colors.

### Jade

Jade uses quiet mineral greens. H1 is centered with a short underline, rendered H2 uses a soft green gradient label, H3 has a vertical jade rule, quotes use a tinted card, and tables use understated green grid lines.

### Newsprint

Newsprint uses a warm paper palette and system serif stack. H1 is centered with a double underline, H2 is a strong editorial heading, H3 uses small caps and letter spacing, quotes are italic with a thin rule, and tables use a three-line editorial treatment.

### Rainbow

Rainbow uses a blue foundation with controlled pink, violet, gold, and teal accents. H1 is centered, H2 is a blue rounded label, H3 has a blue underline, and links, emphasis, code, quotes, and table headers receive distinct but coordinated accent colors.

## Markdown compatibility

Each theme styles both CodeMirror-native blocks (`.cm-md-heading-*`, `.cm-md-blockquote`, code lines, and table widgets) and sanitized rendered HTML (`h1`–`h3`, `blockquote`, `code`, `pre`, and `table`). Native editor rules avoid layout-hostile display changes; richer fit-content labels and pseudo-elements are reserved for rendered HTML where browser flow is stable.

Application rules remain public `--po-*` root tokens only. CSV rules use public `--po-csv-*` and editable-table tokens. Every selector is compiled and scoped by Electron Main before reaching the renderer.

## Installation and compatibility

The starter catalog expands from four to eight files and advances its installation marker to version 3. An installation with the version-2 marker receives only missing themes: GitHub, Forest, Night, and Rose are skipped when their files or legacy directories already exist, while Alto, Jade, Newsprint, and Rainbow are added. Deleting or editing an installed file remains user intent and is preserved after the version-3 marker exists.

## Verification

Tests verify all eight starter files install and compile as coordinated three-surface packs, preserve user edits and deletions, and expose signature Markdown rules for the four rich themes. The actual development Themes Folder is scanned after migration and must report eight themes with no diagnostics.
