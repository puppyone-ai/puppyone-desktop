# OpenCode update and rollback runbook

> Scope: this runbook governs the managed OpenCode kernel embedded behind the
> `PuppyOne Agent` backend. It does not govern Codex, Claude Code, Cursor,
> user-managed OpenCode or any other native Agent backend. Product-wide routing
> and backend isolation are defined by
> [ADR-005](ADR-005-multi-native-agent-backends.md).

1. Choose an immutable OpenCode release tag and its exact release commit.
2. Check out the proposed source and run the source capability audit.
3. Check out the exact release commit separately from any later architecture
   audit checkout. Compare server routes, global events, permission/question
   schemas and session migration; recompute every prompt hash from the release
   commit used by the executable.
4. Update `runtime-manifest.json`, `opencode-manifest.mjs` and
   `PROMPT_MANIFEST.json` in one review.
5. Download artifacts in release CI and verify upstream filename, byte size and
   digest before extraction.
6. Run `npm run stage:opencode-runtime -- /absolute/archive/path`. It keeps the
   old executable in the `previous` slot only after its existing executable
   hash still matches its verification record, then atomically replaces current.
7. Run provenance, runtime contract, recorded-event, security, 2,000-row,
   Electron smoke, signed package and offline tests.
8. `npm run check:opencode-release` must pass immediately before packaging.
   It rechecks release metadata, executable SHA-256 and the live `--version`.
9. Roll out through the normal PuppyOne application channel. Never let the
   sidecar self-update.

The Desktop internal-build workflow performs step 6 automatically: it selects
the archive for the runner's native architecture from the checked manifest,
downloads only that immutable release asset, then relies on the staging script
to reject a filename, size, digest or executable-version mismatch.

Rollback order:

```text
PuppyOne Agent current slot fails integrity before spawn
  -> discovery skips it
  -> previous verified slot
  -> disable PuppyOne Agent with scoped diagnostics

Other ready native Agent backends remain selectable throughout this flow.
```

Never reinterpret a PuppyOne Agent session as a Codex, Claude Code, Cursor or
user-OpenCode session. A session is pinned to one backend, so failover is only
between verified managed OpenCode slots inside PuppyOne Agent. Provider and
model availability for that backend is evaluated only after its verified kernel
is running; readiness for other backends is evaluated independently.

For a behavior regression after successful spawn, roll back the PuppyOne app
release. Old request IDs and secrets are invalid after every restart. Never
reuse a permission/question response across versions.
