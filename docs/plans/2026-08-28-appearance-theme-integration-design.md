# Appearance and Theme Integration Design

## Product model

Appearance is the single user-facing authority for visual preferences. Interface Style continues to own component composition and policy, Color Mode owns system/light/dark resolution, and existing light/dark palettes remain the base application palette. A Theme Pack supplies coordinated visual defaults for the application, Markdown, and CSV surfaces on top of that base. Explicit per-surface choices live behind an Advanced disclosure and override only the selected surface.

The primary control is one Theme Pack selector. A pack may implement any subset of the three targets; missing targets fall back to Default. The built-in catalog will include coherent GitHub, Forest, Night, and Rose packs inspired by the user's Typora library, plus the existing specialist Markdown and CSV themes for advanced overrides. Theme CSS must not control navigation placement, file icons, motion, pointer preferences, or other Appearance-owned behavior.

## Preference and resolution model

Theme preferences move from three final IDs to a version 2 intent model:

```ts
type SurfaceThemePreferences = {
  version: 2;
  pack: string;
  overrides: {
    application: string | null;
    markdown: string | null;
    csv: string | null;
  };
};
```

`null` means Follow Theme Pack. A pure resolver combines preferences, the current catalog, and the resolved light/dark mode into an effective three-target selection. Missing themes, unsupported modes, and missing pack targets fall back to Default without erasing stored user intent. Version 1 preferences migrate losslessly: a common ID becomes the pack; otherwise Default remains the pack and non-default target IDs become overrides.

The effective selection—not preference intent—is passed to surface providers, CSS injection, and the native menu. The native menu exposes Theme Pack first and keeps per-surface selections under Customize.

## Custom CSS

Appearance → Theme → Advanced contains a Custom CSS editor with a target selector, source textarea, Save & Apply, Open Themes Folder, Reload, and validation feedback. Electron Main owns the source and saves it to a managed package below `${app.getPath("userData")}/themes/puppyone-custom-css/`:

```text
theme.json
application.css
markdown.css
csv.css
assets/
```

The renderer never receives arbitrary filesystem write authority. It sends only `{ target, css }`; Main validates size, compiles the candidate with the existing scoped compiler, then performs an atomic write. Invalid CSS does not replace the last valid source. Saving reloads the catalog and applies the managed Custom CSS theme as an override for that target. The existing themes folder remains the advanced file interface for assets, imports, full packages, and Typora-style top-level Markdown CSS.

## CSS and Appearance precedence

The stable conceptual order is base product tokens → Interface Style → resolved mode/base palette → Theme Pack → explicit surface override. Application CSS remains root-token-only. Built-in packs use palette and public content/table tokens and do not change Appearance-owned layout, icons, motion, or typography preferences. Deliberately authored Custom CSS is the final scoped surface override, so advanced users can opt into direct Markdown/CSV typography and structure changes without allowing them to escape the selected surface.

## Error handling and tests

The UI keeps the last valid catalog and reports read/save/compile errors inline. Managed writes use bounded source input and the existing import, asset, symlink, and output budgets. Tests cover preference migration and resolution, Appearance placement, Advanced disclosure, Custom CSS IPC validation and atomic persistence, native menu semantics, built-in pack CSS selectors, mode fallback, and complete renderer integration.
