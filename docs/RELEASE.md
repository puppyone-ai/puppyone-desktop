# Release

## Current State

The repository can build unsigned macOS packages for internal testing.
Production macOS auto-update should wait until the app is Developer ID signed
and notarized.

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

The internal unsigned build workflow uploads to:

```text
desktop/internal/mac
```

The stable production updater feed is configured in `package.json` as:

```text
https://updates.puppyone.ai/desktop/stable/mac
```

Use the stable path only for signed and notarized builds.

## Internal Unsigned macOS Build

Run the `Desktop Internal Build` workflow manually from GitHub Actions.

It runs:

```bash
npm ci
npm run dist:mac
```

Artifacts are uploaded to GitHub Actions. If `upload_r2` is enabled, the same
release files are copied to Cloudflare R2.

Unsigned builds are useful for team testing but are not suitable for public
macOS auto-update.

## Production macOS Signing

Before enabling stable releases, add Apple signing and notarization secrets:

```text
CSC_LINK
CSC_KEY_PASSWORD
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

Then update the Electron Builder macOS config to sign and notarize production
builds instead of using the current unsigned internal settings.
