# External Starter Themes Design

## Goal

Keep PuppyOne's original Default appearance as the only renderer-bundled theme. Ship GitHub, Forest, Night, and Rose as ordinary editable CSS packages that are installed into the user's Themes Folder.

## Architecture

The four starter packages live under `electron/themes/` as trusted installation templates. On first theme-catalog access, Electron Main copies each missing package into `${app.getPath("userData")}/themes/` through a temporary directory and atomic rename. An existing destination of any kind is never overwritten, so edits, deletions within an existing package, and user replacements remain user-owned.

After installation, starter themes follow exactly the same discovery, validation, compilation, diagnostics, reload, and selection path as every other local package. Their runtime `source` is `local-package`; the renderer has no special CSS or theme definitions for them. Stable package IDs are retained so preferences created on the current feature branch continue to resolve.

The application supplies `app.getAppPath()/electron/themes` as the template root. The existing package configuration already includes `electron/**`, so packaged builds carry the templates inside the application archive while editable copies live exclusively in user data.

## Theme CSS contract

Each package contains `theme.json`, `application.css`, `markdown.css`, and `csv.css`. Light rules use `.theme-root`. Dark rules use narrowly supported theme-root forms: `.theme-root.dark` for a dark application root and `.dark .theme-root` for a themed surface below a dark application root. The compiler rewrites these forms to the exact PuppyOne surface and theme ID; application packages remain limited to the public color-token allowlist.

## Lifecycle and failure behavior

- Missing starter package: install it atomically.
- Existing starter path: preserve it without inspection or overwrite during installation.
- Interrupted temporary copy: clean it up and report the installation error without modifying an existing package.
- Invalid user-edited package: isolate it through the existing catalog diagnostics.
- Deleted starter directory: reinstall it on the next catalog access; users who merely want to stop using a theme should deselect it rather than delete its package.

## Verification

Tests must prove that only Default remains renderer-bundled, all four packages are installed and discovered as local packages, existing edits survive repeated loads, dark CSS compiles for root and descendant surfaces, and installation templates are included by the packaging contract.
