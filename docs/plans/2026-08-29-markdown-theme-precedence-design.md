# Markdown Theme Precedence Design

## Goal

Combine the current `qubits` Markdown presentation controls with the CSS theme system without creating settings that appear interactive but are silently overridden by the active theme.

## Ownership

- **Appearance / Theme Pack** selects the coordinated visual baseline for Application, Markdown, and CSV.
- **Appearance / Advanced overrides** replaces the pack theme for one surface.
- **Editor / Markdown appearance** applies small semantic Markdown preferences on top of the resolved Markdown theme.
- **Custom CSS** is an independently enabled expert overlay and has the final author-level priority for its target.

The Editor page does not duplicate the theme selector. It shows the active Markdown theme and links back to Appearance for theme management.

## Cascade

The deterministic order is:

1. Product defaults
2. Resolved surface theme: Theme Pack or Advanced surface override
3. Editor Markdown presentation overrides
4. Enabled Custom CSS for that surface

Theme CSS, generated Editor override CSS, and Custom CSS are emitted by one style host in that order. The generated Markdown preference selector has the same root specificity as a compiled theme root, so source order is intentional rather than accidental. Theme authors should use the public `--po-md-*` tokens for adjustable heading and emphasis properties.

## Markdown presentation model

Each preference supports an explicit `theme` value:

- Heading size: `theme`, `compact`, `standard`, or `large`
- Bold color: `theme`, `body`, `accent`, or `warm`
- Bold weight: `theme`, `medium`, `semibold`, `bold`, or `heavy`

`theme` emits no CSS declaration for that property. The other choices emit only their owned public tokens. A Reset action restores all three values to `theme`.

The persisted format becomes versioned. Legacy unversioned values equal to the old product defaults migrate to `theme`; non-default legacy choices remain explicit. This avoids pinning every existing user to the old default typography after themes become available.

## Custom CSS model

Custom CSS is no longer represented by selecting `local.puppyone.custom-css` as the surface theme. Theme preferences persist an enabled flag for Application, Markdown, and CSV. Saving custom CSS enables it for the chosen target, and the user can disable it without deleting the source.

Version 2 preferences migrate any existing Custom CSS theme override into the corresponding enabled flag while returning that surface to its Theme Pack baseline. Other Advanced overrides remain unchanged.

## Settings experience

The Editor page keeps the existing compact segmented controls and real Markdown preview. It adds:

- the active Markdown theme name;
- a Manage Themes action that navigates to Appearance;
- a `Theme` option in every presentation control;
- Reset all to theme defaults;
- previewing through the same runtime theme and CSS cascade as a real editor.

Appearance keeps Theme Pack and Advanced surface selection. The Custom CSS editor gains an explicit enabled control and continues to announce save success and errors accessibly.

## Integration strategy

The published `theme` branch must not be rebased. Merge current `origin/qubits` into `theme`, use the new `qubits` Editor, Onboarding, Telemetry, and Settings structures as the baseline, and reapply Theme behavior at their current extension points. The eight externalized CSS examples remain absent from the final repository tree.

## Verification

Tests cover legacy preference migration, theme-following values, cascade order, Custom CSS migration and toggling, Editor navigation/reset behavior, real preview theme identity, merge-sensitive Onboarding behavior, localization, and repository-wide build boundaries.
