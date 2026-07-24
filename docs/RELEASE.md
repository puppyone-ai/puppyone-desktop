# Release

## Current State

The repository has two deliberately separate macOS paths:

- `npm run dist:mac` creates an ad-hoc signed, non-notarized package for internal testing.
- the `Desktop Stable Release` workflow accepts an exact `v<package version>` tag, builds with Developer ID and hardened runtime, notarizes the app, verifies Gatekeeper and the stapled ticket, creates the canonical GitHub Release, and only then uploads the verified artifacts to the stable R2 feed.

The stable path fails closed when signing, notarization, version/tag, updater, or R2 configuration is incomplete. Never publish artifacts from the internal path to the stable feed.

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
- The app auto-updater should use a Cloudflare-backed generic update feed after
  signing and notarization are enabled.

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

The internal ad-hoc build workflow uses this base R2 prefix:

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
https://updates.puppyone.ai/desktop/stable/mac/latest
```

The stable release script enforces that this path receives only signed and notarized builds.

## Internal ad-hoc macOS Build

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

The workflow uses the pinned `macos-15` arm64 runner and publishes in this
order:

```text
validate inputs, R2 credentials, and unused version prefix
→ build the ad-hoc DMG/ZIP and Terminal package
→ upload immutable versioned R2 objects
→ verify every R2 object size
→ create the GitHub prerelease
→ promote mutable latest aliases
→ verify the public HTTPS URLs and latest package SHA-256
```

Releases sharing the same R2 prefix are serialized. A versioned prefix is never
overwritten: if a failed run already uploaded objects, dispatch a new run and
leave `release_tag` blank, or supply a new unique tag.

The default GitHub release tag is generated from the package version and run
number:

```text
v0.1.1-internal.<run number>
```

You can override it with the workflow `release_tag` input when rerunning or
creating a named internal build.

Ad-hoc signed builds are useful for team testing but are not suitable for public
macOS auto-update.

### Terminal-launched preview

While Developer ID provisioning is pending, enabling `upload_r2` in the
internal workflow also creates a small npm-compatible Terminal launcher. The
launcher does not contain the app.
It downloads the immutable versioned ZIP from R2, verifies the exact byte size
and SHA-256 digest embedded in the launcher package, extracts the app into the
current user's cache directory, and starts the packaged Electron executable in
the foreground.

The exact command is written into the GitHub prerelease notes:

```bash
npm exec --yes --package=https://downloads.puppyone.ai/desktop/internal/mac/<release-tag>/<preview-package>.tgz -- puppyone-preview
```

After a successful run, the Actions job summary also shows the exact versioned
command and these stable aliases:

```text
https://downloads.puppyone.ai/desktop/internal/mac/latest/puppyone-latest-arm64.dmg
https://downloads.puppyone.ai/desktop/internal/mac/latest/puppyone-latest-arm64.zip
https://downloads.puppyone.ai/desktop/internal/mac/latest/puppyone-terminal-preview-latest-arm64.tgz
```

Run it from GitHub under **Actions → Desktop Internal Build → Run workflow**.
For the normal preview release, keep `upload_r2` and `create_github_release`
enabled, keep `r2_prefix` at `desktop/internal/mac`, and leave `release_tag`
blank.

If a `latest` URL was visited before its first upload and Cloudflare still
serves a cached 404, purge that URL once or configure a cache rule that bypasses
cache for `/desktop/internal/mac/latest/*`. Versioned files intentionally use a
one-year immutable cache; latest aliases require revalidation on every request.

This is a short-lived technical preview path, not a replacement for Developer
ID signing or notarization. Do not promote it as the stable public installer.
Once the signed release is available, direct users to the stable DMG instead.

## Production macOS Release

Add these GitHub Actions secrets for Developer ID signing, Apple notarization, and R2 delivery:

```text
CSC_LINK
CSC_KEY_PASSWORD
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

`CSC_LINK` must contain the Developer ID Application certificate and
`CSC_KEY_PASSWORD` must protect it. The checked-in production config explicitly
enables hardened runtime, strict signature verification, and notarization. The
internal build disables those settings only with command-local overrides.

To release, update `package.json` to a stable semantic version, commit it, and
push the matching tag exactly:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The stable workflow runs these guarded stages in order:

```text
build + notarize
→ codesign / Gatekeeper / stapler verification
→ canonical GitHub Release
→ immutable desktop/stable/mac/v<version> R2 prefix
→ desktop/stable/mac/latest R2 prefix
```

For a provisioned local release machine, `npm run dist:mac:release` builds and
verifies without uploading. `npm run publish:mac:r2` re-verifies the existing
artifacts before upload. `npm run dist:mac:publish` composes both commands, but
the tagged GitHub workflow remains the production source of truth.
