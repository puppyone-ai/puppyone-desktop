# Local Workspace API architecture

`local-api/workspace.mjs` remains the stable compatibility surface consumed by Electron IPC and existing tests. It coordinates filesystem and Git workflows, but focused policies must live behind explicit domain modules:

- `local-api/files/path-policy.mjs` owns relative-path normalization, canonical-path resolution, and symlink escape prevention.
- `local-api/files/file-format-policy.mjs` owns MIME resolution, semantic file classification, preview eligibility, and compound-extension copy naming. It consumes the canonical registry in `packages/shared-ui`.
- `local-api/workspace-config.mjs` owns `.puppyone/config.json` validation and atomic persistence.
- `local-api/git/source-control-model.mjs` maps porcelain status data into renderer-neutral source-control groups and actions.
- `local-api/git/runner.mjs`, `porcelain-v2.mjs`, `revision-pair.mjs`, and `revision-specs.mjs` continue to own Git execution and parsing concerns.

The facade re-exports its historical public functions, so Electron callers do not need a coordinated migration. New behavior should be implemented in the narrowest owning module and composed by the facade.

`npm run check:boundaries` enforces the module ownership rules, dependency direction, focused-module size budgets, and a 3,400-line ceiling for the compatibility facade. The ceiling is a ratchet against renewed growth, not a target for new code.
