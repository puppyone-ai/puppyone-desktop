import { CsvTableEditor } from "../CsvTableEditor";
import type { PresetViewerRenderContext } from "../viewerTypes";
import { TextEditorFrame } from "./TextEditorFrame";
import { getDelimitedTableDelimiter, isTextEditable } from "./viewerUtils";

type CsvViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "content"
  | "canEdit"
  | "onSaveContent"
  | "hideSourceView"
  | "saveMode"
>;

export function CsvViewer(context: CsvViewerProps) {
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
      renderLive={(value, controls) => (
        <CsvTableEditor
          documentId={context.document.path}
          content={value}
          nodeName={context.document.name}
          delimiter={getDelimitedTableDelimiter(context.document)}
          readOnly={!controls.canEdit}
          onChange={controls.canEdit ? controls.onChange : undefined}
        />
      )}
    />
  );
}

export function canEditCsv(context: Pick<PresetViewerRenderContext, "document" | "content">): boolean {
  return isTextEditable(context.document, context.content);
}
