import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEditorSourceRequirement,
  shouldReadEditorContent,
  type DataNode,
  type DataPort,
  type DocumentPersistedCommit,
  type FileContent,
} from "@puppyone/shared-ui";

export function useEditorPaneSource(
  node: DataNode | null,
  dataPort: DataPort,
  refreshKey: unknown,
) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileUrlLoading, setFileUrlLoading] = useState(false);
  const [fileUrlError, setFileUrlError] = useState<string | null>(null);
  const nodePath = node?.path ?? null;
  const needsContent = Boolean(node && dataPort.readFile && shouldReadEditorContent(node));
  const sourceRequirement = node ? getEditorSourceRequirement(node) : "none";
  const needsResource = Boolean(
    node
    && dataPort.getFileUrl
    && (sourceRequirement === "resource" || sourceRequirement === "content-and-resource"),
  );

  useEffect(() => {
    setContent(null);
    setError(null);
    if (!nodePath || !needsContent || !dataPort.readFile) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
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

  useEffect(() => {
    setFileUrl(null);
    setFileUrlError(null);
    if (!nodePath || !needsResource || !dataPort.getFileUrl) {
      setFileUrlLoading(false);
      return undefined;
    }
    let cancelled = false;
    let activeUrl: string | null = null;
    setFileUrlLoading(true);
    Promise.resolve(dataPort.getFileUrl(nodePath))
      .then((url) => {
        if (cancelled) {
          void Promise.resolve(dataPort.revokeFileUrl?.(url)).catch(() => undefined);
          return;
        }
        activeUrl = url;
        setFileUrl(url);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setFileUrlError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      })
      .finally(() => {
        if (!cancelled) setFileUrlLoading(false);
      });
    return () => {
      cancelled = true;
      if (activeUrl) {
        void Promise.resolve(dataPort.revokeFileUrl?.(activeUrl)).catch(() => undefined);
      }
    };
  }, [dataPort, needsResource, nodePath]);

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

  return useMemo(() => ({
    content,
    loading: loading || (needsContent && !content && !error),
    error,
    fileUrl,
    fileUrlLoading,
    fileUrlError,
    applyPersistedCommit,
  }), [
    applyPersistedCommit,
    content,
    error,
    fileUrl,
    fileUrlError,
    fileUrlLoading,
    loading,
    needsContent,
  ]);
}
