# Desktop Build Identity and Update Lifecycle

## Contract

PuppyOne Desktop has exactly three application build channels:

| Channel | Product name | Audience | Update behavior |
|---|---|---|---|
| `dev` | Development / 开发版 | local development | disabled |
| `internal` | Internal / 内测版 | team and invited testers | Internal feed only; manual install while ad-hoc signed |
| `stable` | Stable / 正式版 | public users | signed Stable feed |

Beta, Preview, RC, Canary, and Archive are not application channels. Historical
archive records may remain in the release catalog as legacy provenance.

The installed application cannot switch channel at runtime. A Stable package
cannot become Internal through Settings or an environment variable.

## Single Source of Truth

`shared/desktop-build-identity.mjs` resolves one immutable Build Identity from:

- the stable base version in `package.json`
- one canonical channel
- a full Git commit
- a CI-owned numeric build number for published builds
- build time and local dirty state

Examples:

```text
0.1.3-dev.g16d52384.dirty
0.1.3-internal.1842
0.1.3
```

The generated `generated/desktop-build-info.json` is ignored by Git and embedded
as `build-info.json` in packaged applications. It controls:

- complete Electron application version
- app ID and display name
- user-data directory
- macOS marketing/build versions
- artifact names
- update feed
- tag, release title, manifest, and latest pointer

Published workflows do not compose versions independently.

## Installed Isolation

| Channel | Application ID | User-data owner | Feed |
|---|---|---|---|
| `dev` | `ai.puppyone.desktop.dev` | `puppyone-development` | none |
| `internal` | `ai.puppyone.desktop.internal` | `puppyone-internal` | `/desktop/internal/mac/latest` |
| `stable` | `ai.puppyone.desktop` | `puppyone` | `/desktop/stable/mac/latest` |

Application identity is configured before the single-instance lock and before
services read `userData`. Internal and Stable can therefore be installed and
run side by side without sharing profiles or updater state.

## Runtime Ownership

At startup, `electron/main/build-info-service.mjs`:

1. loads packaged `build-info.json`, or synthesizes Development identity only
   for an unpackaged local run
2. validates the complete schema
3. checks that packaged metadata agrees with `app.getVersion()`
4. selects application name, ID, and user-data path
5. injects the immutable value into version-dependent services

A packaged application with missing or contradictory Build Identity fails
closed. It never defaults to Stable.

The renderer can only call:

```ts
getBuildInfo(): Promise<DesktopBuildInfo>
```

It presents the value only in **Settings → General** and cannot mutate it.
General is application-scoped; project name, path, Git, and unlinking belong
under **Local Project** and never share the Build Identity surface.

## Updater Authority

`electron/update-service.mjs` is the only owner of `electron-updater`.

The updater receives Build Identity through dependency injection and resolves
the feed from the fixed channel policy. Packaged builds ignore
`PUPPYONE_DESKTOP_UPDATE_CHANNEL` and generic feed overrides.

The only override is an explicit unpackaged Development test:

```text
PUPPYONE_DESKTOP_DEV_UPDATE_URL=<test HTTPS feed>
PUPPYONE_DESKTOP_FORCE_DEV_UPDATE_CONFIG=1
```

Both values are required. They cannot enable an override in a packaged app.

Internal is currently ad-hoc signed and therefore reports automatic updates as
disabled on macOS. Invited testers install newer Internal packages manually.
This is deliberate: macOS executable updates require an appropriate release
signature. A future signed Internal build may enable its existing Internal feed
without adding another channel.

Stable requires Developer ID signing, hardened runtime, notarization, stapling,
Gatekeeper acceptance, a ZIP payload, and the channel-specific
`stable-mac.yml` updater metadata.

## Update State Machine

The main process owns a serial, idempotent state machine:

```text
disabled
idle → checking → not-available
                → available → downloading → downloaded → installing
                                             └────────→ blocked
any operational state → error
```

`Update now` is one renderer command. Main decides whether it must check,
download, run restart preflight, or install. Duplicate operations share the
in-flight operation rather than starting parallel downloads.

Restart preflight protects active Terminal and Agent sessions. Additional
document, filesystem, sync, and publish blockers should join the same contract.

## Packaging and Verification

`scripts/prepare-desktop-build.mjs` writes:

- `generated/desktop-build-info.json`
- `generated/electron-builder.json`

`scripts/verify-packaged-desktop-build.mjs` then inspects the actual package:

- app bundle name
- application ID
- Electron package version inside `app.asar`
- macOS marketing and build versions
- embedded Build Identity
- channel-specific update configuration
- DMG, ZIP, and updater-metadata versions

The package is rejected before release metadata is created if any value
disagrees.

## Release and Promotion

Internal versions use the GitHub Actions run number:

```text
v<base>-internal.<run-number>
```

The caller never types a suffix. New release manifests use schema 2 and carry
the same base version, complete version, build ID, commit, build time, and dirty
state as the embedded identity.

Stable is source promotion, not byte promotion. The workflow:

1. finds a schema-2 Internal release for the exact Stable commit and base
   version
2. verifies its immutable manifest, Build Identity, checksums, and assets
3. rebuilds the same commit with Stable identity
4. signs, notarizes, verifies, and publishes it
5. records the promoted Internal tag in Stable `release.json`

Internal and Stable use the same canonical publisher. Immutable R2 objects and
GitHub assets are verified before mutable latest pointers and the catalog.

Internal GitHub records remain drafts in this public repository. R2 authorization
must be enforced by Cloudflare Access or another authenticated distribution
boundary; an obscure path or prerelease label is not access control.
New Internal releases use the separate
`desktop/internal/catalog/releases.json`; the public
`desktop/catalog/releases.json` remains the Stable/archive view.

## Required Checks

The architecture is protected by:

```bash
node scripts/check-desktop-build-identity-architecture.mjs
node scripts/check-macos-release-config.mjs
npm test
npm run build
```

Key tests cover resolver validation, application/profile/feed isolation,
packaged metadata inspection, renderer presentation, updater feed pinning,
release-manifest equality, and exact-commit Stable promotion.

## Invariants

- Active application channels are exactly `dev`, `internal`, and `stable`.
- A packaged channel never comes from runtime environment state.
- Development never uses a product update feed.
- Internal never resolves the Stable feed.
- Stable never resolves the Internal feed.
- Packaged version, Build Identity, artifact version, release version, and tag
  agree.
- Stable always references verified Internal evidence for the same commit.
- Published versioned objects are immutable; recovery uses a higher version.
