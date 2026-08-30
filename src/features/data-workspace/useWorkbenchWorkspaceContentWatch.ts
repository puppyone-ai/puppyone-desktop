import { useEffect } from "react";
import type { WorkspaceFolder } from "@puppyone/shared-ui";

export type WorkbenchWorkspaceContentChanged = (
  paths: readonly string[] | string | null,
  workspaceFolderId: string,
) => void;

type UseWorkbenchWorkspaceContentWatchOptions = Readonly<{
  folders: readonly WorkspaceFolder[];
  onWorkspaceContentChanged: WorkbenchWorkspaceContentChanged;
  onWorkspaceActivity?: (folder: WorkspaceFolder) => void;
}>;

/**
 * Window-level owner for filesystem subscriptions. Editor invalidation must
 * not depend on Git UI lifecycle or on whether a mutation came from Terminal,
 * Native Agent, PuppyOne itself, or another process.
 */
export function useWorkbenchWorkspaceContentWatch({
  folders,
  onWorkspaceContentChanged,
  onWorkspaceActivity,
}: UseWorkbenchWorkspaceContentWatchOptions): void {
  useEffect(() => {
    const bridge = window.puppyoneDesktop;
    if (typeof bridge?.watchWorkspace !== "function") return undefined;

    const stops: Array<() => void> = [];
    let disposed = false;
    for (const folder of folders) {
      if (!folder.capabilities.watch) continue;
      const watch = bridge.watchWorkspace(folder.workspace.path, (event) => {
        if (disposed) return;
        if (event.error && !("recovered" in event && event.recovered)) return;
        onWorkspaceContentChanged(event.paths ?? event.path ?? null, folder.id);
        onWorkspaceActivity?.(folder);
      });
      stops.push(watch.stop);
      void watch.ready.catch((error) => {
        if (!disposed) console.warn("Unable to watch Workspace Folder:", error);
      });
    }

    return () => {
      disposed = true;
      for (const stop of stops) stop();
    };
  }, [folders, onWorkspaceActivity, onWorkspaceContentChanged]);
}
