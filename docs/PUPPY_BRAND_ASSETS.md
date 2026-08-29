# Puppy Brand Assets

PuppyOne has exactly four canonical Puppy images. They are separated by
runtime ownership so native application artwork cannot be mistaken for a
Renderer asset.

```text
puppyone desktop/
├── assets/
│   └── brand/
│       └── puppy/
│           ├── puppy-app-image.png
│           └── puppy-app-image-dev.png
└── public/
    └── assets/
        └── brand/
            └── puppy/
                ├── puppy-dark.svg
                └── puppy-lite.svg
```

## Asset roles

### App Image

`assets/brand/puppy/puppy-app-image.png` is the authored 1024 x 1024 Figma
export for macOS Finder, Dock, app bundle, and DMG presentation. It has the
black ground, white Puppy face, and designed reflective edge. It is not a
generated asset and it must not be used inside product UI.

The source lives outside `public/` because it belongs to Electron's native
packaging pipeline. `package.json` points `build.mac.icon` to it and copies the
same PNG to `Contents/Resources/puppy-app-image.png`. The after-pack hook removes
electron-builder's derived `icon.icns` and assigns the authored PNG directly to
`CFBundleIconFile`.

Internal and Stable builds use this unbadged App Image. Development selects
the badged native variant described below.

### Development App Image

`assets/brand/puppy/puppy-app-image-dev.png` is the Development-only native
variant. It preserves the same authored reflective edge as the canonical App
Image and adds the yellow `D` badge in the lower-right corner so a local build
is immediately distinguishable in Finder and the Dock.

The generated Development electron-builder configuration selects this source
but copies it to the same packaged resource name, `puppy-app-image.png`.
Internal and Stable builds continue to select the unbadged App Image.

### Puppy Dark

`public/assets/brand/puppy/puppy-dark.svg` is the warm light product-facing
Puppy mark with deep linework. It is optimized for the Dark presentation and
does not include the App Image's reflective frame.

### Puppy Lite

`public/assets/brand/puppy/puppy-lite.svg` is the bright product-facing Puppy
mark with warm gray linework. It is optimized for the Light presentation and
does not include the App Image's reflective frame.

Both product marks are rendered through
`src/components/brand/PuppyBrandMark.tsx`; product features should not create
new aliases or refer to the PNG paths independently.

## `assets/` versus `public/assets/`

- `assets/` is repository-owned source material for non-Renderer pipelines.
  Files there are not automatically exposed as browser URLs or copied by Vite.
- `public/assets/` is the Renderer static-file boundary. Vite copies these files
  into `dist/assets/` with stable names, so the application UI can resolve them
  at runtime.

The repeated word `assets` is intentional: the first identifies source assets
at repository level, while the second groups publicly served assets inside
Vite's special `public/` directory.

## Guardrail

Run:

```bash
npm run check:puppy-brand-assets
```

The check enforces the exact four-file directory contents, native PNG and
Renderer SVG dimensions, self-contained SVG safety, the native/Renderer
boundary, removal of retired aliases, and the electron-builder App Image
mapping.
