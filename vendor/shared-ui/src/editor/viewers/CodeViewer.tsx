import { TextEditorFrame } from "./TextEditorFrame";
import { CodeMirrorCodeEditor } from "../CodeMirrorCodeEditor";
import { isTextEditable } from "./viewerUtils";
import type { EditorViewerContext } from "../viewerTypes";

export function JsonViewer(context: EditorViewerContext) {
  const language = context.format.monacoLanguage ?? "json";
  return (
    <TextEditorFrame
      documentId={context.document.path}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="source"
      canEdit={context.canEdit}
      onSaveContent={context.onSaveContent}
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

export function TextFileViewer(context: EditorViewerContext) {
  const language = context.format.monacoLanguage ?? null;
  return (
    <TextEditorFrame
      documentId={context.document.path}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="source"
      canEdit={context.canEdit}
      onSaveContent={context.onSaveContent}
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

export function canEditTextFile(context: Pick<EditorViewerContext, "document" | "content">): boolean {
  return isTextEditable(context.document, context.content);
}
