# Desktop App Icon

## Flat-only policy

PuppyOne uses flat artwork for every desktop icon entry point. Do not add
metallic rims, bevels, specular highlights, gradients, drop shadows, or a
separately styled platform icon source.

The canonical Stable source is:

```text
public/logo-square.png
```

It must be byte-identical to the approved flat export:

```text
public/logo-square-v0.1.3-dark.png
```

The canonical Development source is:

```text
public/logo-square-dev.png
```

It must be byte-identical to the approved flat, badged export:

```text
public/logo-square-v0.1.3-dark-dev.png
```

## Packaging contract

`package.json` points the macOS application icon directly at the canonical flat
PNG:

```json
"mac": {
  "icon": "public/logo-square.png"
}
```

Electron Builder initially generates its platform icon, then
`scripts/after-pack-flat-macos-icon.mjs` removes that generated ICNS before
signing and points `CFBundleIconFile` directly at `logo-square.png`. Finder and
the runtime therefore consume the same flat PNG.

The Stable raw PNG is also copied to the app resources for the runtime Dock
icon:

```json
"extraResources": [
  {
    "from": "public/logo-square.png",
    "to": "logo-square.png"
  }
]
```

The main process resolves only canonical PNG sources. It must not fall back to
a repository or packaged `icon.icns` file.

## Fixed Dock icon policy

The runtime Dock icon is the canonical Polished source above. Appearance does
not expose a Dock icon preference, the preload does not expose a switching IPC,
and packaging does not copy Light or Matte artwork as native Dock resources.
Alternative source art may remain in the repository or Renderer public output
for design reference, but it is not part of the runtime Dock icon contract.

## Verification

Run the release configuration guard:

```bash
node scripts/check-macos-release-config.mjs
```

Confirm the canonical files match their approved flat exports:

```bash
shasum -a 256 \
  public/logo-square.png \
  public/logo-square-v0.1.3-dark.png

shasum -a 256 \
  public/logo-square-dev.png \
  public/logo-square-v0.1.3-dark-dev.png
```

After packaging, confirm that the bundled raw PNG matches the canonical source:

```bash
shasum -a 256 \
  public/logo-square.png \
  release/mac-arm64/puppyone.app/Contents/Resources/logo-square.png
```
