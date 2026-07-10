import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DataNode, DataPort, Workspace } from "@puppyone/shared-ui";
import {
  collapseNestedNodes,
  createFileClipboardState,
  isValidPasteTarget,
  type FileClipboardState,
} from "./fileClipboard";
import { executeFileClipboardPaste, executeFileDuplicate } from "./fileTransfer";

export type FileOperationNotice = {
  tone: "info" | "error";
  message: string;
};

export type FileClipboardOperation = "paste" | "duplicate" | null;

type ActiveFileClipboardOperation = {
  kind: Exclude<FileClipboardOperation, null>;
  generation: number;
  workspaceKey: string;
};

export type FileClipboardController = {
  clipboard: FileClipboardState | null;
  cutPaths: ReadonlySet<string>;
  operation: FileClipboardOperation;
  notice: FileOperationNotice | null;
  canCopy: boolean;
  canCut: boolean;
  canDuplicate: boolean;
  copyNodes: (nodes: readonly DataNode[]) => void;
  cutNodes: (nodes: readonly DataNode[]) => void;
  pasteNodes: (targetFolderPath: string | null) => Promise<void>;
  duplicateNodes: (nodes: readonly DataNode[]) => Promise<void>;
  canPasteInto: (targetFolderPath: string | null) => boolean;
};

export function useFileClipboard({
  dataPort,
  onEnterDataView,
  onLocalWorkspaceContentChanged,
  onWorkspaceContentChanged,
  setActiveDataPath,
  setActiveDataNode,
  workspace,
  workspaceIsCloud,
}: {
  dataPort: DataPort | null;
  onEnterDataView: () => void;
  onLocalWorkspaceContentChanged: () => void;
  onWorkspaceContentChanged: () => void;
  setActiveDataPath: Dispatch<SetStateAction<string | null>>;
  setActiveDataNode: Dispatch<SetStateAction<DataNode | null>>;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}): FileClipboardController {
  const [clipboard, setClipboard] = useState<FileClipboardState | null>(null);
  const [operation, setOperation] = useState<FileClipboardOperation>(null);
  const [notice, setNotice] = useState<FileOperationNotice | null>(null);
  const clipboardRef = useRef<FileClipboardState | null>(null);
  const operationRef = useRef<ActiveFileClipboardOperation | null>(null);
  const generationRef = useRef(0);
  const workspaceKey = workspace ? `${workspace.id}\n${workspace.path}` : "";
  const latestWorkspaceKeyRef = useRef(workspaceKey);
  latestWorkspaceKeyRef.current = workspaceKey;

  const cutPaths = useMemo<ReadonlySet<string>>(() => (
    clipboard?.mode === "cut"
      ? new Set(clipboard.nodes.map((node) => node.path))
      : new Set()
  ), [clipboard]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    clipboardRef.current = null;
    operationRef.current = null;
    setClipboard(null);
    setOperation(null);
    setNotice(null);
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      operationRef.current = null;
    };
  }, [workspaceKey]);

  useEffect(() => {
    if (!notice || operation !== null) return undefined;
    const timeoutId = window.setTimeout(
      () => setNotice(null),
      notice.tone === "error" ? 6000 : 2600,
    );
    return () => window.clearTimeout(timeoutId);
  }, [notice, operation]);

  const setClipboardFromNodes = useCallback((mode: "copy" | "cut", nodes: readonly DataNode[]) => {
    if (!workspace || !workspaceKey || operationRef.current !== null) return;
    if (mode === "copy" && !dataPort?.copyNode) return;
    if (mode === "cut" && !dataPort?.moveNode) return;

    const nextClipboard = createFileClipboardState(workspaceKey, mode, nodes);
    if (!nextClipboard) return;

    clipboardRef.current = nextClipboard;
    setClipboard(nextClipboard);
    setNotice({
      tone: "info",
      message: `${mode === "copy" ? "Copied" : "Cut"} ${formatItemCount(nextClipboard.nodes.length)}. Select a folder and paste.`,
    });
    onEnterDataView();
  }, [dataPort, onEnterDataView, workspace, workspaceKey]);

  const copyNodes = useCallback((nodes: readonly DataNode[]) => {
    setClipboardFromNodes("copy", nodes);
  }, [setClipboardFromNodes]);

  const cutNodes = useCallback((nodes: readonly DataNode[]) => {
    setClipboardFromNodes("cut", nodes);
  }, [setClipboardFromNodes]);

  const canPasteInto = useCallback((targetFolderPath: string | null): boolean => {
    if (!clipboard || operation !== null) return false;
    if (clipboard.mode === "copy" && !dataPort?.copyNode) return false;
    if (clipboard.mode === "cut" && !dataPort?.moveNode) return false;
    return isValidPasteTarget(clipboard, { workspaceKey, path: targetFolderPath });
  }, [clipboard, dataPort, operation, workspaceKey]);

  const pasteNodes = useCallback(async (targetFolderPath: string | null) => {
    const activeClipboard = clipboardRef.current;
    if (!workspace || !dataPort || !activeClipboard || operationRef.current !== null) return;
    if (!isValidPasteTarget(activeClipboard, { workspaceKey, path: targetFolderPath })) {
      setNotice({ tone: "error", message: "These items cannot be pasted into that folder." });
      return;
    }
    if (activeClipboard.mode === "copy" && !dataPort.copyNode) return;
    if (activeClipboard.mode === "cut" && !dataPort.moveNode) return;

    const operationToken: ActiveFileClipboardOperation = {
      kind: "paste",
      generation: generationRef.current,
      workspaceKey,
    };
    operationRef.current = operationToken;
    setOperation("paste");
    setNotice({
      tone: "info",
      message: `${activeClipboard.mode === "copy" ? "Copying" : "Moving"} ${formatItemCount(activeClipboard.nodes.length)}...`,
    });
    onEnterDataView();

    try {
      const result = await executeFileClipboardPaste(dataPort, activeClipboard, targetFolderPath);
      if (
        latestWorkspaceKeyRef.current !== operationToken.workspaceKey
        || generationRef.current !== operationToken.generation
        || operationRef.current !== operationToken
      ) return;
      const completedSourcePaths = new Set(result.completedSourcePaths);
      const firstFailure = result.failures[0];

      if (activeClipboard.mode === "cut") {
        const remainingNodes = activeClipboard.nodes.filter((node) => !completedSourcePaths.has(node.path));
        const nextClipboard = remainingNodes.length > 0 ? { ...activeClipboard, nodes: remainingNodes } : null;
        clipboardRef.current = nextClipboard;
        setClipboard(nextClipboard);
      }

      if (result.destinationPaths.length > 0) {
        setActiveDataPath(result.destinationPaths[0]);
        setActiveDataNode(null);
      }
      if (completedSourcePaths.size > 0 || result.failures.length > 0) {
        onWorkspaceContentChanged();
        if (!workspaceIsCloud) onLocalWorkspaceContentChanged();
      }

      const completedCount = completedSourcePaths.size;
      setNotice(result.failures.length > 0 ? {
        tone: "error",
        message: completedCount > 0
          ? `${activeClipboard.mode === "copy" ? "Copied" : "Moved"} ${formatItemCount(completedCount)}; ${result.failures.length} failed. ${formatFailure(firstFailure)}`
          : formatFailure(firstFailure),
      } : {
        tone: "info",
        message: `${activeClipboard.mode === "copy" ? "Copied" : "Moved"} ${formatItemCount(completedCount)} to ${formatFolderLabel(targetFolderPath)}.`,
      });
    } finally {
      if (
        latestWorkspaceKeyRef.current === operationToken.workspaceKey
        && generationRef.current === operationToken.generation
        && operationRef.current === operationToken
      ) {
        operationRef.current = null;
        setOperation(null);
      }
    }
  }, [
    dataPort,
    onEnterDataView,
    onLocalWorkspaceContentChanged,
    onWorkspaceContentChanged,
    setActiveDataNode,
    setActiveDataPath,
    workspace,
    workspaceIsCloud,
    workspaceKey,
  ]);

  const duplicateNodes = useCallback(async (nodes: readonly DataNode[]) => {
    if (!workspace || !dataPort?.copyNode || operationRef.current !== null) return;
    const sourceNodes = collapseNestedNodes(nodes);
    if (sourceNodes.length === 0) return;

    const operationToken: ActiveFileClipboardOperation = {
      kind: "duplicate",
      generation: generationRef.current,
      workspaceKey,
    };
    operationRef.current = operationToken;
    setOperation("duplicate");
    setNotice({ tone: "info", message: `Duplicating ${formatItemCount(sourceNodes.length)}...` });
    onEnterDataView();

    try {
      const result = await executeFileDuplicate(dataPort, sourceNodes);
      if (
        latestWorkspaceKeyRef.current !== operationToken.workspaceKey
        || generationRef.current !== operationToken.generation
        || operationRef.current !== operationToken
      ) return;
      const firstFailure = result.failures[0];

      if (result.destinationPaths.length > 0) {
        setActiveDataPath(result.destinationPaths[0]);
        setActiveDataNode(null);
      }
      onWorkspaceContentChanged();
      if (!workspaceIsCloud) onLocalWorkspaceContentChanged();

      setNotice(result.failures.length > 0 ? {
        tone: "error",
        message: result.destinationPaths.length > 0
          ? `Duplicated ${formatItemCount(result.destinationPaths.length)}; ${result.failures.length} failed. ${formatFailure(firstFailure)}`
          : formatFailure(firstFailure),
      } : {
        tone: "info",
        message: `Duplicated ${formatItemCount(result.destinationPaths.length)}.`,
      });
    } finally {
      if (
        latestWorkspaceKeyRef.current === operationToken.workspaceKey
        && generationRef.current === operationToken.generation
        && operationRef.current === operationToken
      ) {
        operationRef.current = null;
        setOperation(null);
      }
    }
  }, [
    dataPort,
    onEnterDataView,
    onLocalWorkspaceContentChanged,
    onWorkspaceContentChanged,
    setActiveDataNode,
    setActiveDataPath,
    workspace,
    workspaceIsCloud,
    workspaceKey,
  ]);

  return useMemo<FileClipboardController>(() => ({
    clipboard,
    cutPaths,
    operation,
    notice,
    canCopy: Boolean(dataPort?.copyNode) && operation === null,
    canCut: Boolean(dataPort?.moveNode) && operation === null,
    canDuplicate: Boolean(dataPort?.copyNode) && operation === null,
    copyNodes,
    cutNodes,
    pasteNodes,
    duplicateNodes,
    canPasteInto,
  }), [
    canPasteInto,
    clipboard,
    copyNodes,
    cutNodes,
    cutPaths,
    dataPort,
    duplicateNodes,
    notice,
    operation,
    pasteNodes,
  ]);
}

function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function formatFolderLabel(path: string | null): string {
  if (!path) return "the workspace root";
  const name = path.split("/").filter(Boolean).at(-1);
  return name ? `"${name}"` : "the workspace root";
}

function formatFailure(failure: { name: string; message: string } | undefined): string {
  return failure ? `${failure.name}: ${failure.message}` : "The file operation failed.";
}
