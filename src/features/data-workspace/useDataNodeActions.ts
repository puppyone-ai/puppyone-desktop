import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import type { DataNode, DataPort, Workspace } from "@puppyone/shared-ui";
import type { DesktopView } from "../../components/DesktopCloudShell";
import { revealWorkspaceEntryInFinder } from "../../lib/localFiles";
import { getDataParentPath, joinDataPath, remapActivePathAfterRename } from "./explorer";
import {
  defaultCreateName,
  getCreateEntryInitialContent,
  getDesktopNodeExtension,
  getDesktopRenameDraft,
  formatDesktopExtensionLabel,
  normalizeCreateEntryName,
  normalizeDesktopExtension,
  normalizeDesktopRenameName,
  rectToCreateEntryAnchor,
  uniqueCreateEntryName,
  type DesktopCreateEntryDraft,
  type DesktopCreateEntryKind,
  type DesktopNodeActionMenuDraft,
} from "./nodeActions";

/**
 * Data-tree node operations extracted from App.tsx (ISSUE-023): the create-entry
 * draft + node-action context menu and their create/rename/delete/reveal
 * handlers. Behaviour is preserved verbatim — the App-level setters this logic
 * touches (navigation surface, active data path, content refresh) are injected
 * so the extraction is a pure move, not a rewrite. App still owns those state
 * atoms and can reset the returned draft/menu setters on workspace changes.
 */
export type DataNodeActionsDeps = {
  dataPort: DataPort | null;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
  refreshGitStatus: () => void | Promise<void>;
  setActiveView: Dispatch<SetStateAction<DesktopView>>;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  setBranchSwitcherOpen: (open: boolean) => void;
  setActiveDataPath: Dispatch<SetStateAction<string | null>>;
  bumpWorkspaceRefreshToken: () => void;
};

export function useDataNodeActions({
  dataPort,
  workspace,
  workspaceIsCloud,
  refreshGitStatus,
  setActiveView,
  setSidebarCollapsed,
  setSwitcherOpen,
  setBranchSwitcherOpen,
  setActiveDataPath,
  bumpWorkspaceRefreshToken,
}: DataNodeActionsDeps) {
  const [createEntryDraft, setCreateEntryDraft] = useState<DesktopCreateEntryDraft | null>(null);
  const [nodeActionMenu, setNodeActionMenu] = useState<DesktopNodeActionMenuDraft | null>(null);

  const openCreateEntryMenu = useCallback((parentPath: string | null, anchorRect: DOMRect) => {
    setActiveView("data");
    setSidebarCollapsed(false);
    setSwitcherOpen(false);
    setBranchSwitcherOpen(false);
    setNodeActionMenu(null);
    setCreateEntryDraft({
      parentPath,
      anchor: rectToCreateEntryAnchor(anchorRect),
      error: null,
      creatingKind: null,
      selectedKind: null,
      name: "",
    });
  }, []);

  const openNodeActionMenu = useCallback((node: DataNode, anchorRect: DOMRect) => {
    const renameDraft = getDesktopRenameDraft(node);
    setActiveView("data");
    setSidebarCollapsed(false);
    setSwitcherOpen(false);
    setBranchSwitcherOpen(false);
    setCreateEntryDraft(null);
    setNodeActionMenu({
      node,
      anchor: rectToCreateEntryAnchor(anchorRect),
      mode: "actions",
      renameNameValue: renameDraft.nameValue,
      renameExtensionValue: renameDraft.extensionValue,
      renameFocus: "name",
      error: null,
      operation: null,
    });
  }, []);

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
      setActiveView("data");
      setSidebarCollapsed(false);
      setActiveDataPath(nextPath);
      bumpWorkspaceRefreshToken();
      if (!workspaceIsCloud) void refreshGitStatus();
    } catch (error) {
      setCreateEntryDraft((current) => current ? {
        ...current,
        creatingKind: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [createEntryDraft, dataPort, refreshGitStatus, workspace, workspaceIsCloud]);

  const renameNodeFromMenu = useCallback(async () => {
    if (!dataPort?.renameNode || !nodeActionMenu || nodeActionMenu.operation) return;

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
      bumpWorkspaceRefreshToken();
      if (!workspaceIsCloud) void refreshGitStatus();
    } catch (error) {
      setNodeActionMenu((current) => current ? {
        ...current,
        operation: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [dataPort, nodeActionMenu, refreshGitStatus, workspaceIsCloud]);

  const deleteNodeFromMenu = useCallback(async () => {
    if (!dataPort?.deleteNode || !nodeActionMenu || nodeActionMenu.operation) return;

    const { node } = nodeActionMenu;
    const confirmed = window.confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setNodeActionMenu((current) => current ? { ...current, operation: "delete", error: null } : current);
    try {
      await dataPort.deleteNode(node.path);
      setNodeActionMenu(null);
      setActiveDataPath((current) => (
        current === node.path || current?.startsWith(`${node.path}/`) ? null : current
      ));
      bumpWorkspaceRefreshToken();
      if (!workspaceIsCloud) void refreshGitStatus();
    } catch (error) {
      setNodeActionMenu((current) => current ? {
        ...current,
        operation: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    }
  }, [dataPort, nodeActionMenu, refreshGitStatus, workspaceIsCloud]);

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

  return {
    createEntryDraft,
    setCreateEntryDraft,
    nodeActionMenu,
    setNodeActionMenu,
    openCreateEntryMenu,
    openNodeActionMenu,
    selectCreateEntryKind,
    createEntryFromMenu,
    renameNodeFromMenu,
    deleteNodeFromMenu,
    revealNodeInFinderFromMenu,
  };
}
