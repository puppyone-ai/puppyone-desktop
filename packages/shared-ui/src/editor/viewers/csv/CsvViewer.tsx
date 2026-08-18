import { CsvTableEditor } from "./CsvTableEditor";
import type { PresetViewerRenderContext } from "../../registry/viewerTypes";
import { TextEditorFrame } from "../shared/TextEditorFrame";
import { getDelimitedTableDelimiter } from "../shared/viewerUtils";

type CsvViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "content"
  | "canEdit"
  | "hideSourceView"
>;

export function CsvViewer(context: CsvViewerProps) {
  return (
    <TextEditorFrame
      documentId={context.document.path}
      documentVersion={context.document.version}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="live"
      canEdit={context.canEdit}
      hideSourceView={context.hideSourceView}
      liveScrollOwner="viewer"
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
