import { useEffect, useRef, useState } from "react";
import {
  qualifyDataResourcePath,
  type AiEditRequest,
  type ResourceUri,
  type Workspace,
} from "@puppyone/shared-ui";
import {
  getLatestAiEditReviewRequest,
  subscribeAiEditReviewUpdates,
} from "../../lib/localFiles";

export function useAiEditReviewRequest({
  aiEditAssistEnabled,
  onWorkspaceContentChanged,
  workspace,
  workspaceRootUri,
}: {
  aiEditAssistEnabled: boolean;
  onWorkspaceContentChanged: () => void;
  workspace: Workspace | null;
  workspaceRootUri: ResourceUri | null;
}) {
  const [latestAiEditRequest, setLatestAiEditRequest] = useState<AiEditRequest | null>(null);
  const workspacePathRef = useRef<string | null>(null);

  useEffect(() => {
    workspacePathRef.current = workspace?.path ?? null;
    setLatestAiEditRequest(null);
  }, [workspace?.path]);

  useEffect(() => {
    if (!workspace || !workspaceRootUri || !aiEditAssistEnabled) {
      setLatestAiEditRequest(null);
      return undefined;
    }

    const rootPath = workspace.path;
    let cancelled = false;
    setLatestAiEditRequest(null);

    void getLatestAiEditReviewRequest(rootPath)
      .then((request) => {
        if (!cancelled && workspacePathRef.current === rootPath) {
          setLatestAiEditRequest(qualifyAiEditRequest(request, workspaceRootUri));
        }
      })
      .catch((error) => {
        console.warn("Unable to read latest AI edit request:", error);
      });

    const unsubscribe = subscribeAiEditReviewUpdates((event) => {
      if (event.rootPath !== rootPath || workspacePathRef.current !== rootPath) return;
      setLatestAiEditRequest(qualifyAiEditRequest(event.request, workspaceRootUri));
      onWorkspaceContentChanged();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [aiEditAssistEnabled, onWorkspaceContentChanged, workspace, workspaceRootUri]);

  return latestAiEditRequest;
}

export function qualifyAiEditRequest(
  request: AiEditRequest | null,
  workspaceRootUri: ResourceUri,
): AiEditRequest | null {
  if (!request) return null;
  return {
    ...request,
    files: request.files.map((file) => ({
      ...file,
      path: qualifyProviderPath(file.path, workspaceRootUri),
      ...(file.oldPath === undefined
        ? {}
        : {
            oldPath: file.oldPath
              ? qualifyProviderPath(file.oldPath, workspaceRootUri)
              : file.oldPath,
          }),
    })),
  };
}

function qualifyProviderPath(path: string, workspaceRootUri: ResourceUri): string {
  return qualifyDataResourcePath(workspaceRootUri, path);
}
