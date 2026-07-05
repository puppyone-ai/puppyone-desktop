# Desktop App Icon

## Purpose

This document defines the PuppyOne Desktop app icon source of truth, generated
assets, packaging rules, and verification steps.

The important rule is that the packaged app must carry both:

- `Contents/Resources/icon.icns` for macOS bundle metadata, Finder, and
  LaunchServices.
- `Contents/Resources/logo-square.png` for the runtime Dock icon.

The runtime Dock icon should use the raw PNG, not the generated `.icns` slots.
This avoids visual drift where downscaled `.icns` sizes can make the icon look
more metallic or shaded than the source image.

## Source Of Truth

The active desktop icon master is:

```text
public/logo-square.png
```

Versioned source exports can live next to it, for example:

```text
public/logo-square-v0.1.4-dark.png
```

When updating the icon, copy the selected versioned PNG into
`public/logo-square.png`. The active master must be a 1024 x 1024 RGBA PNG.

The Tauri icon master mirrors the same file:

```text
src-tauri/icons/icon.png
```

These files must have the same hash after an icon update:

```text
public/logo-square-v0.1.4-dark.png
public/logo-square.png
src-tauri/icons/icon.png
```

## Packaged App Contract

Electron Builder packages the icon in two ways.

`package.json` must include the raw PNG as an extra resource:

```json
"extraResources": [
  {
    "from": "public/logo-square.png",
    "to": "logo-square.png"
  }
]
```

This produces:

```text
release/mac-arm64/puppyone.app/Contents/Resources/logo-square.png
```

The macOS bundle icon remains:

```json
"mac": {
  "icon": "src-tauri/icons/icon.icns"
}
```

This produces:

```text
release/mac-arm64/puppyone.app/Contents/Resources/icon.icns
```

The main process must prefer the raw PNG at runtime:

```text
process.resourcesPath/logo-square.png
```

It may fall back to `dist/logo-square.png`, `public/logo-square.png`, or
`icon.icns` only when running outside the packaged app.

Do not rely on `dist/logo-square.png` in packaged builds. It is inside
`app.asar`, and using it as a filesystem path is not a stable Dock icon path.

## Why Raw PNG For The Dock

macOS `.icns` files contain multiple resized slots. Mechanical downscaling can
change the visual weight of antialiasing, rim light, and soft edges. For this
icon, those generated slots can make the Dock version appear more metallic than
the 1024 PNG source.

Using `Contents/Resources/logo-square.png` for `app.dock.setIcon()` keeps the
runtime Dock icon tied to the master PNG. The `.icns` still exists for the app
bundle, Finder, and installer metadata.

## Regeneration Steps

Run these commands from the desktop project root.

Copy the selected source PNG into the active masters:

```bash
ditto public/logo-square-v0.1.4-dark.png public/logo-square.png
ditto public/logo-square-v0.1.4-dark.png src-tauri/icons/icon.png
```

Generate Tauri PNG sizes:

```bash
sips -z 32 32 public/logo-square.png --out src-tauri/icons/32x32.png
sips -z 128 128 public/logo-square.png --out src-tauri/icons/128x128.png
sips -z 256 256 public/logo-square.png --out src-tauri/icons/128x128@2x.png
```

Generate the macOS iconset:

```bash
mkdir -p /private/tmp/puppyone-logo.iconset
sips -z 16 16 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_16x16.png
sips -z 32 32 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_16x16@2x.png
sips -z 32 32 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_32x32.png
sips -z 64 64 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_32x32@2x.png
sips -z 128 128 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_128x128.png
sips -z 256 256 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_128x128@2x.png
sips -z 256 256 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_256x256.png
sips -z 512 512 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_256x256@2x.png
sips -z 512 512 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_512x512.png
sips -z 1024 1024 public/logo-square.png --out /private/tmp/puppyone-logo.iconset/icon_512x512@2x.png
iconutil -c icns /private/tmp/puppyone-logo.iconset -o src-tauri/icons/icon.icns
```

Generate the Windows `.ico`:

```bash
sips -z 16 16 public/logo-square.png --out /private/tmp/puppyone-icon-16.png
sips -z 32 32 public/logo-square.png --out /private/tmp/puppyone-icon-32.png
sips -z 48 48 public/logo-square.png --out /private/tmp/puppyone-icon-48.png
sips -z 64 64 public/logo-square.png --out /private/tmp/puppyone-icon-64.png
sips -z 128 128 public/logo-square.png --out /private/tmp/puppyone-icon-128.png
sips -z 256 256 public/logo-square.png --out /private/tmp/puppyone-icon-256.png
node -e 'const fs=require("fs"); const sizes=[16,32,48,64,128,256]; const imgs=sizes.map(s=>({s,b:fs.readFileSync(`/private/tmp/puppyone-icon-${s}.png`)})); const header=Buffer.alloc(6); header.writeUInt16LE(0,0); header.writeUInt16LE(1,2); header.writeUInt16LE(imgs.length,4); let offset=6+imgs.length*16; const entries=[]; for(const img of imgs){const e=Buffer.alloc(16); e.writeUInt8(img.s===256?0:img.s,0); e.writeUInt8(img.s===256?0:img.s,1); e.writeUInt8(0,2); e.writeUInt8(0,3); e.writeUInt16LE(1,4); e.writeUInt16LE(32,6); e.writeUInt32LE(img.b.length,8); e.writeUInt32LE(offset,12); entries.push(e); offset+=img.b.length;} fs.writeFileSync("src-tauri/icons/icon.ico", Buffer.concat([header,...entries,...imgs.map(i=>i.b)]));'
```

Build the macOS package:

```bash
npm run dist:mac
```

## Verification

Confirm the active PNGs are identical:

```bash
shasum -a 256 \
  public/logo-square-v0.1.4-dark.png \
  public/logo-square.png \
  dist/logo-square.png \
  src-tauri/icons/icon.png
```

Confirm the packaged raw PNG is present and identical:

```bash
file release/mac-arm64/puppyone.app/Contents/Resources/logo-square.png
shasum -a 256 \
  public/logo-square.png \
  release/mac-arm64/puppyone.app/Contents/Resources/logo-square.png
```

Confirm the packaged `.icns` matches the generated one:

```bash
shasum -a 256 \
  src-tauri/icons/icon.icns \
  release/mac-arm64/puppyone.app/Contents/Resources/icon.icns
```

Confirm `app.asar` also contains the active runtime PNG:

```bash
node -e 'const asar=require("@electron/asar"); const fs=require("fs"); const data=asar.extractFile("release/mac-arm64/puppyone.app/Contents/Resources/app.asar","dist/logo-square.png"); fs.writeFileSync("/private/tmp/puppyone-packaged-logo-square.png", data);'
shasum -a 256 public/logo-square.png /private/tmp/puppyone-packaged-logo-square.png
```

Before visually checking the Dock icon, stop old PuppyOne instances, touch the
bundle resources, then launch a fresh packaged app:

```bash
pgrep -fl "release/mac-arm64/puppyone.app|mac-arm64/puppyone.app|Contents/MacOS/puppyone"
touch release/mac-arm64/puppyone.app
touch release/mac-arm64/puppyone.app/Contents/Resources/logo-square.png
touch release/mac-arm64/puppyone.app/Contents/Resources/icon.icns
open -n release/mac-arm64/puppyone.app
```

If the Dock still shows an older icon, it is likely LaunchServices or Dock cache.
Do not change the source asset to compensate for cache behavior. First verify
the hashes above, then restart the Dock or relaunch the packaged app.

## Common Failure Modes

- The Dock icon looks more metallic than the source PNG.
  Usually the app is displaying `.icns` slots or a cached bundle icon instead of
  `Contents/Resources/logo-square.png`.
- The source PNG changed but the packaged app did not.
  Rebuild with `npm run dist:mac`, then verify `Resources/logo-square.png`.
- Finder and Dock do not match exactly.
  Finder may use `icon.icns`; runtime Dock should use `logo-square.png`.
- A screenshot appears to show an older icon.
  Check whether an old packaged app or dev Electron instance is still running.

