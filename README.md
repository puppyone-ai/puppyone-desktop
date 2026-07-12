# puppyone desktop

Local-first desktop workspace for protected project folders.

## Development

```bash
npm install
npm run dev
```

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

Cloud features are available by default, but remain opt-in at the account and
workspace level: users must sign in before Cloud projects, the Cloud sidebar,
or Cloud backup actions can access any cloud data.

GitHub is the default sync/backup service for new workspace config. puppyone
Cloud can still be selected after Cloud is enabled.

## CI/CD

This repository uses GitHub Actions for checks and unsigned internal builds.

- `CI` runs `npm ci` and `npm run build`.
- `Desktop Internal Build` creates unsigned macOS artifacts and can upload them
  to Cloudflare R2.

Cloudflare R2 is used as the artifact/update file host. Production macOS
auto-update still requires Developer ID signing and Apple notarization before
publishing to the stable update channel.

See [docs/RELEASE.md](docs/RELEASE.md) for release setup and required GitHub
secrets.

## License

Code is licensed under the [Apache License 2.0](LICENSE).

The puppyone name, logo, icons, and other brand assets are not granted under
the Apache License. See [TRADEMARK.md](TRADEMARK.md).
