# puppyone desktop

Local-first desktop workspace for protected project folders.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Both renderer builds and desktop development fail fast unless the Cloud API and
web endpoints are explicit. Adjust `.env.local` for local Cloud development;
CI and release workflows set the public production endpoints directly.

`npm run dev` starts the Vite renderer and opens the Electron shell. Use
`npm run dev:browser` only when inspecting the renderer in a plain browser;
local folder APIs require the Electron preload bridge.

Build the renderer and run Electron against the production build:

```bash
npm run build
npm run start
```

Create an unsigned macOS package for internal testing:

```bash
npm run dist:mac
```

Build output is written to `release/`.

## Product Boundary

puppyone desktop is local-first. It opens local project folders, edits files
through the shared data workspace, and keeps Git operations local.

Cloud features are opt-in and disabled by default. Users can enable Cloud from
Settings when they want the Cloud sidebar and Cloud backup actions.

GitHub is the default sync/backup service for new workspace config. puppyone
Cloud can still be selected after Cloud is enabled.

## CI/CD

This repository uses GitHub Actions for checks, unsigned internal builds, and guarded stable releases.

- `CI` runs `npm ci` and `npm run build`.
- `Desktop Internal Build` creates unsigned macOS artifacts and can upload them
  to Cloudflare R2.
- `Desktop Stable Release` runs only for matching version tags, verifies
  Developer ID signing and Apple notarization before creating the GitHub
  Release, and then publishes the same artifacts to the stable R2 feed.

Cloudflare R2 is used as the artifact/update file host. The stable release path
fails closed unless Developer ID signing, hardened runtime, notarization, and
release credentials are all present.

See [docs/RELEASE.md](docs/RELEASE.md) for release setup and required GitHub
secrets.

## License

Code is licensed under the [Apache License 2.0](LICENSE).

The puppyone name, logo, icons, and other brand assets are not granted under
the Apache License. See [TRADEMARK.md](TRADEMARK.md).
