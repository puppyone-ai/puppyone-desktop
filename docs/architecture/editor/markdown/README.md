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

## Architecture diagram guide

All durable diagrams use plain text so they remain readable in terminals,
diffs, code review, and Markdown renderers without diagram support:

1. [Editor system boundary](../README.md#system-boundary)
   - Explorer selection, file-format routing, acquisition, and viewer choice.
2. [End-to-end Markdown data flow](architecture.md#1-decision-summary)
   - Source, parser, semantic model, policy, plan, and output adapters.
3. [Source layout and feature composition](architecture.md#37-source-layout-and-feature-composition)
   - Physical `core/`, `features/`, `platform/`, and `shared/` ownership.
4. [Dependency direction](architecture.md#38-dependency-direction-current-state-and-target)
   - Why Core/Feature is currently bidirectional at folder level and the
     intended one-way Kernel/Composition structure.
5. [Type constraints](architecture.md#39-type-constraints-and-impossible-states)
   - Current optional union data versus a fully discriminated semantic model.
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

## Document lifecycle

- `architecture.md` is the adopted target technical contract and is implemented
  for the architecture migration: render plans, broad-safe profiles, embed host
  / widget sessions, brokers, safe-trust default, preview convergence, and
  Electron web-embed wiring. Sections 12 and 13 record the completed phases.
- Part 1 of `live-preview-ux.md` is the durable UX contract.
- Part 2 of `live-preview-ux.md` records the previous live-preview migration.
  It is retained during this reorganization so directory cleanup does not
  delete implementation history. It should be archived or removed in a
  separate review once its remaining information has been reconciled with
  `architecture.md` and current code.

Do not add a third document that mixes product behavior and technical design.
Temporary implementation checklists should be clearly marked and removed or
archived after the corresponding migration stabilizes.
