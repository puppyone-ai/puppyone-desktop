# Archived Desktop Cloud catalog

Status: **Retired from the Desktop runtime on 2026-07-19**

This directory preserves the former account-wide Cloud Project catalog,
Template Store, Cloud-only workspace, and related frontend code for historical
reference. It is intentionally outside `src/` so it is not type-checked,
bundled, routed, or imported by PuppyOne Desktop.

The active Desktop Cloud experience is scoped exclusively to the currently
open local Git repository. Do not import files from this archive. Reintroducing
any capability requires a new product decision and a fresh implementation;
this snapshot is not a compatibility layer.

Archived areas include:

- Project catalog and preview cards;
- Cloud Template Store and project creation dialog;
- homepage Cloud Project creation/opening controller;
- `cloud://` virtual workspace data and switching UI; and
- tests that existed solely for those retired surfaces.

