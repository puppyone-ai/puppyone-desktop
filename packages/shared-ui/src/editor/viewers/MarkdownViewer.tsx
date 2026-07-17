"use client";

import { MarkdownCodeMirrorEditor } from "../markdown";
import type { PresetViewerRenderContext } from "../viewerTypes";
import { TextEditorFrame } from "./TextEditorFrame";

type MarkdownViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "content"
  | "canEdit"
  | "hideSourceView"
  | "editorInteractionPreferences"
  | "aiEditFile"
  | "htmlTrustMode"
  | "workspaceId"
  | "workspaceRoot"
  | "markdownLinkGraph"
  | "markdownAssetUrlResolver"
>;

export function MarkdownViewer(context: MarkdownViewerProps) {
  return (
    <TextEditorFrame
      documentId={context.document.path}
      documentVersion={context.document.version}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="live"
      canEdit={context.canEdit}
      hideSourceView={context.hideSourceView}
      sourceSnapshotMode
      renderLive={(value, controls) => (
        <MarkdownCodeMirrorEditor
          value={value}
          readOnly={!controls.canEdit}
          livePreview
          blockDragEnabled={context.editorInteractionPreferences.markdownBlockDragEnabled}
          aiEditFile={context.aiEditFile}
          htmlTrustMode={context.htmlTrustMode}
          documentPath={context.document.path}
          workspaceId={context.workspaceId}
          workspaceRoot={context.workspaceRoot}
          markdownLinkGraph={context.markdownLinkGraph}
          markdownAssetUrlResolver={context.markdownAssetUrlResolver}
          onSourceRevisionChange={controls.onSourceRevisionChange}
          onSnapshotPortChange={controls.onSnapshotPortChange}
        />
      )}
      renderSource={(value, controls) => (
        <MarkdownCodeMirrorEditor
          value={value}
          readOnly={!controls.canEdit}
          livePreview={false}
          aiEditFile={context.aiEditFile}
          htmlTrustMode={context.htmlTrustMode}
          documentPath={context.document.path}
          workspaceId={context.workspaceId}
          workspaceRoot={context.workspaceRoot}
          markdownLinkGraph={context.markdownLinkGraph}
          markdownAssetUrlResolver={context.markdownAssetUrlResolver}
          onSourceRevisionChange={controls.onSourceRevisionChange}
          onSnapshotPortChange={controls.onSnapshotPortChange}
        />
      )}
    />
  );
}

export function canEditMarkdown() {
  return true;
}
