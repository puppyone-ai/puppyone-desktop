import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { DataNode, DataPort, Workspace } from "@puppyone/shared-ui";
import {
  openWorkspaceEntryExternal,
  revealWorkspaceEntryInFinder,
} from "../../lib/localFiles";
import {
  getExternalAppExtension,
  getExternalAppOverrideForExtension,
  type ExternalAppsSettings,
} from "../../preferences";
import {
  defaultCreateName,
  formatDesktopExtensionLabel,
  getCreateEntryInitialContent,
  getDesktopNodeExtension,
  getDesktopRenameDraft,
  normalizeCreateEntryName,
  normalizeDesktopExtension,
  normalizeDesktopRenameName,
  rectToCreateEntryAnchor,
  uniqueCreateEntryName,
  type DesktopCreateEntryAnchorInput,
  type DesktopCreateEntryDraft,
  type DesktopCreateEntryKind,
  type DesktopNodeActionMenuDraft,
} from "./nodeActions";
import {
  getDataParentPath,
  joinDataPath,
  remapActivePathAfterRename,
} from "./explorer";
import { collapseNestedNodes } from "./fileClipboard";
import { useFileClipboard } from "./useFileClipboard";

export function useDataNodeActions({
  dataPort,
  externalAppsSettings,
  onEnterDataView,
  onLocalWorkspaceContentChanged,
  onWorkspaceContentChanged,
  setActiveDataPath,
  setActiveDataNode,
  workspace,
  workspaceIsCloud,
}: {
  dataPort: DataPort | null;
  externalAppsSettings: ExternalAppsSettings;
  onEnterDataView: () => void;
  onLocalWorkspaceContentChanged: () => void;
  onWorkspaceContentChanged: () => void;
  setActiveDataPath: Dispatch<SetStateAction<string | null>>;
  setActiveDataNode: Dispatch<SetStateAction<DataNode | null>>;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const [createEntryDraft, setCreateEntryDraft] = useState<DesktopCreateEntryDraft | null>(null);
  const [nodeActionMenu, setNodeActionMenu] = useState<DesktopNodeActionMenuDraft | null>(null);
  const fileClipboardController = useFileClipboard({
    dataPort,
    onEnterDataView,
    onLocalWorkspaceContentChanged,
    onWorkspaceContentChanged,
    setActiveDataNode,
    setActiveDataPath,
    workspace,
    workspaceIsCloud,
  });

  const resetDataNodeActions = useCallback(() => {
    setCreateEntryDraft(null);
    setNodeActionMenu(null);
  }, []);

  const openCreateEntryMenu = useCallback((parentPath: string | null, anchorRect: DesktopCreateEntryAnchorInput) => {
    onEnterDataView();
    setNodeActionMenu(null);
    setCreateEntryDraft({
      parentPath,
      anchor: normalizeCreateEntryAnchor(anchorRect),
      error: null,
      creatingKind: null,
      selectedKind: null,
      name: "",
    });
  }, [onEnterDataView]);

  const openNodeActionMenu = useCallback((node: DataNode, anchorRect: DOMRect, selectedNodes: readonly DataNode[] = [node]) => {
    const selectedNodeIsInSelection = selectedNodes.some((selectedNode) => selectedNode.path === node.path);
    const nodes = collapseNestedNodes(selectedNodeIsInSelection ? selectedNodes : [node]);
    const primaryNode = nodes.find((selectedNode) => selectedNode.path === node.path) ?? nodes[0] ?? node;
    const renameDraft = getDesktopRenameDraft(primaryNode);
    onEnterDataView();
    setCreateEntryDraft(null);
    setNodeActionMenu({
      node: primaryNode,
      nodes,
      anchor: rectToCreateEntryAnchor(anchorRect),
      mode: "actions",
      renameNameValue: renameDraft.nameValue,
      renameExtensionValue: renameDraft.extensionValue,
      renameFocus: "name",
      error: null,
      operation: null,
    });
  }, [onEnterDataView]);

  const selectCreateEntryKind = useCallback((kind: DesktopCreateEntryKind) => {
    setCreateEntryDraft((current) => current ? {
      ...current,
      selectedKind: kind,
      name: defaultCreateName(kind),
      error: null,
    } : current);
  }, []);

  const createEntryFromMenu = useCallback(async () => {
    if (
      !workspace ||
      !dataPort ||
      !dataPort.createFolder ||
      !dataPort.createFile ||
      !createEntryDraft ||
      createEntryDraft.creatingKind ||
      !createEntryDraft.selectedKind
    ) return;

    const kind = createEntryDraft.selectedKind;
    let requestedName: string;
    try {
      requestedName = normalizeCreateEntryName(kind, createEntryDraft.name);
    } catch (error) {
      setCreateEntryDraft((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : String(error),
      } : current);
      return;
    }

    setCreateEntryDraft((current) => current ? { ...current, creatingKind: kind, error: null } : current);
    try {
      const existingChildren = await dataPort.listChildren(createEntryDraft.parentPath).catch(() => []);
      const name = uniqueCreateEntryName(requestedName, new Set(existingChildren.map((node) => node.name)));
      const nextPath = joinDataPath(createEntryDraft.parentPath, name);
      if (kind === "folder") {
        await dataPort.createFolder(nextPath);
      } else {
        await dataPort.createFile(nextPath, getCreateEntryInitialContent(kind));
      }
      setCreateEntryDraft(null);
      setNodeActionMenu(null);
      onEnterDataView();
      setActiveDataPath(nextPath);
      setActiveDataNode(null);
      onWorkspaceContentChanged();
      if (!workspaceIsCloud) onLocalWorkspaceContentChanged();
    } catch (error) {
      setCreateEntryDraft((current) => current ? {
        ...current,
        creatingKind: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [
    createEntryDraft,
    dataPort,
    onEnterDataView,
    onLocalWorkspaceContentChanged,
    onWorkspaceContentChanged,
    setActiveDataNode,
    setActiveDataPath,
    workspace,
    workspaceIsCloud,
  ]);

  const renameNodeFromMenu = useCallback(async () => {
    if (!dataPort?.renameNode || !nodeActionMenu || nodeActionMenu.operation || nodeActionMenu.nodes.length !== 1) return;

    let nextName: string;
    try {
      nextName = normalizeDesktopRenameName(nodeActionMenu);
    } catch (error) {
      setNodeActionMenu((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : String(error),
      } : current);
      return;
    }

    if (nextName === nodeActionMenu.node.name) {
      setNodeActionMenu(null);
      return;
    }

    if (nodeActionMenu.node.type !== "folder") {
      const previousExtension = getDesktopNodeExtension(nodeActionMenu.node.name);
      const nextExtension = getDesktopNodeExtension(nextName);
      if (normalizeDesktopExtension(previousExtension) !== normalizeDesktopExtension(nextExtension)) {
        const confirmed = window.confirm(
          `Change file type from ${formatDesktopExtensionLabel(previousExtension)} to ${formatDesktopExtensionLabel(nextExtension)}? File content will stay unchanged.`,
        );
        if (!confirmed) return;
      }
    }

    setNodeActionMenu((current) => current ? { ...current, operation: "rename", error: null } : current);
    const previousPath = nodeActionMenu.node.path;
    const nextPath = joinDataPath(getDataParentPath(previousPath), nextName);

    try {
      await dataPort.renameNode(previousPath, nextName);
      setNodeActionMenu(null);
      setActiveDataPath((current) => remapActivePathAfterRename(current, previousPath, nextPath));
      setActiveDataNode((current) => (
        current?.path === previousPath
          ? { ...current, name: nextName, path: nextPath }
          : current?.path.startsWith(`${previousPath}/`)
            ? { ...current, path: remapActivePathAfterRename(current.path, previousPath, nextPath) ?? current.path }
            : current
      ));
      onWorkspaceContentChanged();
      if (!workspaceIsCloud) onLocalWorkspaceContentChanged();
    } catch (error) {
      setNodeActionMenu((current) => current ? {
        ...current,
        operation: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [
    dataPort,
    nodeActionMenu,
    onLocalWorkspaceContentChanged,
    onWorkspaceContentChanged,
    setActiveDataNode,
    setActiveDataPath,
    workspaceIsCloud,
  ]);

  const deleteNodeFromMenu = useCallback(async () => {
    if (!dataPort?.deleteNode || !nodeActionMenu || nodeActionMenu.operation) return;

    const nodes = collapseNestedNodes(nodeActionMenu.nodes);
    if (nodes.length === 0) return;
    const confirmed = window.confirm(nodes.length === 1
      ? `Delete "${nodes[0].name}"? This cannot be undone.`
      : `Delete ${nodes.length} items? This cannot be undone.`);
    if (!confirmed) return;

    setNodeActionMenu((current) => current ? { ...current, operation: "delete", error: null } : current);
    const deletedNodes: DataNode[] = [];
    const failures: string[] = [];
    for (const node of nodes) {
      try {
        await dataPort.deleteNode(node.path);
        deletedNodes.push(node);
      } catch (error) {
        failures.push(`${node.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (deletedNodes.length > 0) {
      setActiveDataPath((current) => (
        deletedNodes.some((node) => current === node.path || current?.startsWith(`${node.path}/`)) ? null : current
      ));
      setActiveDataNode((current) => (
        deletedNodes.some((node) => current?.path === node.path || current?.path.startsWith(`${node.path}/`)) ? null : current
      ));
      onWorkspaceContentChanged();
      if (!workspaceIsCloud) onLocalWorkspaceContentChanged();
    }

    if (failures.length === 0) {
      setNodeActionMenu(null);
    } else {
      setNodeActionMenu((current) => current ? {
        ...current,
        operation: null,
        error: deletedNodes.length > 0
          ? `Deleted ${formatItemCount(deletedNodes.length)}; ${failures.length} failed. ${failures[0]}`
          : failures[0],
      } : current);
    }
  }, [
    dataPort,
    nodeActionMenu,
    onLocalWorkspaceContentChanged,
    onWorkspaceContentChanged,
    setActiveDataNode,
    setActiveDataPath,
    workspaceIsCloud,
  ]);

  const revealNodeInFinderFromMenu = useCallback(async () => {
    if (!workspace || !nodeActionMenu || nodeActionMenu.operation) return;
    if (workspaceIsCloud) return;

    setNodeActionMenu((current) => current ? { ...current, operation: "reveal", error: null } : current);
    try {
      await revealWorkspaceEntryInFinder(workspace.path, nodeActionMenu.node.path);
      setNodeActionMenu(null);
    } catch (error) {
      setNodeActionMenu((current) => current ? {
        ...current,
        operation: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [nodeActionMenu, workspace, workspaceIsCloud]);

  const openNodeInDefaultAppFromMenu = useCallback(async () => {
    if (!workspace || !nodeActionMenu || nodeActionMenu.operation) return;
    if (workspaceIsCloud || nodeActionMenu.node.type === "folder") return;

    setNodeActionMenu((current) => current ? { ...current, operation: "open", error: null } : current);
    try {
      const extension = getExternalAppExtension(nodeActionMenu.node.path);
      const override = getExternalAppOverrideForExtension(externalAppsSettings, extension);
      await openWorkspaceEntryExternal({
        rootPath: workspace.path,
        path: nodeActionMenu.node.path,
        strategy: override ? "app" : externalAppsSettings.openMode,
        appPath: override?.appPath ?? null,
      });
      setNodeActionMenu(null);
    } catch (error) {
      setNodeActionMenu((current) => current ? {
        ...current,
        operation: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [
    externalAppsSettings,
    nodeActionMenu,
    workspace,
    workspaceIsCloud,
  ]);

  return {
    createEntryDraft,
    nodeActionMenu,
    fileClipboardController,
    resetDataNodeActions,
    setCreateEntryDraft,
    setNodeActionMenu,
    openCreateEntryMenu,
    openNodeActionMenu,
    selectCreateEntryKind,
    createEntryFromMenu,
    renameNodeFromMenu,
    deleteNodeFromMenu,
    revealNodeInFinderFromMenu,
    openNodeInDefaultAppFromMenu,
  };
}

function normalizeCreateEntryAnchor(anchor: DesktopCreateEntryAnchorInput) {
  return "toJSON" in anchor ? rectToCreateEntryAnchor(anchor) : anchor;
}

function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
