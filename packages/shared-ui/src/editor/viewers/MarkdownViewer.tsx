"use client";

import { MarkdownCodeMirrorEditor } from "../markdown";
import type { PresetViewerRenderContext } from "../viewerTypes";
import { TextEditorFrame } from "./TextEditorFrame";

type MarkdownViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "content"
  | "canEdit"
  | "onSaveContent"
  | "hideSourceView"
  | "saveMode"
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
      content={context.content}
      nodeName={context.document.name}
      defaultMode="live"
      canEdit={context.canEdit}
      onSaveContent={context.onSaveContent}
      hideSourceView={context.hideSourceView}
      saveMode={context.saveMode}
      sourceSnapshotMode
      renderLive={(value, controls) => (
        <MarkdownCodeMirrorEditor
          value={value}
          readOnly={!controls.canEdit}
          livePreview
          aiEditFile={context.aiEditFile}
          htmlTrustMode={context.htmlTrustMode}
          documentPath={context.document.path}
          workspaceId={context.workspaceId}
          workspaceRoot={context.workspaceRoot}
          markdownLinkGraph={context.markdownLinkGraph}
          markdownAssetUrlResolver={context.markdownAssetUrlResolver}
          onSourceRevisionChange={controls.onSourceRevisionChange}
          onSnapshotPortChange={controls.onSnapshotPortChange}
          onBeforeDestroy={controls.onBeforeDestroy}
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
          onBeforeDestroy={controls.onBeforeDestroy}
        />
      )}
    />
  );
}

export function canEditMarkdown() {
  return true;
}
