# Release staging directory

OpenCode binaries are intentionally not committed. Release CI runs
`npm run stage:opencode-runtime -- /absolute/path/to/upstream-archive`, which
verifies the immutable release archive against `runtime-manifest.json`, extracts
the executable into this directory, verifies `opencode --version`, and lets
electron-builder copy it into `resources/opencode/bin`.

