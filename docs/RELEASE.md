# Desktop Release System

## Contract

PuppyOne Desktop uses one release transaction with two delivery surfaces:

- GitHub Releases is the canonical source/version record. Stable records are
  public; Internal records remain collaborator-only drafts.
- Cloudflare R2 is the website and updater distribution layer: branded URLs,
  immutable versioned downloads, mutable channel aliases, and a release catalog.

A release is built exactly once. The verified bundle from that build is uploaded
unchanged to GitHub and R2. Independent local R2 publishing is intentionally not
supported because it can split the GitHub, R2, catalog, and updater state.

## Distribution Origins

The release bucket has two public roles, not two copies of every release:

| Origin | Contract | Consumers |
|---|---|---|
| `https://updates.puppyone.ai` | permanent Stable machine-update API | Stable apps already installed on user machines |
| `https://downloads.puppyone.ai` | public download and release-discovery API | website, operators, manual downloads, catalogs |

Both origins expose the same `puppyone-desktop` R2 object keys. The publisher
uploads each object once, then verifies it through the origin used by each
consumer. `updates.puppyone.ai` must be a direct custom-domain or pass-through
mapping, not a redirect to the website origin.

An update feed embedded in a shipped Stable app is a permanent compatibility
endpoint. `shared/desktop-distribution-contract.mjs` is the source of truth for
the bucket, origin roles, and every shipped feed contract. A future origin
migration appends the old and new feeds to that registry and keeps both healthy
until no supported installed version depends on the old one.

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
│   ├── catalog/
│   │   └── releases.json
│   └── mac/
│       ├── v0.1.1-internal.1/
│       ├── v0.1.2-internal.2/
│       ├── v0.1.2-internal.4/
│       ├── <future-release-tag>/
│       │   ├── build-info.json
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
        │   ├── build-info.json
        │   ├── release.json
        │   ├── SHA256SUMS
        │   └── <release assets>
        └── latest/
            ├── latest.json
            ├── stable-mac.yml
            ├── puppyone-latest-arm64.dmg
            └── puppyone-latest-arm64.zip
```

The rules are:

- A versioned prefix is immutable and is never overwritten.
- `release.json` is uploaded last and is the R2 commit marker.
- `latest/` is a mutable channel view and is promoted only after GitHub and the
  versioned R2 payload have matching digests.
- `desktop/catalog/releases.json` is the public Stable/archive website API.
- `desktop/internal/catalog/releases.json` is the restricted Internal
  promotion/tester API and follows the same publish-last rule.
- `archive/` is only for artifacts released before this pipeline existed. Future
  internal and stable version folders are already their own permanent archive.

## Metadata

Every immutable release contains:

- `build-info.json`: the exact identity embedded in the application.
- `release.json`: version, channel, timestamp, full Git commit, GitHub Release
  URL, R2 URLs, signing state, byte lengths, and SHA-256 digests.
- `SHA256SUMS`: conventional checksums for every downloadable asset.

New Internal and Stable manifests use schema 2 and repeat the base version,
complete version, build ID, platform build number, build time, commit, and dirty
state from Build Identity. Stable manifests also record the exact promoted
Internal tag. Legacy schema-1 records remain readable for backfill and archive
history.

Every active channel contains `latest/latest.json`, a small pointer from the
channel to the immutable version. The website should fetch:

```text
https://downloads.puppyone.ai/desktop/catalog/releases.json
```

It should not list the bucket and should not query GitHub live for its primary
release history. Each catalog entry already contains the GitHub and R2 links
needed to render a release page.

Stable promotion reads the authenticated Internal catalog instead:

```text
https://downloads.puppyone.ai/desktop/internal/catalog/releases.json
```

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
resolve and validate Build Identity
→ install locked dependencies
→ build once on a pinned macOS runner
→ sign/notarize for stable
→ create release.json, SHA256SUMS, and latest.json
→ verify the local bundle
→ create GitHub build-provenance attestations
→ hand off one immutable Actions artifact
→ verify the existing Stable update contract before any publication write
→ upload the immutable R2 version
→ verify every public R2 object by SHA-256
→ create a GitHub draft release with the same files
→ verify GitHub's asset digests
→ publish Stable GitHub release, or retain Internal as a draft
→ promote channel payloads and aliases
→ verify every mutable payload through downloads.puppyone.ai by SHA-256
→ verify Stable updater payloads through updates.puppyone.ai by SHA-256
→ publish latest.json
→ verify Stable metadata, exact version, payload size, and HTTP byte ranges
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
generated for binaries, `build-info.json`, `release.json`, and `SHA256SUMS`.

`.github/workflows/desktop-update-feed-monitor.yml` runs the same Stable feed
contract every six hours and on manual dispatch. It has a read-only GitHub token
and no signing, R2, or Cloudflare credentials. A failed monitor is an
operational incident: do not publish another Stable version until the existing
installed-client path is healthy.

The publisher's live-origin preflight is also a separate read-only job. It runs
before the deployment-environment job is eligible, so operators are not asked
to approve and expose publication secrets for a release whose existing
installed-client path is already broken.

## GitHub Repository Setup

Create these deployment environments:

### `desktop-internal`

Environment secrets:

```text
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY

# optional until Cloudflare Access is enabled; configure one read path
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
# or
PUPPYONE_INTERNAL_RELEASE_TOKEN
```

This environment may run without manual approval while the Internal channel is
used by the team and invited testers.

### `desktop-signing`

Environment secrets:

```text
CSC_LINK
CSC_KEY_PASSWORD
```

Configure one complete notarization mode:

```text
# App Store Connect API key
APPLE_API_KEY_BASE64
APPLE_API_KEY_ID
APPLE_API_ISSUER

# or Apple ID
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID

# or a provisioned keychain profile
APPLE_KEYCHAIN_PROFILE
```

`APPLE_API_KEY_BASE64` is the single-line base64 encoding of the downloaded
team API key `.p8` file. The signing step materializes it with owner-only
permissions under `RUNNER_TEMP`, passes that file path to `notarytool`, and
removes it when the step exits. Do not use an Individual API key: Apple does
not allow Individual keys to authenticate `notarytool`.

Stable promotion also needs read-only access to the protected Internal
catalog. Configure either `CF_ACCESS_CLIENT_ID` plus
`CF_ACCESS_CLIENT_SECRET`, or `PUPPYONE_INTERNAL_RELEASE_TOKEN`, as
repository secrets or in this protected environment. These credentials do not
grant R2 publication access.

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

Map both public origins to the same `puppyone-desktop` bucket and preserve the
object path:

```text
downloads.puppyone.ai/<key> → puppyone-desktop/<key>
updates.puppyone.ai/<key>   → puppyone-desktop/<key>
```

Provision DNS and a valid TLS certificate for both names. The Stable publisher
fails closed before changing public state when the currently shipped update
origin, metadata, payload, or byte-range behavior is unhealthy.

Versioned release paths use:

```text
Cache-Control: public, max-age=31536000, immutable
```

Create a one-time Cloudflare Cache Rule that bypasses edge caching for:

```text
starts_with(http.request.uri.path, "/desktop/internal/mac/latest/")
or starts_with(http.request.uri.path, "/desktop/internal/catalog/")
or starts_with(http.request.uri.path, "/desktop/stable/mac/latest/")
or starts_with(http.request.uri.path, "/desktop/catalog/")
```

Those paths are mutable. Without this rule, an old alias or cached 404 may
remain visible after R2 has accepted the new object. Versioned paths should stay
cacheable and immutable.

The Stable update origin must pass through `Range: bytes=0-0` and return `206`
with a correct `Content-Range` total. Electron's macOS updater depends on ZIP
range requests; a domain that returns the right file for ordinary browser
downloads can still be unusable as an updater endpoint.

The R2 credentials should have object read/write/list permission only for the
`puppyone-desktop` bucket. They do not need Cloudflare account administration
permissions.

Internal distribution must sit behind Cloudflare Access, authenticated product
download APIs, or short-lived authorized URLs. The current repository can keep
the GitHub record private as a draft, but bucket paths and `Cache-Control` are
not authorization. Do not describe Internal as restricted until the
`downloads.puppyone.ai/desktop/internal/` boundary enforces access.

Protect the entire `/desktop/internal/` prefix, including its catalog and
immutable version paths. Historical Internal entries previously written to the
public catalog should be migrated out during the access-control rollout.

## Internal Release

Run **Actions → Desktop Internal Release → Run workflow**.

- Keep `publish_release` enabled to publish both GitHub and R2.
- Disable it to produce a private Actions artifact without changing external
  state.
- The workflow owns the build number and generates:

```text
v<package-version>-internal.<run-number>
```

The Internal build is ad-hoc signed and not notarized. Its complete version is
embedded in the app, artifact names, launcher package, updater metadata, and
release manifest. Its GitHub Release remains a draft; the R2 manifest records
the precise signing state.

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

Prepare a Stable release by first publishing and approving an Internal build
for the exact commit. Then point the exact matching Stable tag at that commit:

```bash
git tag v0.1.5
git push origin v0.1.5
```

The tag and package version must match exactly. The stable workflow prepares the
application before exposing signing credentials, verifies the immutable
Internal manifest/checksums/assets for the same commit, then scopes Apple
credentials to only the signing/notarization step.

Local verification is supported:

```bash
PUPPYONE_BUILD_NUMBER=1843 PUPPYONE_RELEASE_TAG=v0.1.5 npm run dist:mac:release
```

Local publication is not supported. Only the tagged GitHub workflow can publish
stable GitHub and R2 state.

Operators can run the same read-only production check locally or from Actions:

```bash
node scripts/verify-desktop-stable-update-feed.mjs
```

During a Stable publication the workflow additionally passes the new exact
version with `--expected-version`; this prevents a successful release from
leaving the website pointer and installed-client feed on different versions.

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
8. Publishes a Stable/archive public catalog and a separate Internal catalog.
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
