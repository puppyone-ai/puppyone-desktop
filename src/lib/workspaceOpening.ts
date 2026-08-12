import type { WorkspaceOpenResult } from "../types/electron";
import {
  openDroppedWorkspaceInCurrentWindow as openDroppedWorkspaceInCurrentWindowBridge,
  openWorkspaceInCurrentWindow as openWorkspaceInCurrentWindowBridge,
  openWorkspaceInNewWindow as openWorkspaceInNewWindowBridge,
  selectWorkspaceFolder as selectWorkspaceFolderBridge,
  selectWorkspaceFolderInNewWindow as selectWorkspaceFolderInNewWindowBridge,
} from "./localFiles";

export type WorkspaceOpenPlacement = "current-window" | "dedicated-window";

export type WorkspaceOpenTarget = {
  kind: "local";
  path: string;
  placement?: WorkspaceOpenPlacement;
};

export async function openWorkspaceTarget(target: WorkspaceOpenTarget): Promise<WorkspaceOpenResult> {
  if (target.placement === "current-window") {
    return openWorkspaceInCurrentWindowBridge(target.path);
  }

  return openWorkspaceInNewWindowBridge(target.path);
}

export async function openDroppedWorkspaceTarget(folder: File): Promise<WorkspaceOpenResult> {
  return openDroppedWorkspaceInCurrentWindowBridge(folder);
}

export async function selectLocalWorkspaceFolder({
  placement = "current-window",
}: {
  placement?: WorkspaceOpenPlacement;
} = {}): Promise<WorkspaceOpenResult | null> {
  return placement === "dedicated-window"
    ? selectWorkspaceFolderInNewWindowBridge()
    : selectWorkspaceFolderBridge();
}
