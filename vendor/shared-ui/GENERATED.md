# Shared UI (vendored)

This directory is the **canonical copy** of the shared UI used by puppyone
desktop. This is a standalone repository: there is no `frontend/shared-ui`
upstream in this tree to generate from, and no `sync-desktop-shared-ui.mjs`
script exists. Edit files here directly.

> Historical note (ISSUE-021): earlier docs instructed running
> `node scripts/sync-desktop-shared-ui.mjs` to regenerate this directory from
> `frontend/shared-ui`. That script and that upstream never existed in this
> repo, so the instruction was inert. If a shared package is later introduced
> (e.g. an `@puppyone/shared-ui` npm package or a workspace), replace this file
> with the real provenance and sync/verify tooling.

Run `npm run check:shared-ui` to verify the desktop/shared-ui import boundaries.
