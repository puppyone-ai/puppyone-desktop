# Renderer image assets

PuppyOne keeps Renderer images in owned collections under `public/assets/`.
The directory is the delivery boundary; the typed `RENDERER_ASSET_PATHS`
catalog in `packages/shared-ui/src/core/rendererAssetCatalog.ts` is the code
boundary. Renderer code resolves catalog entries with
`resolveRendererPublicAssetUrl` so Electron's relative production base keeps
working.

```text
public/assets/
├── brand/
│   └── puppy/                 # PuppyOne-owned in-product marks only
├── icons/
│   ├── agents/                # Codex, Claude Code, Cursor, and other agents
│   ├── integrations/          # Airtable, Google, Notion, Slack, Git, etc.
│   └── ui/                    # Product-neutral UI images not covered by Lucide
└── media/
    ├── demos/                 # Animated product flows
    ├── diagrams/              # Architecture and explanatory graphics
    └── screenshots/           # Product screenshots and README media
```

Native macOS App Images remain in `assets/brand/puppy/`, outside `public/`.
Their packaging and brand contract is documented in
[`PUPPY_BRAND_ASSETS.md`](PUPPY_BRAND_ASSETS.md).

## External product marks

External SaaS and infrastructure marks are one maintained integration-icon
collection, not PuppyOne brand assets. Add an icon only when a shipped surface
uses it. A provider supported by the backend does not, by itself, require a
bundled image; use a Lucide fallback until the product UI needs the official
mark.

Agent products have a separate collection because they appear in Agent and
Terminal identity surfaces and often require explicit light/dark variants.
Theme variants use `-light` or `-dark`; other version numbers and download-site
suffixes are not valid asset names.

## Adding or changing an image

1. Confirm ownership, source, and permitted product-identification use.
2. Put the file in the narrowest collection and use lowercase kebab-case.
3. Prefer SVG for scalable marks; retain PNG/WebP only when the source artwork
   or rendering fidelity requires raster data.
4. Add exactly one path to `RENDERER_ASSET_PATHS`; do not duplicate an image
   under a feature-specific alias.
5. Resolve the catalog path with `resolveRendererPublicAssetUrl`. CSS theme
   overrides use the same canonical `public/assets/...` destination.
6. Run `npm run check:renderer-assets` and the affected feature tests.

Raw Figma layer names, timestamped screenshots, spaces, underscores, download
IDs, and double extensions are rejected by the asset architecture check.
