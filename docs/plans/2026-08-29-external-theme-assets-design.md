# External Theme Assets Design

## Decision

PuppyOne Desktop owns the theme engine and authoring contract, while distributable theme CSS belongs in a separate public theme repository. The desktop repository keeps `electron/themes/README.md` as the portable usage and authoring guide, but it does not bundle or install named theme packs.

## Product behavior

- The Themes Folder is still created below Electron's platform-specific user-data directory.
- `README.md` is installed into a new or existing Themes Folder without overwriting a user-edited copy.
- Theme CSS already present in the user's Themes Folder remains untouched and continues to be discovered normally.
- PuppyOne does not copy Alto, Forest, GitHub, Jade, Newsprint, Night, Rainbow, or Rose from the application bundle.
- Theme Pack, Advanced overrides, Custom CSS, validation, diagnostics, Typora-style CSS, and advanced directory packages remain unchanged.

## Repository boundary

The eight example CSS files are removed from `electron/themes/`. Documentation no longer describes them as bundled or automatically installed. The README explains that themes are supplied by users or a separate theme collection and includes a complete authoring example so the folder remains independently shareable.

## Compatibility and migration

Existing theme files in `Application Support` are user-owned data and are not deleted. The README installer uses its own marker rather than the former starter-theme marker so installations that previously received starter themes can still receive future README updates without restoring removed CSS assets.

## Verification

Tests must prove that the README is installed without overwriting user content, no bundled CSS is copied, pre-existing CSS remains discoverable, and the real bundled theme directory contains documentation but no distributable `.css` files.
