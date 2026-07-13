import { TextEditorFrame } from "./TextEditorFrame";
import { CodeMirrorCodeEditor } from "../CodeMirrorCodeEditor";
import { isTextEditable } from "./viewerUtils";
import type { PresetViewerRenderContext } from "../viewerTypes";

type CodeViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "format"
  | "content"
  | "canEdit"
  | "documentSession"
  | "hideSourceView"
  | "saveMode"
>;

export function JsonViewer(context: CodeViewerProps) {
  const language = context.format.monacoLanguage ?? "json";
  return (
    <TextEditorFrame
      documentId={context.document.path}
      documentVersion={context.document.version}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="source"
      canEdit={context.canEdit}
      documentSession={context.documentSession}
      hideSourceView={context.hideSourceView}
      saveMode={context.saveMode}
      renderLive={(value, controls) => (
        <CodeMirrorCodeEditor
          content={value}
          nodeName={context.document.name}
          language={language}
          readOnly={!controls.canEdit}
          onChange={controls.canEdit ? controls.onChange : undefined}
        />
      )}
      renderSource={(value, controls) => (
        <CodeMirrorCodeEditor
          content={value}
          nodeName={context.document.name}
          language={language}
          readOnly={!controls.canEdit}
          onChange={controls.canEdit ? controls.onChange : undefined}
        />
      )}
    />
  );
}

export function TextFileViewer(context: CodeViewerProps) {
  const language = context.format.monacoLanguage ?? null;
  return (
    <TextEditorFrame
      documentId={context.document.path}
      documentVersion={context.document.version}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="source"
      canEdit={context.canEdit}
      documentSession={context.documentSession}
      hideSourceView={context.hideSourceView}
      saveMode={context.saveMode}
      renderLive={(value, controls) => (
        <CodeMirrorCodeEditor
          content={value}
          nodeName={context.document.name}
          language={language}
          readOnly={!controls.canEdit}
          onChange={controls.canEdit ? controls.onChange : undefined}
        />
      )}
      renderSource={(value, controls) => (
        <CodeMirrorCodeEditor
          content={value}
          nodeName={context.document.name}
          language={language}
          readOnly={!controls.canEdit}
          onChange={controls.canEdit ? controls.onChange : undefined}
        />
      )}
    />
  );
}

export function canEditTextFile(context: Pick<PresetViewerRenderContext, "document" | "content">): boolean {
  return isTextEditable(context.document, context.content);
}
