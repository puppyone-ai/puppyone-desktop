import { memo, useCallback } from "react";
import {
  EditorFindContributionProvider,
  EditorPaneMenuContributionProvider,
  type EditorFindCommand,
  type EditorPaneMenuContribution,
} from "@puppyone/shared-ui";
import {
  areEditorPaneDocumentRuntimePropsEqual,
  EditorPaneDocumentRuntime,
  type EditorPaneDocumentRuntimeProps,
} from "./EditorPaneDocumentRuntime";

export type EditorPaneRuntimeProps = EditorPaneDocumentRuntimeProps & Readonly<{
  onFindCommandChange: (command: EditorFindCommand | null) => void;
  onMenuContributionChange: (contribution: EditorPaneMenuContribution | null) => void;
}>;

/** Captures Viewer contributions inside the pane that owns the document while
 * the nested document runtime remains stable across focus and pane chrome. */
export const EditorPaneRuntime = memo(function EditorPaneRuntime({
  onFindCommandChange,
  onMenuContributionChange,
  ...documentProps
}: EditorPaneRuntimeProps) {
  const publishMenuContribution = useCallback(
    (contribution: EditorPaneMenuContribution | null) => onMenuContributionChange(contribution),
    [onMenuContributionChange],
  );

  return (
    <EditorPaneMenuContributionProvider onContributionChange={publishMenuContribution}>
      <EditorFindContributionProvider onCommandChange={onFindCommandChange}>
        <EditorPaneDocumentRuntime {...documentProps} />
      </EditorFindContributionProvider>
    </EditorPaneMenuContributionProvider>
  );
}, (previous, next) => (
  previous.onFindCommandChange === next.onFindCommandChange
  && previous.onMenuContributionChange === next.onMenuContributionChange
  && areEditorPaneDocumentRuntimePropsEqual(previous, next)
));
