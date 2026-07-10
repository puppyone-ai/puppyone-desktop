import type { DataNode, DataPort } from "@puppyone/shared-ui";
import { getDataParentPath, joinDataPath } from "./explorer";
import { collapseNestedNodes, isSameDataPath, type FileClipboardState } from "./fileClipboard";

export type FileTransferFailure = {
  path: string;
  name: string;
  message: string;
};

export type FilePasteResult = {
  completedSourcePaths: string[];
  destinationPaths: string[];
  failures: FileTransferFailure[];
};

export type FileDuplicateResult = {
  sourceCount: number;
  destinationPaths: string[];
  failures: FileTransferFailure[];
};

/**
 * Executes one clipboard batch without mutating UI state. Each entry is
 * isolated so callers can refresh after partial success and retain only failed
 * cut entries. Copy naming remains exclusively owned by the trusted DataPort.
 */
export async function executeFileClipboardPaste(
  dataPort: Pick<DataPort, "copyNode" | "moveNode">,
  clipboard: FileClipboardState,
  targetFolderPath: string | null,
): Promise<FilePasteResult> {
  if (clipboard.mode === "copy" && !dataPort.copyNode) {
    throw new Error("Copy is not available for this workspace.");
  }
  if (clipboard.mode === "cut" && !dataPort.moveNode) {
    throw new Error("Move is not available for this workspace.");
  }

  const completedSourcePaths: string[] = [];
  const destinationPaths: string[] = [];
  const failures: FileTransferFailure[] = [];

  for (const node of clipboard.nodes) {
    if (clipboard.mode === "cut" && isSameDataPath(getDataParentPath(node.path), targetFolderPath)) {
      completedSourcePaths.push(node.path);
      destinationPaths.push(node.path);
      continue;
    }

    try {
      if (clipboard.mode === "copy") {
        const result = await dataPort.copyNode!(node.path, targetFolderPath);
        destinationPaths.push(result.path);
      } else {
        const nextPath = joinDataPath(targetFolderPath, node.name);
        await dataPort.moveNode!(node.path, nextPath);
        destinationPaths.push(nextPath);
      }
      completedSourcePaths.push(node.path);
    } catch (error) {
      failures.push({
        path: node.path,
        name: node.name,
        message: toErrorMessage(error),
      });
    }
  }

  return { completedSourcePaths, destinationPaths, failures };
}

export async function executeFileDuplicate(
  dataPort: Pick<DataPort, "copyNode">,
  nodes: readonly DataNode[],
): Promise<FileDuplicateResult> {
  if (!dataPort.copyNode) throw new Error("Copy is not available for this workspace.");
  const sourceNodes = collapseNestedNodes(nodes);
  const destinationPaths: string[] = [];
  const failures: FileTransferFailure[] = [];

  for (const node of sourceNodes) {
    try {
      const result = await dataPort.copyNode(node.path, getDataParentPath(node.path), {
        forceDuplicateName: true,
      });
      destinationPaths.push(result.path);
    } catch (error) {
      failures.push({
        path: node.path,
        name: node.name,
        message: toErrorMessage(error),
      });
    }
  }

  return { sourceCount: sourceNodes.length, destinationPaths, failures };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
