# Desktop Release System

## Contract

PuppyOne Desktop uses one release transaction with two public delivery surfaces:

- GitHub Releases is the canonical open-source version record: tag, commit, notes,
  source archives, binary assets, asset digests, and build provenance.
- Cloudflare R2 is the website and updater distribution layer: branded URLs,
  immutable versioned downloads, mutable channel aliases, and a release catalog.

A release is built exactly once. The verified bundle from that build is uploaded
unchanged to GitHub and R2. Independent local R2 publishing is intentionally not
supported because it can split the GitHub, R2, catalog, and updater state.

## R2 Layout

The bucket is `puppyone-desktop`. Existing channel URLs remain compatible:

```text
desktop/
├── catalog/
│   └── releases.json
├── archive/
│   └── mac/
│       ├── v0.1.0-legacy.0/
│       │   ├── release.json
│       │   ├── SHA256SUMS
│       │   └── puppyone-0.1.0-arm64.dmg
│       └── v0.1.1-legacy.0/
│           ├── release.json
│           ├── SHA256SUMS
│           └── puppyone-0.1.1-arm64.dmg
├── internal/
│   └── mac/
│       ├── v0.1.1-internal.1/
│       ├── v0.1.2-internal.2/
│       ├── v0.1.2-internal.4/
│       ├── <future-release-tag>/
│       │   ├── release.json
│       │   ├── SHA256SUMS
│       │   └── <release assets>
│       └── latest/
│           ├── latest.json
│           ├── puppyone-latest-arm64.dmg
│           ├── puppyone-latest-arm64.zip
│           └── puppyone-terminal-preview-latest-arm64.tgz
└── stable/
    └── mac/
        ├── <release-tag>/
        │   ├── release.json
        │   ├── SHA256SUMS
        │   └── <release assets>
        └── latest/
            ├── latest.json
            ├── latest-mac.yml
            ├── puppyone-latest-arm64.dmg
            └── puppyone-latest-arm64.zip
```

The rules are:

- A versioned prefix is immutable and is never overwritten.
- `release.json` is uploaded last and is the R2 commit marker.
- `latest/` is a mutable channel view and is promoted only after GitHub and the
  versioned R2 payload have matching digests.
- `desktop/catalog/releases.json` is published last and is the website API.
- `archive/` is only for artifacts released before this pipeline existed. Future
  internal and stable version folders are already their own permanent archive.

## Metadata

Every immutable release contains:

- `release.json`: version, channel, timestamp, full Git commit, GitHub Release
  URL, R2 URLs, signing state, byte lengths, and SHA-256 digests.
- `SHA256SUMS`: conventional checksums for every downloadable asset.

`release.json` also identifies provenance as `pipeline`, `backfill`, or
`archive`. This lets the webpage distinguish modern releases from GitHub-backed
history and provenance-free pre-pipeline artifacts.

Every active channel contains `latest/latest.json`, a small pointer from the
channel to the immutable version. The website should fetch:

```text
https://downloads.puppyone.ai/desktop/catalog/releases.json
```

It should not list the bucket and should not query GitHub live for its primary
release history. Each catalog entry already contains the GitHub and R2 links
needed to render a release page.

Archive entries may honestly use a null commit and null GitHub Release URL when
the provenance of a pre-pipeline artifact cannot be established. Do not invent a
tag or attach a legacy binary to an unrelated commit.

## Workflow Architecture

The two entry workflows are:

- `.github/workflows/desktop-internal-build.yml`
- `.github/workflows/desktop-stable-release.yml`

Both delegate publication to:

- `.github/workflows/desktop-release-publish.yml`

The transaction is:

```text
validate version and commit
→ install locked dependencies
→ build once on a pinned macOS runner
→ sign/notarize for stable
→ create release.json, SHA256SUMS, and latest.json
→ verify the local bundle
→ create GitHub build-provenance attestations
→ hand off one immutable Actions artifact
→ upload the immutable R2 version
→ verify every public R2 object by SHA-256
→ create a GitHub draft release with the same files
→ verify GitHub's asset digests
→ publish the GitHub release
→ promote channel payloads and aliases
→ verify every mutable payload by SHA-256
→ publish latest.json
→ merge and publish the website catalog
→ verify the public pointer and catalog bytes
→ remove stale files from the mutable latest prefix
```

Internal and stable publishing share the `desktop-release-publish` concurrency
group, so they cannot race while updating the global catalog. A committed R2
prefix or an existing GitHub Release is accepted on retry only when every
declared asset still matches. A partial R2 prefix without `release.json` fails
closed and requires a new tag or explicit cleanup.

All GitHub-owned actions are pinned to full commit SHAs. Build provenance is
generated for binaries, `release.json`, and `SHA256SUMS`.

## GitHub Repository Setup

Create these deployment environments:

### `desktop-internal`

Environment secrets:

```text
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

This environment may run without manual approval while the internal channel is
used for technical previews.

### `desktop-signing`

Environment secrets:

```text
CSC_LINK
CSC_KEY_PASSWORD
```

Configure one complete notarization mode:

```text
# App Store Connect API key
APPLE_API_KEY
APPLE_API_KEY_ID
APPLE_API_ISSUER

# or Apple ID
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID

# or a provisioned keychain profile
APPLE_KEYCHAIN_PROFILE
```

Restrict this environment to protected `v*.*.*` tags. It should not contain R2
credentials.

### `desktop-stable`

Environment secrets:

```text
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

It should not contain Apple signing credentials.

Recommended stable protection:

- Require a reviewer on either `desktop-signing` or `desktop-stable`. Requiring
  approval on both produces two approval gates for the same release.
- Restrict both environments to protected `v*.*.*` tags.
- Disable administrator bypass when the team is ready for two-person approval.

Recommended repository settings:

- Enable Immutable Releases.
- Protect stable version tags with a ruleset.
- Restrict Actions to approved publishers and require full-SHA action pins.
- Keep the workflow token read-only by default; only the publisher receives
  `contents: write`.

GitHub environment approval prevents jobs from receiving environment secrets
before approval. Immutable Releases lock published tags and assets. GitHub's
official references:

- <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>
- <https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases>
- <https://docs.github.com/en/actions/reference/security/secure-use>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>

## Cloudflare Setup

The custom domain is:

```text
https://downloads.puppyone.ai
```

Versioned release paths use:

```text
Cache-Control: public, max-age=31536000, immutable
```

Create a one-time Cloudflare Cache Rule that bypasses edge caching for:

```text
starts_with(http.request.uri.path, "/desktop/internal/mac/latest/")
or starts_with(http.request.uri.path, "/desktop/stable/mac/latest/")
or starts_with(http.request.uri.path, "/desktop/catalog/")
```

Those paths are mutable. Without this rule, an old alias or cached 404 may
remain visible after R2 has accepted the new object. Versioned paths should stay
cacheable and immutable.

The R2 credentials should have object read/write/list permission only for the
`puppyone-desktop` bucket. They do not need Cloudflare account administration
permissions.

## Internal Release

Run **Actions → Desktop Internal Release → Run workflow**.

- Keep `publish_release` enabled to publish both GitHub and R2.
- Disable it to produce a private Actions artifact without changing external
  state.
- Normally leave `release_tag` blank. The workflow generates:

```text
v<package-version>-internal.<run-number>
```

The internal build is ad-hoc signed and not notarized. The GitHub Release is a
prerelease and the R2 manifest records that security state.

The stable Terminal alias is:

```text
https://downloads.puppyone.ai/desktop/internal/mac/latest/puppyone-terminal-preview-latest-arm64.tgz
```

The release notes contain an immutable versioned `npm exec` command.

## Stable Release

Stable artifacts must be Developer ID signed, hardened, notarized, accepted by
Gatekeeper, and have a valid stapled ticket. The app embeds this updater feed:

```text
https://updates.puppyone.ai/desktop/stable/mac/latest
```

Prepare a stable release by updating `package.json`, committing it, and pushing
the exact matching tag:

```bash
git tag v0.1.3
git push origin v0.1.3
```

The tag and package version must match exactly. The stable workflow prepares the
application before exposing signing credentials, then scopes Apple credentials
to only the signing/notarization step.

Local verification is supported:

```bash
npm run dist:mac:release
```

Local publication is not supported. Only the tagged GitHub workflow can publish
stable GitHub and R2 state.

## Release History Backfill

Run **Actions → Desktop Release History Backfill** once. It reconstructs the
actual history instead of treating every old file as provenance-free:

```text
PuppyOne-0.1.0-arm64.dmg
→ desktop/archive/mac/v0.1.0-legacy.0/puppyone-0.1.0-arm64.dmg

puppyone-0.1.1-arm64.dmg
→ desktop/archive/mac/v0.1.1-legacy.0/puppyone-0.1.1-arm64.dmg

GitHub v0.1.1-internal.1
→ desktop/internal/mac/v0.1.1-internal.1/

GitHub v0.1.2-internal.2
→ desktop/internal/mac/v0.1.2-internal.2/

GitHub v0.1.2-internal.4
→ desktop/internal/mac/v0.1.2-internal.4/
```

The root `puppyone-0.1.1-arm64.dmg` is not the same build as the GitHub
`v0.1.1-internal.1` DMG: their byte lengths differ. They are therefore preserved
as two separate catalog entries instead of treating the root file as a duplicate.

The workflow:

1. Downloads all assets from the three canonical GitHub prereleases.
2. Verifies their GitHub SHA-256 digests.
3. Backfills missing R2 assets without overwriting existing bytes.
4. Adds immutable `release.json` and `SHA256SUMS` commit markers.
5. Attaches the same metadata files to the three historical GitHub Releases.
6. Archives both provenance-free root DMGs separately.
7. Verifies every public R2 object by SHA-256.
8. Publishes one catalog containing all five historical entries.
9. Deletes the two root objects only when `delete_root_objects` is explicitly enabled.

Run it first with deletion disabled. After checking the catalog and website,
rerun it with deletion enabled. Purge the two deleted root URLs if they were
previously cached.

Run this backfill before enabling GitHub Immutable Releases, because it adds
`release.json` and `SHA256SUMS` to the three already-published prereleases.

## Download Counts

GitHub counts only downloads of GitHub Release assets. R2 downloads are not
added to GitHub's `download_count`.

For one product-wide number, route website downloads through a Cloudflare Worker
or analytics endpoint and record the immutable release tag plus asset name
before serving or redirecting to R2. Keep GitHub and R2 counts as separate
sources in the data model.
