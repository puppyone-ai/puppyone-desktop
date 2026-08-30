import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getEditorSourceRequirement,
  shouldReadEditorContent,
  useFileResourceLease,
  workspaceContentChangeMatchesResource,
  type DataPort,
  type DocumentDataNode,
  type DocumentPersistedCommit,
  type FileContent,
  type WorkspaceContentChange,
} from "@puppyone/shared-ui";

export function useEditorPaneSource(
  node: DocumentDataNode | null,
  dataPort: DataPort,
  refreshKey?: WorkspaceContentChange,
) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track every selected source, not only sources that require a text read.
  // Otherwise CSV -> image -> the same CSV leaves the ref pinned to the CSV
  // while the image transition clears its content, so returning to the CSV is
  // incorrectly treated as already loaded and remains pending forever.
  const lastObservedPathRef = useRef<string | null>(null);
  const nodePath = node?.path ?? null;
  const needsContent = Boolean(node && dataPort.readFile && shouldReadEditorContent(node));
  const sourceRequirement = node ? getEditorSourceRequirement(node) : "none";
  const needsResource = Boolean(
    node
    && dataPort.getFileUrl
    && (sourceRequirement === "resource" || sourceRequirement === "content-and-resource"),
  );

  useEffect(() => {
    setContent((current) => current?.path === nodePath ? current : null);
    setError(null);
  }, [nodePath]);

  useEffect(() => {
    const pathChanged = lastObservedPathRef.current !== nodePath;
    lastObservedPathRef.current = nodePath;
    if (!pathChanged && !workspaceContentChangeMatchesResource(refreshKey, nodePath)) return undefined;
    if (!nodePath || !needsContent || !dataPort.readFile) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    dataPort.readFile(nodePath, { signal: controller.signal })
      .then((nextContent) => {
        if (!controller.signal.aborted) setContent(nextContent);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [dataPort, needsContent, nodePath, refreshKey]);

  const resource = useFileResourceLease({
    dataPort,
    enabled: needsResource,
    path: nodePath,
    refresh: refreshKey,
  });

  const applyPersistedCommit = useCallback((commit: DocumentPersistedCommit) => {
    setContent((current) => {
      if (!node || commit.documentId !== node.path) return current;
      return current
        ? { ...current, content: commit.content, version: commit.version }
        : {
            path: node.path,
            name: node.name,
            type: node.type,
            content: commit.content,
            version: commit.version,
          };
    });
  }, [node]);

  const visibleContent = content?.path === nodePath ? content : null;

  return useMemo(() => ({
    content: visibleContent,
    loading: loading || (needsContent && !visibleContent && !error),
    error,
    fileUrl: resource.fileUrl,
    fileUrlLoading: resource.fileUrlLoading,
    fileUrlError: resource.fileUrlError,
    applyPersistedCommit,
  }), [
    applyPersistedCommit,
    visibleContent,
    error,
    resource.fileUrl,
    resource.fileUrlError,
    resource.fileUrlLoading,
    loading,
    needsContent,
  ]);
}
