# Desktop UI provenance

Despite this historical filename, this directory is not generated. It is the
Desktop-owned UI tree and is maintained independently from PuppyOne Cloud.
There is no cross-repository sync or drift contract. Edit files here directly.

> Historical note (ISSUE-021): earlier docs instructed running
> `node scripts/sync-desktop-shared-ui.mjs` to regenerate this directory from
> `frontend/shared-ui`. That script and that upstream never existed in this
> repo, so the instruction was inert. If a shared package is later introduced
> (e.g. an `@puppyone/shared-ui` npm package or a workspace), replace this file
> with the real provenance and sync/verify tooling.

Run `npm run check:ui-boundaries` to verify Desktop import boundaries.
