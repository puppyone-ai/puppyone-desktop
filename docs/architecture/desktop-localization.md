# Desktop Internationalization and Localization Architecture

**Status:** Implemented technical architecture. The application, Shared UI,
Electron native surfaces, and eight complete catalog sets use the architecture
defined here. Shipping a locale remains conditional on the linguistic, visual,
platform-package, and security-copy reviews in sections 18, 19, and 21.

**Last reviewed:** 2026-07-14.

This document is the normative architecture for application-language support
in PuppyOne Desktop. It covers the renderer, Shared UI, Electron main process,
native dialogs and menus, Local API errors, Cloud-facing Desktop surfaces,
Agent presentation, Automation, Source Control, Terminal, Viewer Packs,
formatting, bidirectional layout, packaging, and translation quality.

It complements:

- [Desktop Repository Layout](repository-layout.md), which owns source and
  dependency boundaries;
- [Local and Cloud UX](local-and-cloud-ux.md), which owns the one-Project
  product model;
- [Desktop Multi-Window Workspaces](desktop-multi-window-workspaces.md), which
  owns window and workspace identity;
- [Desktop Appearance Settings](desktop-appearance-settings.md) and
  [Desktop Typography](desktop-typography.md), which own visual preferences and
  font roles;
- [Desktop Menu Surface](desktop-menu-surface.md), which owns menu geometry and
  styling;
- [Desktop Terminal Architecture](desktop-terminal-architecture.md), which
  owns the terminal grid;
- [Git and Source Control Architecture](git/README.md), which owns Git
  authority and parser stability;
- [Desktop Agent Architecture](desktop-agent/README.md), which owns native
  Agent and provider boundaries;
- [Automation and Plugin Domain Boundary](automation-plugin-domain-boundary.md),
  which separates Cloud Automation from local Viewer Plugins; and
- [Editor and Viewer Architecture](editor/README.md), which owns authored
  document and viewer behavior.

## 1. Executive decision

PuppyOne Desktop supports these eight application languages:

1. English;
2. Spanish;
3. Brazilian Portuguese;
4. French;
5. German;
6. Japanese;
7. Korean; and
8. Simplified Chinese.

`System` is a language preference, not a ninth application language.
It resolves to one of the eight supported locales.

The architectural decisions are:

- application language is global to the Desktop installation, not scoped to a
  Project, workspace, Cloud account, Agent, or window;
- Electron main is the runtime authority for the persisted language preference,
  system-language detection, native UI, and multi-window broadcasts;
- every React surface, including Shared UI and portal roots, consumes one
  renderer localization context;
- first-party cross-process contracts carry stable semantic codes and values,
  not pre-localized English sentences;
- authored content, user data, provider output, terminal output, Git output,
  paths, identifiers, and brand names are not translated;
- message selection, pluralization, number/date formatting, collation, text
  direction, and accessibility text all use the resolved locale explicitly;
- text direction is manifest-driven and applied at the document root. The
  current eight locales are LTR, while the layout, bidi isolation, technical
  LTR islands, and pseudo-locale tests remain RTL-ready for future locales;
- catalogs ship with the signed application and are selected locally. Runtime
  translation downloads are outside the initial architecture;
- only complete, reviewed locales appear in production. Partial catalogs may
  exist on development branches but cannot be user-selectable.

## 2. Terms and invariants

### 2.1 Terms

| Term | Meaning |
| --- | --- |
| Internationalization / i18n | Product and code structure that makes multiple locales possible. |
| Localization / l10n | Locale-specific messages, formats, layout validation, and language review. |
| App locale | One of the eight supported locales used for first-party UI messages and grammar. |
| Language preference | `system` or an explicitly selected app locale. |
| System languages | Ordered OS language preferences reported by Electron. |
| Direction | `ltr` or `rtl` for application chrome. |
| Authored content | Files, Markdown, Office documents, PDFs, HTML, commit messages, prompts, and other user/provider-owned text. |
| Product message | First-party label, status, explanation, action, dialog, accessibility name, or recoverable error summary. |

### 2.2 Non-negotiable invariants

- Locale values are canonical BCP 47 language tags.
- Stable IDs, route names, storage keys, IPC channels, API fields, enum values,
  analytics dimensions, log categories, and file paths are never localized.
- Translation never changes business state, authorization, routing, parser
  behavior, or Agent execution.
- No component determines language from a translated string.
- No parser classifies an error by matching a translated sentence.
- No user or provider value is treated as trusted markup by the message
  formatter.
- A missing production message falls back to English; a raw message key is
  never rendered to the user.
- Changing language does not require restarting the application and does not
  reopen, detach, or mutate a Project.

## 3. Implemented baseline and remaining release work

The following is the verified implementation inventory on 2026-07-13. Message
counts are checked values at this revision, not permanent architecture budgets.

| Area | Implemented state |
| --- | --- |
| Provider/runtime | One process-neutral `@puppyone/localization` package owns locale resolution, ICU formatting, cached `Intl` helpers, bidi isolation, React context, and test support. |
| Manifest and catalogs | `locales/manifest.json` defines exactly eight production locales. All eight contain the same 2,021 renderer message IDs in 14 feature namespaces and the same 42 native message IDs. |
| HTML and lifecycle | Bootstrap resolves locale before product mount. `LocalizationProvider` updates root `lang`, `dir`, locale, and preference attributes atomically without remounting the application. |
| Persistence and IPC | Electron main owns validated, atomic per-installation preference persistence, system-language resolution, native catalog state, typed preload IPC, and all-window broadcasts. |
| Product coverage | Shell, onboarding, workspace, Shared UI/editor/viewers, Settings, Cloud, Automation, Source Control, Agent, Terminal, Plugins, updates, and native dialogs use catalogs. |
| Semantic boundaries | Cloud repository context, project/backup status, Agent lifecycle errors, document-session errors, Automation definitions, and other first-party state cross boundaries as stable codes plus values. Raw provider or diagnostic detail is not used as message selection. |
| Formatting | Product numbers, dates, relative time, lists, and collated display ordering use locale-explicit cached formatters. Protocol values remain locale-neutral. |
| Bidirectional layout | Direction remains manifest-driven at the document root. Application chrome uses logical layout, direction-sensitive icons and switches can mirror, side-panel pointer/keyboard geometry is tested in RTL, and terminal/code/diff/graph content is isolated as LTR. No current shipping locale selects RTL. |
| Enforcement | `npm run check:localization` validates manifest order, locale readiness, namespace/key parity, ICU syntax, placeholder parity, forbidden rich markup, message references, native coverage, and literal visible JSX/ARIA copy. |

The implementation intentionally leaves engineering diagnostics, stable error
codes, protocol constants, user/authored text, provider output, Git output,
paths, identifiers, and brands untranslated. These are ownership boundaries,
not localization debt.

Before a public release, every non-English catalog still requires recorded
native-speaker review, including a French reviewer for the new `fr` catalog.
A signed build must pass the visual/platform matrix. Automated completeness
proves structural correctness; it cannot prove linguistic or legal correctness.

## 4. Supported locale contract

### 4.1 Shipping locales

| Product label | Canonical locale | Direction | Catalog intent |
| --- | --- | --- | --- |
| English | `en` | LTR | Canonical source and final fallback |
| Español | `es` | LTR | Region-neutral Spanish product copy |
| Português (Brasil) | `pt-BR` | LTR | Brazilian Portuguese |
| Français | `fr` | LTR | Region-neutral French product copy |
| Deutsch | `de` | LTR | German |
| 日本語 | `ja` | LTR | Japanese |
| 한국어 | `ko` | LTR | Korean |
| 简体中文 | `zh-Hans` | LTR | Simplified Chinese |

Language-picker locale names are endonyms and remain recognizable even if the
current catalog is damaged. The translated `System` option also shows
the resolved language.

`pt-BR` is the accepted Portuguese target. Supporting Portugal later
requires a separate `pt-PT` catalog and review; it must not silently
rename the Brazilian catalog. `fr` contains region-neutral French product
copy. Regional French system tags such as `fr-FR`, `fr-CA`, `fr-BE`, and
`fr-CH` resolve to that catalog; introducing regional terminology later
requires a separately reviewed locale rather than conditionals in product code.

### 4.2 Canonical types

The process-neutral contract is equivalent to:

```ts
type AppLocale =
  | "en"
  | "es"
  | "pt-BR"
  | "fr"
  | "de"
  | "ja"
  | "ko"
  | "zh-Hans";

type AppLanguagePreference = "system" | AppLocale;
type AppTextDirection = "ltr" | "rtl";

type LocaleState = {
  preference: AppLanguagePreference;
  locale: AppLocale;
  direction: AppTextDirection;
  systemLanguages: readonly string[];
};
```

The supported-locale manifest is the only source of truth for locale IDs,
direction, picker order, catalog paths, and production readiness. Feature code
must not reproduce locale arrays or infer RTL with an ad hoc language check.

### 4.3 System-language matching

Electron main reads `app.getPreferredSystemLanguages()` after
`app.whenReady()`. Values are canonicalized before matching.

Matching proceeds in order:

1. exact supported locale;
2. an explicitly declared alias in the locale manifest;
3. language-family match where the product has one reviewed regional catalog;
4. English.

Required aliases:

- `en-*` -> `en`;
- `es-*` -> `es`;
- `pt-*` -> `pt-BR` while it is the only Portuguese
  catalog;
- `fr-*` -> `fr`;
- `de-*` -> `de`;
- `ja-*` -> `ja`;
- `ko-*` -> `ko`; and
- `zh-Hans`, `zh-CN`, and `zh-SG` ->
  `zh-Hans`.

Traditional Chinese locales such as `zh-Hant`, `zh-TW`,
`zh-HK`, and `zh-MO` do not automatically map to
Simplified Chinese. Until a reviewed Traditional Chinese catalog exists, they
continue through the remaining OS language list and finally fall back to
English.

## 5. Product-language ownership

Localization follows product ownership. It does not flatten every string into
one category.

| Surface/data | Owner | Desktop behavior |
| --- | --- | --- |
| App shell, onboarding, navigation, Settings, updates | Desktop renderer | Fully localized |
| Data workspace and built-in editor/viewer chrome | Shared UI | Fully localized through the same provider |
| Native dialogs, file pickers with custom titles, Dock menu | Electron main | Fully localized by main-owned catalogs |
| Standard OS dialog chrome | Operating system/Electron | Use native localization; do not redraw merely for translation |
| Local/Cloud capability labels | Desktop product | Localized; underlying capability enums remain stable |
| Cloud API entities, Project names, organization names | User/Cloud data | Preserve exactly; isolate bidirectionally |
| First-party Cloud route copy inside Desktop | Desktop renderer | Localized in Desktop catalogs |
| External PuppyOne Cloud web application | Cloud web product | Separate catalogs and release lifecycle; Desktop may pass a locale hint only through a versioned URL contract |
| Automation templates and first-party explanations | Automation product | Localized |
| Provider names, connector brands, remote field names | External provider | Preserve brand/source text unless an explicit provider-localization contract exists |
| Source Control actions and status summaries | Desktop renderer | Localized |
| Branches, tags, commit messages, author names, paths, Git stdout/stderr | Git/user data | Never translated |
| Agent shell, controls, normalized known statuses | Desktop renderer | Localized |
| User prompts, assistant text, reasoning, command output, native tool output | User/native Agent | Never translated or rewritten |
| Terminal chrome | Desktop renderer | Localized |
| PTY/CLI bytes and shell environment | Terminal/user process | Never translated by UI locale |
| File names and authored file content | User data | Never translated |
| Built-in viewer labels and empty/error states | Shared UI | Localized |
| PDF, DOCX, HTML, App Preview, web embeds | Document/sandbox | Preserve authored content and its own language |
| Viewer Pack host controls | Desktop/Shared UI | Localized |
| Viewer Pack name and pack-rendered UI | Pack publisher | Display publisher data as supplied; host does not machine-translate it |
| Logs, protocol diagnostics, stable error codes | Engineering/runtime | Stable and unlocalized |

### 5.1 One Project model

The Local Only, Local + Cloud, and Cloud Only states remain one Project model.
Localization changes labels and explanations only. It cannot change source
selection, entitlement, attachment, content availability, or deployment
semantics.

### 5.2 UI language versus Agent reply language

App locale and Agent reply language are independent.

- Changing Desktop language never injects a hidden instruction into an Agent
  prompt.
- Native Agent output is rendered exactly as received after existing safety
  normalization.
- The Agent normally responds according to the user prompt and native harness.
- A future `Agent reply language` preference, if added, is a separate
  product decision with `Auto` as the default. It is not part of
  `AppLanguagePreference`.

### 5.3 UI language versus authored document direction

App direction controls application chrome. It does not impose direction on a
Markdown file, source editor, Office document, PDF, embedded page, or terminal.
Authored content follows explicit document metadata where available and
content-direction rules where it is not.

## 6. Implemented system architecture

```text
OS preferred languages
        |
        v
Electron main: DesktopLocaleService
  persisted app preference
  supported-locale manifest
  locale resolution
  native catalog
  native dialogs / Dock menu
        |
        +---- typed bootstrap IPC ----> preload bridge
        |                                  |
        |                                  v
        |                         renderer bootstrap
        |                         load exactly one catalog
        |                         set html lang + dir
        |                                  |
        |                                  v
        |                         LocalizationProvider
        |                           /             \
        |                    Desktop features   Shared UI
        |
        +---- locale-changed broadcast ----> every open window

Local API / Cloud API / Agent adapters / workers
        |
        +---- stable codes + values + sanitized technical detail
                                      |
                                      v
                            presentation localizes
```

### 6.1 Dependency direction

```text
feature UI and Shared UI
        -> @puppyone/localization/react
        -> process-neutral locale/message contracts
        -X Electron main
        -X direct catalog file reads

feature domain/application logic
        -> semantic enums, codes and values
        -X React localization hooks
        -X translated string comparisons

Electron main localization
        -> process-neutral locale manifest
        -> native catalog loader/formatter
        -X React
        -X renderer-provided message text

Local API and protocol adapters
        -> stable error/status codes
        -X app locale selection
        -X UI message catalogs
```

The first-party `packages/localization` package is
process-neutral except for an explicit React entry point. It contains locale
types, resolution, message formatting ports, React context, and format helpers.
It contains no Cloud auth, Electron authority, workspace state, or feature
business logic.

Shared UI may import this first-party process-neutral package. It must not
import Desktop `src/`, Electron, Cloud runtime, or app-shell code.

## 7. Locale state, persistence, and lifecycle

### 7.1 Authority and persistence

Electron main owns a versioned per-installation preference:

```json
{
  "version": 1,
  "language": "system"
}
```

The value is stored atomically below Electron `userData`. It is not:

- written into a Project;
- stored in `.puppyone` workspace configuration;
- synchronized through PuppyOne Cloud;
- tied to a Cloud account;
- duplicated per BrowserWindow; or
- accepted without allowlist validation.

Existing appearance preferences may remain in renderer local storage. The new
language preference is main-owned because native menus and dialogs need it
before or independently of renderer state. This document does not authorize a
broader preference-store migration.

### 7.2 Main-process locale service

`DesktopLocaleService` owns:

- reading and validating the persisted preference;
- querying and canonicalizing preferred system languages;
- resolving the active locale and direction;
- loading/caching the native catalog;
- returning a serializable bootstrap snapshot;
- persisting an explicit change;
- rebuilding locale-sensitive native UI;
- broadcasting the new snapshot to every live app window; and
- refreshing system-language resolution on app activation and new-window
  creation while the preference is `system`.

Locale changes are application-global. The service broadcasts only after the
new state and catalog are valid. An already open native dialog keeps its
current text; subsequent native UI uses the new locale.

### 7.3 Typed preload contract

The narrow bridge adds the equivalent of:

```ts
getLocalizationBootstrap(): Promise<LocaleState>;
setLanguagePreference(
  preference: AppLanguagePreference,
): Promise<LocaleState>;
onLocaleChanged(
  callback: (state: LocaleState) => void,
): () => void;
```

Main validates the sender and value. Renderer code cannot provide a catalog
path, native-dialog text, arbitrary locale string, or message formatter.

### 7.4 Startup sequence

1. Electron becomes ready.
2. Main resolves and caches `LocaleState`.
3. Main creates localized native UI and the BrowserWindow.
4. Renderer requests the bootstrap snapshot before mounting product UI.
5. Renderer loads the resolved catalog from packaged assets.
6. Renderer sets `document.documentElement.lang` and
   `document.documentElement.dir`.
7. Renderer mounts every entry path inside `LocalizationProvider`.
8. If the selected catalog cannot load or validate, renderer loads English and
   reports one bounded diagnostic.

The initial shell may show a brand mark or neutral progress treatment while the
local catalog chunk loads. It must not flash English text before switching to
the selected language.

Development browser mode has no Electron authority. It uses a development-only
adapter backed by `navigator.languages` and a local preference. That
adapter cannot become the packaged-product source of truth.

### 7.5 Runtime change sequence

1. Settings sends a preference enum to main.
2. Main validates, resolves, persists, and broadcasts the next state.
3. Each renderer loads the entire next catalog without replacing the current
   provider.
4. After validation, each window atomically swaps locale, formatters,
   `lang`, and `dir`.
5. Locale-sensitive derived labels and collators are recreated.
6. Main rebuilds the Dock menu and other persistent native UI.

A catalog-loading failure leaves the previous locale active and returns a
localized failure. No window enters a half-translated state.

## 8. Catalog and source layout

The implemented layout is:

```text
locales/
  manifest.json
  renderer/
    en/
      shell.json
      onboarding.json
      workspace.json
      editor.json
      source-control.json
      cloud.json
      automation.json
      agent.json
      terminal.json
      settings.json
      plugins.json
      updates.json
      shared-ui.json
    es/
    pt-BR/
    fr/
    de/
    ja/
    ko/
    zh-Hans/
  native/
    en.json
    es.json
    pt-BR.json
    fr.json
    de.json
    ja.json
    ko.json
    zh-Hans.json

packages/localization/
  src/
    core/                 locale types, resolver, formatter ports
    react/                provider and hooks
    testing/              test provider and non-shipping catalog transforms

electron/main/localization/
  desktop-locale-service.mjs
  native-catalog-loader.mjs
  locale-preference-store.mjs

electron/main/ipc/
  localization-ipc.mjs

src/localization/
  bootstrap.ts
  localeClient.ts
  loadRendererCatalog.ts
  catalog-loaders/       one lazy import boundary per locale

scripts/
  check-localization.mjs
```

The exact file split may evolve, but these ownership boundaries may not:

- one manifest;
- one renderer context;
- feature-oriented namespaces;
- a separate native plain-text catalog;
- process-neutral locale contracts;
- main-owned locale state; and
- build-time catalog verification.

### 8.1 Message IDs

Message IDs describe product meaning, not English wording:

```text
settings.language.title
sourceControl.discard.confirm.files
workspace.editor.preview.loading
agent.approval.allowForSession
native.executableOpen.warning.title
```

Rules:

- use a new ID when meaning changes materially;
- do not use English sentences as IDs;
- do not encode layout, capitalization, or punctuation in an ID;
- do not reuse one generic word where context changes translation;
- keep brand and protocol names as values or protected glossary terms;
- delete obsolete IDs only after all call sites and catalogs are removed; and
- generate or validate the TypeScript `MessageKey` union from the
  canonical English catalog.

### 8.2 Message formatting

The implementation adapter must provide ICU-compatible select/plural semantics
backed by CLDR behavior. Feature code uses the PuppyOne localization port, not a
third-party formatter directly.

```tsx
t("sourceControl.changes.truncated", {
  count: omittedLines,
});
```

Message requirements:

- placeholders are named and retain the same types across locales;
- plural and select branches are complete for the target locale;
- number, date, time, relative-time, and list values use shared helpers;
- sentences are translated as whole messages rather than concatenated
  fragments;
- rich messages may contain only an allowlisted named element supplied by
  React code;
- catalogs cannot contain executable HTML, scripts, URLs, styles, or event
  handlers; and
- untrusted values remain escaped React text.

Product code does not hand-write singular/plural logic or append an English
`s`. French and the other locales use their own CLDR plural categories; for
example, French treats both zero and one as `one` in ordinary cardinal rules.

### 8.3 Catalog loading and fallback

- Catalogs are bundled local assets; no catalog requires network access.
- The selected renderer catalog loads as one locale chunk before product mount.
- Non-selected renderer catalogs must not leak into the entry chunk.
- Locale changes load the complete new chunk before provider swap.
- English is the final catalog fallback.
- Production-ready catalogs must be key- and placeholder-complete, so ordinary
  production rendering does not repeatedly load English beside another locale.
- Compiled message functions are created at build time or cached once per
  catalog, never reparsed on every render.
- The native process loads only the active native catalog plus English fallback.

## 9. Renderer integration

### 9.1 Provider placement

`LocalizationProvider` is outside all feature providers and wraps
every renderer branch:

- ordinary `App`;
- Agent visual smoke;
- renderer performance smoke;
- onboarding;
- restoring-workspace state; and
- any future window entry point.

`DesktopOverlayPortal` needs no second provider because React context
crosses portals. The overlay DOM root inherits `lang` and
`dir` from the document element.

### 9.2 Component and domain boundaries

React presentation may call:

```ts
const {
  locale,
  direction,
  t,
  formatNumber,
  formatDate,
  formatRelativeTime,
  formatList,
  collator,
} = useLocalization();
```

Domain and application modules should return semantic values:

```ts
{ state: "incoming", ahead: 0, behind: 3 }
```

They should not construct:

```ts
{ label: "3 incoming changes" }
```

When a non-React presentation builder needs localized output, it receives a
small formatter port as an argument. It does not import a global singleton.
Workers return codes and values; they do not load the React catalog.

### 9.3 Static definitions

Navigation items, Settings options, file-type labels, Agent commands,
Automation templates, Plugin sections, and status definitions use one of:

- stable definition plus a message key;
- stable definition translated at render; or
- external/publisher data explicitly marked as passthrough.

Translated labels never become React keys, persisted values, route IDs, or
command IDs.

## 10. Electron native UI

Native localization includes at least:

- Dock menu actions;
- workspace-open dialog titles;
- external-app chooser titles;
- executable-file warnings and buttons;
- Git operation failure dialogs;
- App Preview execution warnings;
- Viewer Pack installation/uninstallation dialogs when that capability is
  enabled;
- update/restart confirmation owned by main; and
- future application-menu labels.

Electron main formats these messages from trusted operation data:

```js
showNativeDialog({
  kind: "open-executable",
  fileName,
});
```

It must not accept:

```js
showNativeDialog({
  title: rendererProvidedTitle,
  message: rendererProvidedMessage,
});
```

Native catalogs are plain text only. File names, branch names, app names, and
other inserted values are bounded, sanitized, and kept separate from message
selection.

Standard native buttons should use the operating system's standard behavior
where the product does not require custom semantics. Custom buttons such as
`Run App`, `Uninstall`, or `Open` remain
first-party catalog entries.

## 11. Error and status architecture

### 11.1 Error descriptor

First-party boundaries return a stable descriptor equivalent to:

```ts
type UserFacingErrorDescriptor = {
  code: string;
  params?: Readonly<Record<string, string | number | boolean>>;
  retryable?: boolean;
  technicalDetail?: string;
  correlationId?: string;
};
```

`code` selects a local message. `params` contains bounded
data. `technicalDetail` is optional, sanitized, unlocalized, and
displayed only in an expandable/copyable diagnostic surface when appropriate.

Security-sensitive raw values must be redacted before crossing IPC. Localization
does not weaken existing error, path, credential, or provider-output
sanitization.

### 11.2 Known and unknown errors

- Known first-party failures map to a localized summary and recovery action.
- Unknown failures show a localized generic summary.
- Sanitized technical detail may remain available for support and debugging.
- Raw stack traces never become ordinary product copy.
- Production never displays only an English low-level exception when a known
  semantic failure exists.

### 11.3 Git

Git child processes may continue to run with `LC_ALL=C` where parser
and classifier stability require it. The Local API classifies stable output
into semantic states/codes before presentation. Git output, commit messages,
branch names, ref names, and paths are not translated.

### 11.4 Cloud

Desktop must not classify Cloud state by matching server prose.

- Structured API codes and fields drive product state.
- A server-provided human message is external technical detail unless a
  versioned endpoint explicitly declares localized copy ownership.
- The Desktop may send an `Accept-Language` or URL locale hint for
  server-owned pages and communications, but Desktop chrome remains sourced
  from Desktop catalogs.
- User-generated Cloud names and descriptions are never put through
  `t()`.

### 11.5 Agent and provider errors

Known PuppyOne lifecycle states such as unavailable runtime, expired
authentication, unsupported protocol, approval required, or interrupted turn
should become codes plus values. Provider-native error text and assistant
output remain provider content and can appear as sanitized detail. PuppyOne
must not pretend to translate arbitrary model/provider text.

## 12. Locale-aware formatting and ordering

### 12.1 Shared formatters

All product presentation uses locale-explicit helpers built on the JavaScript
`Intl` APIs:

- `Intl.NumberFormat`;
- `Intl.DateTimeFormat`;
- `Intl.RelativeTimeFormat`;
- `Intl.ListFormat`;
- `Intl.PluralRules`; and
- `Intl.Collator`.

Formatter instances are cached by locale and options. Components do not create
new formatter instances inside large row maps.

App locale controls message grammar and default user-facing formatting. Time
zone remains an explicit domain value: system local zone, UTC, or a stored IANA
zone depending on the feature. A separate region-format preference is outside
the initial scope.

Protocol timestamps, storage, API payloads, schedule definitions, cron-like
expressions, and logs stay locale-neutral. Only their presentation is
localized.

### 12.2 Automation

- IANA time-zone IDs remain stable.
- Weekday names, dates, run frequencies, and relative times are formatted for
  the app locale.
- Schedule request construction never parses a localized display sentence.
- Provider/source IDs remain opaque.
- Template titles/descriptions are first-party catalog messages.

### 12.3 Ordering

User-visible label and name lists use a locale-owned cached collator where
localized ordering is desirable. Canonical data structures, hashes, registry
serialization, protocol comparisons, cache keys, and deterministic tests use a
stable locale-independent comparator.

Changing locale may change display ordering. It must not change persisted
identity, selection authority, or data semantics.

## 13. Text direction and bidirectional architecture

All eight current product locales are LTR. Direction nevertheless remains an
explicit manifest property rather than a language-name heuristic. The
following contract keeps the application safe for mixed-direction user data
today and makes a future RTL locale an additive, reviewable change instead of
a layout rewrite. Any future RTL locale is incomplete until layout,
interaction, text isolation, and native UI pass RTL acceptance.

### 13.1 Document direction

Before renderer mount:

```ts
document.documentElement.lang = locale;
document.documentElement.dir = direction;
```

Do not implement RTL by adding one class to an inner app shell. Document-level
direction ensures onboarding, loading states, portals, dialogs, tooltips, and
future roots inherit the same base direction.

### 13.2 Logical layout

Application chrome migrates from physical CSS to logical CSS:

| Physical | Preferred logical form |
| --- | --- |
| `margin-left/right` | `margin-inline-start/end` |
| `padding-left/right` | `padding-inline-start/end` |
| `border-left/right` | `border-inline-start/end` |
| `left/right` positioning | `inset-inline-start/end` |
| `text-align: left/right` | `text-align: start/end` |

Physical geometry is still valid where direction must remain physical:

- canvas/SVG coordinates;
- diff before/after columns whose meaning is explicitly fixed;
- terminal and code-editor grids;
- media controls;
- viewport measurements;
- drag math expressed in screen coordinates; and
- animation transforms whose direction is deliberately physical.

Every retained physical declaration in a direction-sensitive feature requires
an explanatory comment or architecture-test allowlist entry.

### 13.3 LTR islands

The following remain explicit LTR islands whenever application chrome is RTL:

- code and CodeMirror source surfaces;
- terminal and PTY output;
- Git diff code lines and hunk coordinates;
- URLs, hashes, commit IDs, model IDs, command lines, and most file-system
  paths; and
- protocol/diagnostic payloads.

They use an explicit `dir="ltr"` where inheritance would otherwise
corrupt ordering. This does not force surrounding labels to LTR.

### 13.4 User-data isolation

Project names, user names, branch names, file names, provider labels, and other
unknown-direction inline values use `bdi` or an equivalent
`dir="auto"` isolation boundary. Isolation prevents punctuation and
neighboring translated text from being reordered by the Unicode bidirectional
algorithm.

Do not add Unicode directional control characters to stored user data.
Direction belongs to presentation markup.

### 13.5 Icons, order, and keyboard behavior

- Back/forward, disclosure, breadcrumb, panel-placement, and progress-flow
  icons are classified as direction-sensitive or direction-neutral.
- Direction-sensitive icons mirror or swap semantically; brand marks, file
  type icons, media symbols, Git status, and checkmarks do not mirror merely
  because the page is RTL.
- Flex/grid visual order follows reading direction only when semantic order
  also should.
- Tree expand/collapse arrow-key behavior, horizontal roving focus, breadcrumb
  navigation, resizers, and history controls receive explicit RTL tests.
- Screen-coordinate drag/resizer math remains physical even when the handle is
  presented on the opposite logical edge.

### 13.6 Authored content

App locale does not rewrite authored document direction. Rendered prose without
explicit metadata may use block-level `dir="auto"`. Source editors,
code fences, paths, and terminal content retain their specialized direction
contracts. Embedded HTML and Viewer Packs stay inside their existing sandbox
and own their internal document direction.

## 14. Typography and text expansion

The existing semantic roles remain:

- `--po-font-ui` for chrome and controls;
- `--po-font-content` for long-form content and safe rendered prose;
- `--po-font-code` for code and diffs; and
- `--po-font-terminal` for xterm.

The bundled Geist faces may fall through to system fonts for glyphs they do not
cover. Each shipping locale must verify a supported system fallback with:

- complete glyph coverage;
- French diacritics, ligatures, apostrophes, and non-breaking punctuation;
- CJK punctuation and line breaking;
- Korean syllable rendering;
- stable control height and baseline;
- no clipped combining marks or diacritics; and
- no accidental replacement of code/terminal metric contracts.

Locale-specific UI fallback stacks may be bound through the existing semantic
font variables. A language choice must not silently replace the user's
content-font choice; it may extend its fallback coverage.

Layout rules:

- German, Spanish, Portuguese, and French are tested for substantial label
  expansion;
- Japanese, Korean, and Chinese are tested without assuming spaces between
  words;
- the non-shipping RTL pseudo-locale is tested with mixed LTR values;
- action rows wrap, grow, or use a designed compact variant before clipping;
- truncation always preserves an accessible full label or description; and
- translated copy is never forced into a fixed English pixel width merely to
  preserve a screenshot.

## 15. Accessibility

Localization includes:

- visible labels;
- accessible names and descriptions;
- tooltips;
- live-region updates;
- loading and error statuses;
- dialog titles and button names;
- table/list/tree labels;
- image alternative text where the image is informative; and
- keyboard help and recovery instructions.

Rules:

- `aria-label` is not an English escape hatch; it uses the catalog.
- An icon-only action has a localized accessible name in every locale.
- Status remains textually available and is not conveyed only by color,
  position, or mirrored iconography.
- Locale changes update the document language so assistive technology selects
  the correct pronunciation rules.
- The language picker is keyboard accessible and each language endonym is
  pronounced under its own `lang` span.
- IME composition behavior in the editor and Agent composer is unchanged by
  application locale.

## 16. Security, privacy, and trust

- Locale and message keys are allowlisted; no locale value becomes an arbitrary
  filesystem path.
- Catalog assets are part of the signed application package.
- Catalog messages cannot execute markup or code.
- Interpolated values are escaped and length-bounded where they cross IPC.
- Localization never weakens workspace authorization, Viewer Pack sandboxing,
  Cloud auth, external-open checks, or Agent redaction.
- Translated security warnings, destructive confirmations, permissions,
  billing, privacy, and legal copy require human review.
- Developer diagnostics may remain English, but user-visible recovery has a
  localized stable summary.
- The app does not send authored content to a translation service as part of
  UI localization.

## 17. Performance and packaging

### 17.1 Renderer

- Locale manifest and resolver code may live in the entry path.
- Full catalogs are separate lazy chunks.
- Initial product mount waits for exactly one selected catalog.
- Changing locale loads one new chunk and swaps atomically.
- Formatter and compiled-message caches are locale-scoped and bounded.
- Translation lookups in virtualized Explorer, Source Control, and Agent rows
  are O(1) and do not allocate a new formatter per row.
- Locale changes may invalidate presentation caches but must not invalidate
  file content, Git data, Agent sessions, or Cloud data.
- `check-bundle-budget.mjs` proves every renderer locale is an independent lazy
  chunk and that no catalog sentinel leaks into the renderer entry chunk.

### 17.2 Electron package

Release verification proves:

- all eight native catalogs are packaged;
- all eight renderer catalog chunks are present;
- required Chromium/Electron locale resources are present;
- no development pseudo-locale is exposed;
- English fallback survives a missing/corrupt selected catalog test; and
- signed/notarized packaging still passes existing release gates.

Catalogs are versioned with the application release. Over-the-air catalog
replacement would require a separate signed-content and rollback architecture.

## 18. Translation workflow and ownership

### 18.1 Source workflow

1. Feature owner adds or changes semantic English messages.
2. Localization checks validate key shape, ICU syntax, and placeholders.
3. Locale catalogs are updated.
4. Automated pseudo-locale and layout checks run.
5. A language reviewer reviews meaning, terminology, overflow, and context.
6. Security/destructive/legal messages receive explicit specialist review.
7. A locale becomes production-ready only when all release gates pass.

Machine translation may create a draft. It is not final approval for
permissions, destructive actions, Cloud entitlement, billing, privacy, Agent
approval, executable warnings, or recovery instructions.

### 18.2 Product glossary

The localization project maintains protected terminology and context notes for
at least:

- PuppyOne;
- Project;
- Local Only / Local + Cloud / Cloud Only;
- Files;
- Changes / Source Control;
- Cloud;
- Automation;
- Plugin / Viewer Pack;
- Agent;
- Terminal;
- MCP;
- provider and product brand names; and
- verbs with destructive or synchronization semantics.

The glossary identifies terms that stay in English, terms that translate, and
terms whose translation varies by grammatical context.

### 18.3 Locale release state

The manifest distinguishes target locales from production-ready locales.
Settings lists only production-ready locales. The current manifest enables all
eight because their renderer and native catalogs are structurally complete and
the application paths are migrated. Release management must change
`productionReady` to `false` for any locale that has not completed the human
acceptance record; the product must not advertise a locale whose critical flows
fall back unpredictably to English or whose security copy is unreviewed.

## 19. Verification architecture

### 19.1 Static/build gates

`npm run check:localization` verifies:

- manifest validity and canonical locale tags;
- exact key completeness for every production-ready locale;
- matching placeholder names and compatible placeholder types;
- valid plural/select branches;
- no unsafe rich-text tags or markup;
- no duplicate or malformed IDs;
- native-catalog completeness;
- every literal renderer/native message reference resolves to a known ID;
- no user-selectable pseudo-locales;
- no unreviewed catalog marked production-ready; and
- no newly introduced obvious user-facing raw strings outside an explicit
  allowlist.

The raw-string checker is AST-based and has no first-party UI debt baseline. It
fails literal JSX text and literal `alt`, `aria-label`, `placeholder`, or
`title` attributes in renderer and Shared UI sources. Its narrow allowlist is
limited to documented brands and technical tokens. Tests/fixtures, protocols,
developer diagnostics, and publisher/user data are outside product-copy
ownership and are checked by their respective boundaries.

### 19.2 Unit and integration tests

Required coverage:

- canonicalization and every system-language alias;
- Traditional Chinese non-mapping;
- invalid persisted preference fallback;
- system preference refresh;
- main-store atomic persistence;
- multi-window locale broadcast;
- catalog-load failure and English fallback;
- provider atomic swap;
- document `lang`/`dir` updates;
- native-dialog selection by operation code;
- message plural/select behavior for every locale, including French cardinal
  rules;
- date/number/list/relative-time helpers;
- stable versus localized collation;
- known and unknown error descriptors;
- bidi isolation of names, paths, branches, URLs, and IDs;
- LTR islands inside simulated RTL chrome;
- locale change without Project, Agent, Terminal, or editor reset; and
- browser-development fallback adapter.

### 19.3 Pseudo-locales

Development and CI use two non-shipping pseudo-locales:

- an expanded/accented LTR catalog to expose clipping and string
  concatenation; and
- an RTL catalog to expose physical layout and bidi failures.

Pseudo-locales transform product messages only. They do not transform user
data, code, paths, brands, IDs, or provider output.

### 19.4 Visual matrix

Automated smoke coverage includes:

- onboarding and Project list;
- local Files/Editor;
- Source Control including destructive confirmation;
- Cloud global and Project routes;
- Automation catalog/create/manage;
- Settings and language picker;
- Agent empty, streaming, tool, approval, question, and error states;
- Terminal chrome;
- built-in Viewer loading/empty/error states;
- native warnings where automation permits; and
- menus, popovers, tooltips, and overlay portals.

Representative widths include the 920 px minimum window and established
420/560/760 px right-sidebar widths. Light and dark themes are covered. RTL
pseudo-locale screenshots include mixed-direction product text, Latin, digits,
paths, and punctuation.

### 19.5 Human locale acceptance

Every shipping locale receives native-speaker review of critical journeys.
French review explicitly covers terminology, diacritics, apostrophes, spacing,
and destructive/security copy. Japanese, Korean, and Chinese require
font/shaping review on each supported release platform. Any future RTL locale
also requires RTL interaction and script-shaping review.

## 20. Implementation and release status

### 20.1 Completed in code

- locale manifest, canonical resolver, main-owned atomic preference service,
  typed IPC/preload bridge, startup bootstrap, all-window broadcast, and live
  provider swap;
- renderer and native catalogs for all eight locales;
- renderer shell, Shared UI, built-in editor/viewer chrome, Cloud, Automation,
  Source Control, Agent, Terminal, Plugins, Settings, updates, and native
  first-party UI migration;
- semantic error/status descriptors for presentation-sensitive first-party
  boundaries, with provider/user diagnostics kept separate;
- locale-explicit ICU and `Intl` formatting, bidi value isolation, document
  direction, logical CSS, directional icons, switch motion, resizer geometry,
  and explicit LTR technical islands; and
- zero-baseline visible-copy enforcement, locale lifecycle tests, RTL geometry
  and architecture tests, Electron native tests, TypeScript checks, full test
  suite, build and locale-bundle gates, and package-configuration checks.

### 20.2 Required release evidence

- native-speaker review for every catalog and explicit specialist review for
  destructive, executable, authorization, billing, privacy, and legal copy;
- visual regression approval at supported window sizes and themes, including
  French text expansion, bidi pseudo-locale coverage, and CJK font shaping;
- keyboard and assistive-technology journeys on each supported platform;
- signed/notarized package inspection proving all locale assets and Electron
  locale resources are present; and
- an owner and date recorded for each locale's acceptance decision.

Code completeness does not waive these release checks. If evidence is missing,
the locale remains in source but its manifest readiness flag must be disabled
for the public build.

## 21. Production acceptance criteria

Eight-language support is complete only when:

1. the language picker offers `System` plus exactly the eight
   production-ready locales;
2. preference persistence and immediate multi-window switching work;
3. all product roots, portals, native UI, and accessibility labels use the
   resolved locale;
4. critical Local, Cloud, Automation, Settings, Source Control, Agent,
   Terminal, Plugin, and Viewer journeys contain no unintended English;
5. authored/user/provider content remains unchanged;
6. dates, numbers, lists, plurals, relative times, and display ordering use
   explicit locale-aware helpers;
7. known cross-process errors use codes and localized summaries;
8. document direction remains manifest-driven, and bidi isolation, explicit
   LTR islands, mirrored icons, keyboard behavior, resizers, and native-dialog
   behavior pass the non-shipping RTL pseudo-locale checks;
9. every locale passes catalog completeness, pseudo-locale, visual, packaging,
   and human-review gates;
10. non-selected catalogs remain out of the entry chunk; and
11. existing workspace security, Agent ownership, Viewer sandbox, performance,
    signing, and notarization gates remain intact.

## 22. Durable decision summary

- One application-wide locale authority: Electron main.
- One renderer localization context: no feature-local i18n islands.
- One supported-locale manifest: no duplicated language arrays.
- Semantic keys and structured values: no translated-string logic.
- Separate renderer and native catalogs: shared meaning, correct process
  ownership.
- App language is not Agent language or document language.
- App direction is not terminal/code/document direction.
- External and user-authored text is preserved and isolated, not translated.
- RTL readiness is a layout and interaction contract, not a catalog-only
  concern, even though no current shipping locale is RTL.
- Catalog completeness and human review determine release availability.
- Local packaged catalogs and English fallback keep Desktop offline-capable.

## 23. Standards and platform references

- [Electron app locale APIs](https://www.electronjs.org/docs/latest/api/app)
- [IETF BCP 47 / RFC 5646 language tags](https://www.rfc-editor.org/rfc/rfc5646)
- [Unicode Locale Data Markup Language](https://www.unicode.org/reports/tr35/)
- [Unicode CLDR plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
- [W3C structural markup and right-to-left text](https://www.w3.org/International/questions/qa-html-dir.en)
- [W3C inline markup and bidirectional text](https://www.w3.org/International/articles/inline-bidi-markup/)
