# Release

## Current State

macOS release commands fail closed unless Developer ID signing and Apple
notarization credentials are present. Electron Builder enables the hardened
runtime and notarization, while the macOS workflow verifies `codesign`,
Gatekeeper, and the stapled notarization ticket before publishing artifacts.

The remaining operational step is to provision the repository secrets and run
one real macOS release. Until that external verification succeeds, do not
publish any artifact to the stable auto-update feed.

## Release Source Of Truth

GitHub Releases are the canonical version record for puppyone desktop. Tags,
release notes, source archives, and attached build artifacts should live there
first.

Cloudflare R2 is the public download mirror and CDN. Use it for product-site
download buttons, branded URLs such as `downloads.puppyone.ai`, and future
auto-update feeds. Do not manage Cloudflare as a separate release history.

Recommended link policy:

- GitHub README/release notes can link to GitHub Release assets.
- The product website should link to Cloudflare download URLs.
- The app auto-updater uses the Cloudflare-backed generic update feed only for
  artifacts that passed signing and notarization verification.

Cloudflare should keep both versioned history and a fixed latest path:

```text
desktop/<channel>/mac/<release tag>/
desktop/<channel>/mac/latest/
```

The versioned path is an archive. The `latest` path is overwritten on each
release and should contain only the newest downloadable files. Product pages can
therefore keep a stable URL such as:

```text
https://downloads.puppyone.ai/desktop/stable/mac/latest/puppyone-latest-arm64.dmg
```

## GitHub Actions Secrets

For Cloudflare R2 uploads, add these repository secrets:

```text
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The default R2 bucket is:

```text
puppyone-desktop
```

The signed prerelease workflow uses this base R2 prefix:

```text
desktop/internal/mac
```

Each run uploads to both:

```text
desktop/internal/mac/<release tag>
desktop/internal/mac/latest
```

The stable production updater feed is configured in `package.json` as:

```text
https://updates.puppyone.ai/desktop/stable/mac
```

Use the stable path only for signed and notarized builds.

## Signed macOS Prerelease Build

Run the `Desktop Internal Build` workflow manually from GitHub Actions.

It runs:

```bash
npm ci
npm run dist:mac
```

Artifacts are uploaded to GitHub Actions. If `create_github_release` is enabled,
the same files are attached to a GitHub prerelease. If `upload_r2` is enabled,
the files are also copied to Cloudflare R2 under both the versioned release tag
and the fixed `latest` prefix.

The default GitHub release tag is generated from the package version and run
number:

```text
v0.1.1-internal.<run number>
```

You can override it with the workflow `release_tag` input when rerunning or
creating a named internal build.

The workflow fails before packaging if signing or notarization credentials are
missing. Its prerelease artifacts are suitable for internal validation only;
promoting an artifact to the stable auto-update feed still requires the
production release approval process.

## Production macOS Signing

Before running a signed macOS prerelease or enabling stable releases, add these
repository secrets (the workflow maps them to Electron Builder's variables):

```text
MACOS_CSC_LINK
MACOS_CSC_KEY_PASSWORD
APPLE_API_KEY_P8
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

Do not replace these with plaintext files in the repository. The existing
Electron Builder configuration already enables hardened runtime, signing, and
notarization; the release workflow also performs post-build verification.
