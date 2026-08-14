import { memo, useCallback } from "react";
import {
  EditorChromeContributionProvider,
  EditorFindContributionProvider,
  useEditorChromeContributionPublisher,
} from "@puppyone/shared-ui";
import {
  areEditorPaneDocumentRuntimePropsEqual,
  EditorPaneDocumentRuntime,
  type EditorPaneDocumentRuntimeProps,
} from "./EditorPaneDocumentRuntime";

export type EditorPaneRuntimeProps = EditorPaneDocumentRuntimeProps & Readonly<{
  active: boolean;
}>;

/** Routes active-pane contributions while the nested document runtime remains
 * stable across focus, menu, drag-preview, and split-preview changes. */
export const EditorPaneRuntime = memo(function EditorPaneRuntime({
  active,
  ...documentProps
}: EditorPaneRuntimeProps) {
  const upstreamChromePublisher = useEditorChromeContributionPublisher();
  const publishChromeContribution = useCallback(
    (contribution: Parameters<NonNullable<typeof upstreamChromePublisher>>[0]) => {
      if (active) upstreamChromePublisher?.(contribution);
    },
    [active, upstreamChromePublisher],
  );

  return (
    <EditorChromeContributionProvider onContributionChange={publishChromeContribution}>
      <EditorFindContributionProvider active={active}>
        <EditorPaneDocumentRuntime {...documentProps} />
      </EditorFindContributionProvider>
    </EditorChromeContributionProvider>
  );
}, (previous, next) => (
  previous.active === next.active
  && areEditorPaneDocumentRuntimePropsEqual(previous, next)
));
