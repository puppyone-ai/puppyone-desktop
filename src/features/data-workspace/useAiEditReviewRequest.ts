import { useEffect, useRef, useState } from "react";
import type { AiEditRequest, Workspace } from "@puppyone/shared-ui";
import {
  getLatestAiEditReviewRequest,
  subscribeAiEditReviewUpdates,
} from "../../lib/localFiles";

export function useAiEditReviewRequest({
  aiEditAssistEnabled,
  onWorkspaceContentChanged,
  workspace,
  workspaceIsCloud,
}: {
  aiEditAssistEnabled: boolean;
  onWorkspaceContentChanged: () => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const [latestAiEditRequest, setLatestAiEditRequest] = useState<AiEditRequest | null>(null);
  const workspacePathRef = useRef<string | null>(null);

  useEffect(() => {
    workspacePathRef.current = workspace?.path ?? null;
    setLatestAiEditRequest(null);
  }, [workspace?.path]);

  useEffect(() => {
    if (!workspace || workspaceIsCloud || !aiEditAssistEnabled) {
      setLatestAiEditRequest(null);
      return undefined;
    }

    const rootPath = workspace.path;
    let cancelled = false;
    setLatestAiEditRequest(null);

    void getLatestAiEditReviewRequest(rootPath)
      .then((request) => {
        if (!cancelled && workspacePathRef.current === rootPath) {
          setLatestAiEditRequest(request);
        }
      })
      .catch((error) => {
        console.warn("Unable to read latest AI edit request:", error);
      });

    const unsubscribe = subscribeAiEditReviewUpdates((event) => {
      if (event.rootPath !== rootPath || workspacePathRef.current !== rootPath) return;
      setLatestAiEditRequest(event.request);
      onWorkspaceContentChanged();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [aiEditAssistEnabled, onWorkspaceContentChanged, workspace, workspaceIsCloud]);

  return latestAiEditRequest;
}
