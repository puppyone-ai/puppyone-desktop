import { useEffect } from "react";
import type { Workspace } from "@puppyone/shared-ui";

/**
 * @deprecated Content watching is owned by `useDesktopGitController` so the
 * initial Git snapshot waits for both content and metadata readiness.
 * Kept as a no-op compatibility shim for any residual call sites.
 */
export function useWorkspaceFileWatch(_options: {
  onGitRefresh: (reason?: string) => void;
  onWorkspaceContentChanged: () => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  useEffect(() => undefined, []);
}
