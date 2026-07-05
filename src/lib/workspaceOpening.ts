import type { WorkspaceOpenResult } from "../types/electron";
import {
  openCloudProjectInNewWindow as openCloudProjectInNewWindowBridge,
  openWorkspaceInCurrentWindow as openWorkspaceInCurrentWindowBridge,
  openWorkspaceInNewWindow as openWorkspaceInNewWindowBridge,
  selectWorkspaceFolder as selectWorkspaceFolderBridge,
  selectWorkspaceFolderInNewWindow as selectWorkspaceFolderInNewWindowBridge,
} from "./localFiles";

export type WorkspaceOpenPlacement = "current-window" | "dedicated-window";

export type WorkspaceOpenTarget =
  | {
      kind: "local";
      path: string;
      placement?: WorkspaceOpenPlacement;
    }
  | {
      kind: "cloud-project";
      projectId: string;
      name: string;
      placement?: "dedicated-window";
    };

export async function openWorkspaceTarget(target: WorkspaceOpenTarget): Promise<WorkspaceOpenResult> {
  if (target.kind === "cloud-project") {
    if (target.placement && target.placement !== "dedicated-window") {
      throw new Error("Cloud projects can only be opened in a dedicated window.");
    }

    return openCloudProjectInNewWindowBridge({
      projectId: target.projectId,
      name: target.name,
    });
  }

  if (target.placement === "current-window") {
    return openWorkspaceInCurrentWindowBridge(target.path);
  }

  return openWorkspaceInNewWindowBridge(target.path);
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
