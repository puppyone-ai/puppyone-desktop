# Markdown Editor

This directory is the architecture home for PuppyOne's Markdown editor
subsystem.

## Decision

PuppyOne uses a Markdown-source-first live-preview architecture. The Markdown
source held by CodeMirror is the only canonical, committed, and persisted
document model. Syntax trees, semantic elements, safe render plans,
decorations, widgets, previews, links, and indexes are derived views of that
source; embedded drafts are editor-scoped, ephemeral interaction state.

The adopted target makes ordinary Markdown use an Obsidian-style broad
sanitized HTML profile by default. Common non-executable tags, styles,
structure, and workspace-scoped assets will not require a trust prompt.
External web embeds and local executable HTML are separate capability paths;
local filesystem location alone never authorizes scripts or application
access. Sections 12 and 13 of `architecture.md` distinguish this target from
the current narrower implementation.

## Authoritative documents

Read these documents in this order:

1. [Markdown Editor Architecture](architecture.md)
   - Technical source of truth for parser, semantic model, policy, renderer,
     interaction, security, performance, and feature-completeness boundaries.
2. [Markdown Live Preview Editing UX](live-preview-ux.md)
   - Product source of truth for rendered-first behavior, syntax reveal,
     composing and commit, caret and selection semantics, and element-specific
     editing behavior.

The architecture document answers **how the system is structured**. The UX
document answers **what the user experiences**. Neither document may redefine
the other's contract; cross-layer changes must update both when necessary.

## Related architecture

- [File Format and Viewer Pipeline](../file-format-viewer-pipeline.md) owns
  routing Markdown files into the viewer and editor.
- [Viewer Plugin Architecture](../viewer-plugin-architecture.md) owns the
  reserved application-level viewer plugin boundary. Markdown feature bundles
  are an internal completeness discipline and are not automatically external
  viewer plugins.
- [Smooth Preview Transitions](../smooth-preview-transitions.md) owns file
  selection, committed preview documents, and editor mount lifecycle.

## Document lifecycle

- `architecture.md` is the adopted target technical contract. Its Markdown
  source, parser, and inline HTML foundations are implemented. Compiled render
  plan convergence and trust hardening are active engineering work; the
  per-editor embedded host is planned next. Sections 12 and 13 track the current
  state and migration phases.
- Part 1 of `live-preview-ux.md` is the durable UX contract.
- Part 2 of `live-preview-ux.md` records the previous live-preview migration.
  It is retained during this reorganization so directory cleanup does not
  delete implementation history. It should be archived or removed in a
  separate review once its remaining information has been reconciled with
  `architecture.md` and current code.

Do not add a third document that mixes product behavior and technical design.
Temporary implementation checklists should be clearly marked and removed or
archived after the corresponding migration stabilizes.
