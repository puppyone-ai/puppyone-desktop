# Smooth Preview Transitions

## Problem

The desktop file preview used to flash a blank or white frame during file
switches. The visible sequence was:

1. The sidebar selection changed immediately.
2. The previous editor was unmounted.
3. The next file content was loaded asynchronously through the Electron bridge.
4. A new editor host was committed before the editor instance was ready.
5. CodeMirror or the viewer mounted on a later effect pass.

This made page switching feel unstable, especially for Markdown documents where
CodeMirror owns a large DOM subtree.

The root cause was not route-level lazy loading. It was a lifecycle boundary
problem: selection state, content loading state, and editor instance state were
coupled too tightly.

## Design Goal

File switching must feel continuous. The main preview area should never expose an
empty editor host simply because a new selection is pending. The UI may show a
loading state, but it must be deliberate, background-matched, and tied to a
document lifecycle.

## Final Architecture

The desktop preview path uses three separate concepts:

- Selection intent: the file currently selected in the sidebar.
- Loaded source: the latest text content or resource URL known for a path.
- Committed preview document: the document currently safe to render in the main
  editor surface.

When a user selects a new file, the sidebar selection may update immediately, but
the main editor only switches to that file when the file has enough data to
render. If the selected file is still pending and a previous document is already
committed, the main editor keeps rendering the previous committed document.

This avoids the unstable state where React switches to a new document path before
the document content and editor instance are ready.

## Implementation Rules

1. Do not let selection state directly unmount the editor.

   `activePath` is an input signal, not proof that the editor can render the
   selected document. The render path must go through a committed preview state.

2. Keep a content cache by file path.

   Once a file has been read, switching back to it should use cached content
   immediately while the system refreshes in the background.

3. Treat resource acquisition as preview readiness.

   A resource-only viewer must be pending from the first selection render, not
   one passive-effect turn later. If another document is already committed, it
   remains mounted until the selected resource URL resolves or fails. Explorer
   preview text and metadata are never valid substitutes for a declared
   resource URL.

4. Do not use `key={document.path}` to reset text editors.

   Forced remounts create blank-frame windows and discard editor state too
   aggressively. Text editors receive an explicit `documentId` and reset their
   local draft/session attachment state in layout phase.

5. Initialize DOM-owned editors before paint.

   CodeMirror setup and content reconfiguration must run in `useLayoutEffect`
   so the browser does not paint an empty host before the editor DOM is attached.

6. Reveal decoded media, not a raw browser element.

   An image element remains visually hidden behind a neutral,
   background-matched loading surface until its current URL has loaded and
   decoded. The loading surface exposes no transient filename or "Loading
   image" text. This prevents browser alt text, raw Markdown, or a broken-image
   frame from becoming visible between URL acquisition and the first image
   paint.

7. Reuse embedded media by semantic identity, not absolute source position.

   An edit before `![alt](src)` moves that token's CodeMirror offsets without
   changing the image. The decoration range maps through the transaction, while
   the image Widget compares document/source/alt/title and source length. Its
   event handlers resolve the current mapped range from the mounted DOM. The
   mounted Widget session owns the asset lease until the image source is
   replaced or the view is disposed; an unrelated document revision must not
   revoke and re-resolve it.

8. Bind the Document Session to the rendered document, not the selected document.

   During a pending selection, the main area may still render the previous
   committed document. The session and its persistence acknowledgement must
   remain bound to the document currently rendered, not whichever file is
   highlighted in the sidebar.

9. Scope errors by document path.

   A read error from one path must not leak into another path during rapid file
   switching.

## Current Code Boundaries

- `packages/shared-ui/src/data/DataWorkspace.tsx`
  - owns selected file resolution
  - owns file content cache
  - owns committed preview document state
  - binds persistence acknowledgement to the rendered document

- `packages/shared-ui/src/data/FilePreview.tsx`
  - renders the current preview shell
  - avoids fallback preview content while full content is pending

- `packages/shared-ui/src/editor/viewers/TextEditorFrame.tsx`
  - owns text editor draft, mode state, and editor snapshot attachment
  - resets by `documentId` without forcing a React remount

- `packages/shared-ui/src/editor/viewers/ResourceViewers.tsx`
  - owns resource-specific loading and failure presentation
  - reveals images only after the current resource has loaded and decoded

- `packages/shared-ui/src/editor/markdown/features/image/imagePreviewWidget.ts`
  - keeps brokered Markdown-image placeholders mounted through load/decode
  - keys DOM reuse by semantic image identity rather than absolute offsets
  - keeps single-click interaction DOM-focused; maps the current CodeMirror
    source range only for explicit expand/delete operations
  - owns one asset lease for the lifetime of the mounted image session

- `packages/shared-ui/src/editor/document-session/DocumentEditingSession.ts`
  - owns the thin dirty/save lifecycle, version state, and serialized writes
  - flushes the exact rendered document before destructive navigation; destroy
    cleanup is emergency-only

- `packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor.tsx`
  - owns the CodeMirror `EditorView`
  - mounts and reconfigures in layout phase
  - updates content through CodeMirror transactions

These files live in `packages/shared-ui` — the canonical copy in this standalone
repo (ISSUE-021). Edit them in place; there is no upstream to sync from.

## Verification

For this feature, the minimum verification is:

```bash
npm run check:shared-ui
npm run build
```

Manual verification should cover:

- rapidly switching between Markdown files
- switching between files already visited and files not yet cached
- switching while a file is autosaving
- switching to a file that fails to read
- switching between Markdown, plain text, JSON, CSV, image, PDF, and HTML

## Invariants

These invariants should remain true after future changes:

- A selected sidebar row does not guarantee that the main editor has switched.
- The main editor always renders a committed document or a deliberate empty state.
- Text content and resource URLs both participate in preview commitment.
- Explorer metadata is never mounted as an image URL.
- A newly mounted image is not visible until its current source is ready.
- Image loading surfaces never expose transient source text or filenames.
- An unrelated source edit does not remount a semantically unchanged embedded
  image, repeat its asset resolution, or revoke its mounted asset lease.
- No viewer should show an unstyled browser-white fallback during normal
  transitions.
- Text editors reset by document identity, not by React subtree destruction.
- Session persistence must never write old document content to a newly selected path.

The authoritative persistence and plugin boundary is documented in
[`document-editing-persistence.md`](./document-editing-persistence.md).
