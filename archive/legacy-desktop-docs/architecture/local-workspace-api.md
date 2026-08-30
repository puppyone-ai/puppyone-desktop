# Local Workspace API architecture

`local-api/workspace.mjs` remains the stable compatibility surface consumed by Electron IPC and existing tests. It coordinates filesystem and Git workflows, but focused policies must live behind explicit domain modules:

- `local-api/files/path-policy.mjs` owns relative-path normalization, canonical-path resolution, and symlink escape prevention.
- `local-api/files/file-format-policy.mjs` owns MIME resolution, semantic file classification, preview eligibility, and compound-extension copy naming. It consumes the canonical registry in `packages/shared-ui`.
- `local-api/workspace-config.mjs` owns `.puppyone/config.json` validation and atomic persistence.
- `local-api/git/source-control-model.mjs` maps porcelain status data into renderer-neutral source-control groups and actions.
- `local-api/git/cloud-remote.mjs` owns validated Cloud remote creation, update, and removal orchestration.
- `local-api/git/runner.mjs`, `porcelain-v2.mjs`, `revision-pair.mjs`, and `revision-specs.mjs` continue to own Git execution and parsing concerns.

The facade re-exports its historical public functions, so Electron callers do not need a coordinated migration. New behavior should be implemented in the narrowest owning module and composed by the facade.

The historical `(rootPath, relativePath)` functions are an internal local
provider compatibility surface, not the target Renderer identity contract.
[Desktop Multi-Root Workspace Kernel](desktop-multi-root-workspace-kernel.md)
defines the Resource URI and Folder capability boundary. New Renderer APIs must
not expand raw root-path authority; the migration direction is
`FileService -> FileSystemProvider -> local-api`.

`npm run check:boundaries` enforces module ownership, dependency direction, and the compatibility facade's delegation contract. File length is not used as an architecture boundary; cohesion and ownership are checked directly instead.
