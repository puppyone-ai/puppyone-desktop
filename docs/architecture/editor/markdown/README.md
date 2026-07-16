# Markdown Editor

This directory is the architecture home for PuppyOne's Markdown editor
subsystem.

## Decision

PuppyOne uses a Markdown-source-first live-preview architecture. The Markdown
source held by CodeMirror is the only canonical, committed, and persisted
document model. Syntax trees, semantic elements, safe render plans,
decorations, widgets, previews, links, and indexes are derived views of that
source; embedded drafts are editor-scoped, ephemeral interaction state.

The adopted architecture makes ordinary Markdown use an Obsidian-style broad
sanitized HTML profile by default. Common non-executable tags, styles,
structure, and workspace-scoped assets do not require a trust prompt.
External web embeds and local executable HTML are separate capability paths;
local filesystem location alone never authorizes scripts or application
access. Sections 12–14 of `architecture.md` record implementation status and
the remaining acceptance gaps without weakening this contract.

Markdown participates in the same small editable-contribution contract as
other single-file editors. CodeMirror owns the canonical in-memory source,
reports a changed revision, and exposes an exact `readSnapshot()` result. The
shared `DocumentEditingSession` owns save status, write serialization, and
flush-before-navigation. Markdown does not implement filesystem, Cloud, or
window-close behavior.

## Authoritative documents

Read these documents in this order:

1. [Markdown Editor Architecture](architecture.md)
   - Technical source of truth for parser, semantic model, policy, renderer,
     interaction, security, performance, and feature-completeness boundaries.
2. [Markdown Live Preview Editing UX](live-preview-ux.md)
   - Product source of truth for rendered-first behavior, syntax reveal,
     composing and commit, caret and selection semantics, and element-specific
     editing behavior.
3. [Document Editing and Persistence](../document-editing-persistence.md)
   - Persistence source of truth for the thin revision/snapshot adapter,
     shared save lifecycle, navigation/close flush, and external-change
     conflict behavior.

The architecture document answers **how the Markdown system is structured**.
The UX document answers **what the user experiences**. The persistence
document answers **when an edited revision becomes durable**. None may
redefine another's contract; cross-layer changes must update every affected
document.

## Architecture diagram guide

All durable diagrams use plain text so they remain readable in terminals,
diffs, code review, and Markdown renderers without diagram support:

1. [Editor system boundary](../README.md#system-boundary)
   - Explorer selection, file-format routing, acquisition, and viewer choice.
2. [End-to-end Markdown data flow](architecture.md#1-decision-summary)
   - Source, parser, semantic model, policy, plan, and output adapters.
3. [Source layout and feature composition](architecture.md#37-source-layout-and-feature-composition)
   - Physical `composition/`, `core/`, `features/`, `platform/`, and `shared/`
     ownership with one immutable built-in Feature Composition.
4. [Dependency direction](architecture.md#38-dependency-direction--adopted)
   - The enforced one-way Core/Feature/Composition ownership and injected
     compatibility ports.
5. [Type constraints](architecture.md#39-type-constraints-and-impossible-states)
   - The shipped discriminated semantic and render-plan unions.
6. [Transaction and widget lifecycle](architecture.md#310-transaction-and-widget-lifecycle)
   - Atomic commands, DOM rebuild, focus coordination, and resource ownership.

## Related architecture

- [File Format and Viewer Pipeline](../file-format-viewer-pipeline.md) owns
  routing Markdown files into the viewer and editor.
- [Viewer Plugin Architecture](../viewer-plugin-architecture.md) owns the
  reserved application-level viewer plugin boundary. Markdown feature bundles
  are an internal completeness discipline and are not automatically external
  viewer plugins.
- [Smooth Preview Transitions](../smooth-preview-transitions.md) owns file
  selection, committed preview documents, and editor mount lifecycle.
- [Document Editing and Persistence](../document-editing-persistence.md) owns
  Session lifetime, acknowledgement, navigation gating, and persistence
  failures. React cleanup is never the primary save transaction.

## Document lifecycle

- `architecture.md` is the adopted technical contract. The main document plan,
  Feature Composition, embed lifecycle, policy, and persistence boundary are
  implemented; §12 records the bounded table-cell adapter and browser-backed
  acceptance work that remains.
- Part 1 of `live-preview-ux.md` is the durable UX contract.
- Part 2 of `live-preview-ux.md` records the previous live-preview migration.
  It is retained during this reorganization so directory cleanup does not
  delete implementation history. It should be archived or removed in a
  separate review once its remaining information has been reconciled with
  `architecture.md` and current code.

Do not add a third document that mixes product behavior and technical design.
Temporary implementation checklists should be clearly marked and removed or
archived after the corresponding migration stabilizes.
