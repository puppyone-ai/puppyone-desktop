import type { DataNode } from "../../core/types";

export const EXPLORER_REFERENCE_DRAG_TYPE = "application/x-puppyone-workspace-entries+json";
export const EXPLORER_REFERENCE_DRAG_VERSION = 1;
export const EXPLORER_TREE_NODE_DRAG_TYPE = "application/x-puppyone-data-node-path";

export type ExplorerReferenceDragEntry = {
  path: string;
  name: string;
  entryType: "file" | "directory";
};

export type ExplorerReferenceDragPayload = {
  version: 1;
  workspaceId: string;
  entries: ExplorerReferenceDragEntry[];
};

export function serializeExplorerReferenceDrag(workspaceId: string, nodes: DataNode[]) {
  const payload: ExplorerReferenceDragPayload = {
    version: EXPLORER_REFERENCE_DRAG_VERSION,
    workspaceId: workspaceId.slice(0, 256),
    entries: nodes.slice(0, 32).map((node) => ({
      path: node.path.slice(0, 4_096),
      name: node.name.slice(0, 512),
      entryType: node.type === "folder" ? "directory" : "file",
    })),
  };
  return JSON.stringify(payload);
}

export function parseExplorerReferenceDrag(value: string): ExplorerReferenceDragPayload | null {
  if (!value || value.length > 160_000) return null;
  try {
    const payload = JSON.parse(value) as Partial<ExplorerReferenceDragPayload>;
    if (payload.version !== EXPLORER_REFERENCE_DRAG_VERSION) return null;
    if (typeof payload.workspaceId !== "string" || payload.workspaceId.length === 0 || payload.workspaceId.length > 256) return null;
    if (!Array.isArray(payload.entries) || payload.entries.length === 0 || payload.entries.length > 32) return null;
    const entries = payload.entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      if (typeof entry.path !== "string" || entry.path.length === 0 || entry.path.length > 4_096) return [];
      if (typeof entry.name !== "string" || entry.name.length === 0 || entry.name.length > 512) return [];
      if (entry.entryType !== "file" && entry.entryType !== "directory") return [];
      return [{ path: entry.path, name: entry.name, entryType: entry.entryType }];
    });
    if (entries.length !== payload.entries.length) return null;
    return { version: 1, workspaceId: payload.workspaceId, entries };
  } catch {
    return null;
  }
}

export type ReferenceDataTransferSource =
  | { kind: "workspace-entries"; workspaceId: string | null; entries: ExplorerReferenceDragEntry[]; typed: boolean }
  | { kind: "files"; files: File[] }
  | { kind: "text"; text: string }
  | { kind: "none" };

/** Platform-neutral source classification shared by Chat and Terminal. */
export function classifyReferenceDataTransfer(dataTransfer: DataTransfer): ReferenceDataTransferSource {
  const typed = parseExplorerReferenceDrag(dataTransfer.getData(EXPLORER_REFERENCE_DRAG_TYPE));
  if (typed) return { kind: "workspace-entries", workspaceId: typed.workspaceId, entries: typed.entries, typed: true };
  const legacyPaths = splitBoundedPaths(dataTransfer.getData(EXPLORER_TREE_NODE_DRAG_TYPE));
  if (legacyPaths.length > 0) {
    return {
      kind: "workspace-entries",
      workspaceId: null,
      entries: legacyPaths.map((entryPath) => ({
        path: entryPath,
        name: entryPath.split(/[/\\]/).filter(Boolean).at(-1) || entryPath,
        entryType: "file",
      })),
      typed: false,
    };
  }
  const files = Array.from(dataTransfer.files ?? []).slice(0, 32);
  if (files.length > 0) return { kind: "files", files };
  const text = (dataTransfer.getData("text/plain") || dataTransfer.getData("text/uri-list")).trim();
  return text ? { kind: "text", text: text.slice(0, 128 * 1024) } : { kind: "none" };
}

export function hasReferenceDataTransferSource(dataTransfer: DataTransfer) {
  return hasFileReferenceDataTransferSource(dataTransfer)
    || Array.from(dataTransfer.types ?? []).includes("text/plain")
    || Array.from(dataTransfer.types ?? []).includes("text/uri-list");
}

export function hasFileReferenceDataTransferSource(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types ?? []);
  return types.includes(EXPLORER_REFERENCE_DRAG_TYPE)
    || types.includes(EXPLORER_TREE_NODE_DRAG_TYPE)
    || types.includes("Files")
    || dataTransfer.files.length > 0
    || Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

function splitBoundedPaths(value: string) {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).slice(0, 32);
}
