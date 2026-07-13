import {
  VirtualSidebarList,
  shouldVirtualizeSidebarList,
  type FileIconThemeId,
} from "@puppyone/shared-ui";
import type { GitSourceControlResource } from "../../../types/electron";
import { Fragment } from "react";
import { SourceControlWorkingTreeRow } from "../components";
import type { GitWorkingSelection } from "../types";

const WORKING_TREE_VIRTUAL_ROW_SIZE = 32;

export function SourceControlWorkingResourceList({
  resources,
  selectedWorkingFile,
  operationLoading,
  fileIconTheme,
  onSelectWorkingFile,
  onStagePaths,
  onUnstagePaths,
  onDiscardPaths,
}: {
  resources: readonly GitSourceControlResource[];
  selectedWorkingFile: GitWorkingSelection | null;
  operationLoading: string | null;
  fileIconTheme: FileIconThemeId;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onStagePaths: (paths: string[]) => Promise<boolean>;
  onUnstagePaths: (paths: string[]) => Promise<boolean>;
  onDiscardPaths: (paths: string[]) => Promise<boolean>;
}) {
  const renderResource = (resource: GitSourceControlResource) => (
    <SourceControlWorkingTreeRow
      resource={resource}
      selected={selectedWorkingFile?.staged === (resource.group === "index")
        && selectedWorkingFile.path === resource.path}
      operationLoading={operationLoading}
      fileIconTheme={fileIconTheme}
      onSelect={onSelectWorkingFile}
      onStagePaths={onStagePaths}
      onUnstagePaths={onUnstagePaths}
      onDiscardPaths={onDiscardPaths}
    />
  );

  if (shouldVirtualizeSidebarList(resources.length)) {
    return (
      <VirtualSidebarList
        className="desktop-working-tree-list desktop-working-tree-virtual-list"
        items={resources}
        rowSize={WORKING_TREE_VIRTUAL_ROW_SIZE}
        getKey={(resource) => resource.id}
        renderRow={renderResource}
      />
    );
  }

  return (
    <div className="desktop-working-tree-list">
      {resources.map((resource) => (
        <Fragment key={resource.id}>{renderResource(resource)}</Fragment>
      ))}
    </div>
  );
}
