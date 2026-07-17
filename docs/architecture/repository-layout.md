# Desktop Repository Layout

**Status:** Active architecture contract.

The repository separates product features, reusable first-party packages,
platform authority, and pinned third-party sources by ownership:

```text
src/                    Renderer application and product features
  features/<domain>/    Domain-owned UI, state, and application logic
  components/           Cross-feature application-shell components only
  lib/                  Small renderer-facing platform facades
packages/               Editable first-party packages
  shared-ui/            Process-neutral data workspace and editor UI
electron/main/          Electron authority, IPC, credentials, and native services
local-api/              Process-neutral local workspace and Git operations
shared/                 Versioned cross-process contracts
tests/                  Automated tests and safe fixtures
vendor/                 Pinned third-party source/runtime payloads only
```

Rules:

1. Product features expose a public `index.ts`; other domains consume that
   public surface rather than deep-importing implementation files.
2. Renderer code imports Shared UI through `@puppyone/shared-ui`. Direct
   `packages/shared-ui/src` imports are reserved for its own tests and build
   tooling.
3. First-party packages participate in lint, TypeScript, tests, and boundary
   checks. The `vendor/` tree is not a home for editable PuppyOne code.
4. Electron and local API modules own authority and side effects. Renderer
   features use typed ports or preload bridges and never import Electron main.
5. Test assets live below `tests/fixtures/`; temporary audit scripts become
   named scripts or are removed before merge.

`scripts/check-repository-layout.mjs` enforces the structural rules that can be
checked mechanically and runs as part of `npm run check:boundaries`.
