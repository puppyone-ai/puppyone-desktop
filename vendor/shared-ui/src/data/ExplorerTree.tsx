import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DataNode } from "../core/types";
import { FileGlyphIcon, type FileIconThemeId } from "../file/fileIcons";
import { DotsLoader, InlineLoading } from "../primitives/LoadingIndicator";
import { useScrollEdgeState } from "../primitives/useScrollableClass";
import {
  buildExplorerNodeIndex,
  buildExplorerVisibleModel,
  getDisplayNameKey,
  getExplorerDisplayName,
  type ExplorerVisibleNodeRow,
  type ExplorerVisibleRow,
} from "./explorer/explorerVisibleModel";
import {
  equalExplorerRowInteraction,
  selectExplorerRowInteraction,
  type ExplorerRowInteractionState,
  type ExplorerRowStateSources,
} from "./explorer/explorerRowInteraction";
import type { ExplorerRowMotionInstruction } from "./explorer/explorerMotionPlan";
import { useExplorerMotion } from "./explorer/useExplorerMotion";
import {
  EXPLORER_VIRTUAL_MAX_MOUNTED_ROWS,
  EXPLORER_VIRTUAL_ROW_SIZE,
  useExplorerVirtualWindow,
} from "./explorer/useExplorerVirtualWindow";

export type ExplorerTreeProps = {
  nodes: DataNode[];
  activePath: string | null;
  selectedPaths?: ReadonlySet<string>;
  cutPaths?: ReadonlySet<string>;
  currentFolderPath?: string | null;
  loadingPath?: string | null;
  expandedPaths: ReadonlySet<string>;
  loadingPaths?: ReadonlySet<string>;
  rootLoading?: boolean;
  rootError?: string | null;
  rootLabel?: string;
  showRoot?: boolean;
  emptyLabel?: string;
  loadingLabel?: string;
  fileIconTheme?: FileIconThemeId;
  canMoveNodes?: boolean;
  onSelectNode: (node: DataNode | null, intent?: ExplorerSelectionIntent) => void;
  onToggleFolder?: (node: DataNode, expanded: boolean) => void;
  onMoveNode?: (node: DataNode, targetFolderPath: string | null) => void | Promise<void>;
  onMoveNodes?: (nodes: DataNode[], targetFolderPath: string | null) => void | Promise<void>;
  onCopyNodes?: (nodes: DataNode[]) => void | Promise<void>;
  onCutNodes?: (nodes: DataNode[]) => void | Promise<void>;
  onPasteNodes?: (targetFolderPath: string | null) => void | Promise<void>;
  onDuplicateNodes?: (nodes: DataNode[]) => void | Promise<void>;
  onImportFiles?: (files: File[], targetFolderPath: string | null) => void | Promise<void>;
  onRootContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onNodeContextMenu?: (node: DataNode, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onRootClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  renderRootContent?: () => ReactNode;
  renderListEnd?: () => ReactNode;
  renderRootActions?: () => ReactNode;
  renderFolderActions?: (node: DataNode) => ReactNode;
  renderNodeActions?: (node: DataNode) => ReactNode;
};

export type ExplorerSelectionIntent = {
  additive?: boolean;
  range?: boolean;
};

type TreeDropTarget = {
  rowPath: string | null;
  targetFolderPath: string | null;
  mode: "folder" | "parent";
  valid: boolean;
} | null;

type TreeDragController = {
  enabled: boolean;
  onNodeDragStart: (event: ReactDragEvent<HTMLButtonElement>, node: DataNode) => void;
  onNodeDragEnd: () => void;
  onRowDragOver: (
    event: ReactDragEvent<HTMLElement>,
    rowPath: string | null,
    targetFolderPath: string | null,
    mode: "folder" | "parent",
  ) => boolean;
  onRowDragLeave: (event: ReactDragEvent<HTMLElement>, rowPath: string | null) => void;
  onRowDrop: (event: ReactDragEvent<HTMLElement>, targetFolderPath: string | null) => void;
};

export const EXPLORER_TREE_NODE_DRAG_TYPE = "application/x-puppyone-data-node-path";
const FOLDER_HOVER_EXPAND_MS = 620;
const FOLDER_PEER_DROP_ZONE_RATIO = 0.34;
const EXPLORER_ROW_DOM_ID_PREFIX = "puppyone-explorer-row";

export function ExplorerTree({
  nodes,
  activePath,
  selectedPaths = EMPTY_PATH_SET,
  cutPaths = EMPTY_PATH_SET,
  currentFolderPath = null,
  loadingPath = null,
  expandedPaths,
  loadingPaths,
  rootLoading = false,
  rootError = null,
  rootLabel = "Root",
  showRoot = true,
  emptyLabel = "Empty folder",
  loadingLabel = "Loading...",
  fileIconTheme = "default",
  canMoveNodes = false,
  onSelectNode,
  onToggleFolder,
  onMoveNode,
  onMoveNodes,
  onCopyNodes,
  onCutNodes,
  onPasteNodes,
  onDuplicateNodes,
  onImportFiles,
  onRootContextMenu,
  onNodeContextMenu,
  onRootClick,
  renderRootContent,
  renderListEnd,
  renderRootActions,
  renderFolderActions,
  renderNodeActions,
}: ExplorerTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggedNodes, setDraggedNodes] = useState<DataNode[]>([]);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget>(null);
  const moveEnabled = Boolean(canMoveNodes && (onMoveNodes || onMoveNode));
  const importEnabled = Boolean(onImportFiles);
  const dropEnabled = moveEnabled || importEnabled;
  const resolvedLoadingPaths = useMemo<ReadonlySet<string>>(
    () => loadingPaths ?? (loadingPath ? new Set([loadingPath]) : EMPTY_PATH_SET),
    [loadingPath, loadingPaths],
  );
  const visibleModel = useMemo(() => buildExplorerVisibleModel(nodes, {
    expandedPaths,
    loadingPaths: resolvedLoadingPaths,
    emptyLabel,
    loadingLabel,
  }), [emptyLabel, expandedPaths, loadingLabel, nodes, resolvedLoadingPaths]);
  const nodeIndex = useMemo(() => buildExplorerNodeIndex(nodes), [nodes]);
  const selectedDragNodes = useMemo(
    () => collectTopLevelSelectedNodes(nodeIndex, selectedPaths),
    [nodeIndex, selectedPaths],
  );
  const draggedPaths = useMemo(
    () => new Set(draggedNodes.map((node) => node.path)),
    [draggedNodes],
  );
  const rowStateSources = useMemo<ExplorerRowStateSources>(() => ({
    activePath,
    selectedPaths,
    cutPaths,
    loadingPaths: resolvedLoadingPaths,
    draggedPaths,
    dropTarget,
  }), [activePath, cutPaths, draggedPaths, dropTarget, resolvedLoadingPaths, selectedPaths]);
  const activeIndex = activePath ? visibleModel.pathToIndex.get(activePath) ?? null : null;
  const firstNavigableIndex = useMemo(
    () => findNavigableRowIndex(visibleModel.rows, 0, 1),
    [visibleModel.rows],
  );
  const virtualWindow = useExplorerVirtualWindow({
    rowCount: visibleModel.rows.length,
    scrollRef,
    activeIndex,
  });
  const visibleRows = useMemo(
    () => visibleModel.rows.slice(virtualWindow.startIndex, virtualWindow.endIndex),
    [virtualWindow.endIndex, virtualWindow.startIndex, visibleModel.rows],
  );
  const motionPlan = useExplorerMotion({
    rows: visibleModel.rows,
    mountedRows: visibleRows,
    startIndex: virtualWindow.startIndex,
    endIndex: virtualWindow.endIndex,
    rowSize: EXPLORER_VIRTUAL_ROW_SIZE,
    maxMountedRows: EXPLORER_VIRTUAL_MAX_MOUNTED_ROWS,
  });
  const scrollEdgeState = useScrollEdgeState(scrollRef, {
    dependencies: [visibleModel.rows.length, rootError, rootLoading],
  });
  const scrollable = scrollEdgeState.scrollable;
  const callbackRef = useRef({
    onSelectNode,
    onToggleFolder,
    onNodeContextMenu,
    renderFolderActions,
    renderNodeActions,
  });
  callbackRef.current = {
    onSelectNode,
    onToggleFolder,
    onNodeContextMenu,
    renderFolderActions,
    renderNodeActions,
  };
  const selectNode = useCallback<ExplorerTreeProps["onSelectNode"]>(
    (node, intent) => callbackRef.current.onSelectNode(node, intent),
    [],
  );
  const toggleFolder = useCallback<NonNullable<ExplorerTreeProps["onToggleFolder"]>>(
    (node, expanded) => callbackRef.current.onToggleFolder?.(node, expanded),
    [],
  );
  const openNodeContextMenu = useCallback<NonNullable<ExplorerTreeProps["onNodeContextMenu"]>>(
    (node, event) => callbackRef.current.onNodeContextMenu?.(node, event),
    [],
  );
  const renderNodeRowActions = useCallback((node: DataNode) => (
    callbackRef.current.renderNodeActions?.(node)
      ?? (node.type === "folder" ? callbackRef.current.renderFolderActions?.(node) : null)
  ), []);
  const selectedPathsRef = useRef(selectedPaths);
  const selectedDragNodesRef = useRef(selectedDragNodes);
  const draggedNodesRef = useRef(draggedNodes);
  selectedPathsRef.current = selectedPaths;
  selectedDragNodesRef.current = selectedDragNodes;
  draggedNodesRef.current = draggedNodes;
  const dragCallbacksRef = useRef({ onImportFiles, onMoveNode, onMoveNodes });
  dragCallbacksRef.current = { onImportFiles, onMoveNode, onMoveNodes };

  const clearDragState = useCallback(() => {
    setDraggedNodes([]);
    setDropTarget(null);
  }, []);

  const setNextDropTarget = useCallback((
    rowPath: string | null,
    targetFolderPath: string | null,
    mode: "folder" | "parent",
    valid: boolean,
  ) => {
    setDropTarget((current) => {
      if (
        current?.rowPath === rowPath
        && current.targetFolderPath === targetFolderPath
        && current.mode === mode
        && current.valid === valid
      ) {
        return current;
      }
      return { rowPath, targetFolderPath, mode, valid };
    });
  }, []);

  const beginNodeDrag = useCallback((event: ReactDragEvent<HTMLButtonElement>, node: DataNode) => {
    if (!moveEnabled) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copyMove";
    const movingNodes = selectedPathsRef.current.has(node.path) && selectedDragNodesRef.current.length > 0
      ? selectedDragNodesRef.current
      : [node];
    event.dataTransfer.setData(EXPLORER_TREE_NODE_DRAG_TYPE, movingNodes.map((item) => item.path).join("\n"));
    event.dataTransfer.setData("text/plain", movingNodes.map((item) => item.path).join("\n"));
    setDraggedNodes(movingNodes);
    setDropTarget(null);
  }, [moveEnabled]);

  const dragOverRow = useCallback((
    event: ReactDragEvent<HTMLElement>,
    rowPath: string | null,
    targetFolderPath: string | null,
    mode: "folder" | "parent",
  ) => {
    if (importEnabled && hasDataTransferFiles(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setNextDropTarget(rowPath, targetFolderPath, mode, true);
      return true;
    }

    const currentDraggedNodes = draggedNodesRef.current;
    if (!moveEnabled || currentDraggedNodes.length === 0) return false;

    const valid = isValidMoveTargetForNodes(currentDraggedNodes, targetFolderPath);
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = valid ? "move" : "none";
    setNextDropTarget(rowPath, targetFolderPath, mode, valid);
    return valid;
  }, [importEnabled, moveEnabled, setNextDropTarget]);

  const dragLeaveRow = useCallback((event: ReactDragEvent<HTMLElement>, rowPath: string | null) => {
    event.stopPropagation();
  }, []);

  const dropOnRow = useCallback((event: ReactDragEvent<HTMLElement>, targetFolderPath: string | null) => {
    const importedFiles = getDataTransferFiles(event.dataTransfer);
    if (importEnabled && importedFiles.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      void Promise.resolve(dragCallbacksRef.current.onImportFiles?.(importedFiles, targetFolderPath)).catch((error) => {
        console.error("Unable to import dropped files:", error);
      });
      return;
    }

    const currentDraggedNodes = draggedNodesRef.current;
    if (!moveEnabled || currentDraggedNodes.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    const movingNodes = currentDraggedNodes;
    const valid = isValidMoveTargetForNodes(movingNodes, targetFolderPath);
    clearDragState();
    if (!valid) return;

    const moveResult = dragCallbacksRef.current.onMoveNodes
      ? dragCallbacksRef.current.onMoveNodes(movingNodes, targetFolderPath)
      : Promise.all(movingNodes.map((node) => dragCallbacksRef.current.onMoveNode?.(node, targetFolderPath)));
    void Promise.resolve(moveResult).catch((error) => {
      console.error("Unable to move explorer item:", error);
    });
  }, [clearDragState, importEnabled, moveEnabled]);

  const leaveTree = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!dropTarget || !didLeaveElementBounds(event)) return;
    setDropTarget(null);
  }, [dropTarget]);

  const dragController = useMemo<TreeDragController>(() => ({
    enabled: moveEnabled,
    onNodeDragStart: beginNodeDrag,
    onNodeDragEnd: clearDragState,
    onRowDragOver: dragOverRow,
    onRowDragLeave: dragLeaveRow,
    onRowDrop: dropOnRow,
  }), [
    beginNodeDrag,
    clearDragState,
    dragLeaveRow,
    dragOverRow,
    dropOnRow,
    moveEnabled,
  ]);

  const handleClipboardShortcut = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPrimaryModifierShortcut(event) || isEditableEventTarget(event.target)) return;

    const key = event.key.toLowerCase();
    const selectedNodes = selectedDragNodes;
    let command: (() => void | Promise<void>) | null = null;

    if (key === "c" && onCopyNodes && selectedNodes.length > 0) {
      command = () => onCopyNodes(selectedNodes);
    } else if (key === "x" && onCutNodes && selectedNodes.length > 0) {
      command = () => onCutNodes(selectedNodes);
    } else if (key === "v" && onPasteNodes) {
      command = () => onPasteNodes(currentFolderPath);
    } else if (key === "d" && onDuplicateNodes && selectedNodes.length > 0) {
      command = () => onDuplicateNodes(selectedNodes);
    }

    if (!command || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(command()).catch((error) => {
      console.error("Unable to run explorer clipboard command:", error);
    });
  }, [currentFolderPath, onCopyNodes, onCutNodes, onDuplicateNodes, onPasteNodes, selectedDragNodes]);

  const focusRowAtIndex = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      document.getElementById(getExplorerRowDomId(index))?.focus();
    });
  }, []);

  const handleTreeNavigation = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || isEditableEventTarget(event.target)) return;
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const targetPath = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-explorer-path]")?.dataset.explorerPath ?? null
      : null;
    const currentIndex = targetPath
      ? visibleModel.pathToIndex.get(targetPath) ?? activeIndex ?? -1
      : activeIndex ?? -1;
    const currentRow = currentIndex >= 0 ? visibleModel.rows[currentIndex] : null;
    let nextIndex: number | null = null;

    if (event.key === "Home") {
      nextIndex = findNavigableRowIndex(visibleModel.rows, 0, 1);
    } else if (event.key === "End") {
      nextIndex = findNavigableRowIndex(visibleModel.rows, visibleModel.rows.length - 1, -1);
    } else if (event.key === "ArrowDown") {
      nextIndex = findNavigableRowIndex(visibleModel.rows, Math.max(0, currentIndex + 1), 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = findNavigableRowIndex(visibleModel.rows, Math.max(0, currentIndex - 1), -1);
    } else if (currentRow?.kind === "node" && event.key === "ArrowRight") {
      if (currentRow.node.type === "folder" && !expandedPaths.has(currentRow.path)) {
        event.preventDefault();
        toggleFolder(currentRow.node, true);
        return;
      }
      nextIndex = findNavigableRowIndex(visibleModel.rows, currentIndex + 1, 1);
    } else if (currentRow?.kind === "node" && event.key === "ArrowLeft") {
      if (currentRow.node.type === "folder" && expandedPaths.has(currentRow.path)) {
        event.preventDefault();
        toggleFolder(currentRow.node, false);
        return;
      }
      nextIndex = currentRow.parentPath
        ? visibleModel.pathToIndex.get(currentRow.parentPath) ?? null
        : null;
    }

    if (nextIndex === null || nextIndex < 0) return;
    const nextRow = visibleModel.rows[nextIndex];
    if (!nextRow || nextRow.kind !== "node") return;
    event.preventDefault();
    event.stopPropagation();
    selectNode(nextRow.node);
    focusRowAtIndex(nextIndex);
  }, [activeIndex, expandedPaths, focusRowAtIndex, selectNode, toggleFolder, visibleModel]);

  const handleTreeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleClipboardShortcut(event);
    handleTreeNavigation(event);
  }, [handleClipboardShortcut, handleTreeNavigation]);

  return (
    <div
      className={`explorer-tree-shell ${showRoot ? "has-root" : "no-root"} ${scrollable ? "is-scrollable" : ""} ${draggedNodes.length > 0 ? "is-dragging-node" : ""} ${dropTarget && draggedNodes.length === 0 ? "is-importing-files" : ""}`}
      data-scroll-at-bottom={scrollEdgeState.atBottom ? "true" : "false"}
      data-scroll-at-top={scrollEdgeState.atTop ? "true" : "false"}
      style={{
        "--tree-edge-fade-bottom": scrollEdgeState.bottomFade.toFixed(3),
        "--tree-edge-fade-top": scrollEdgeState.topFade.toFixed(3),
      } as CSSProperties}
      onDragEnter={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
      onDragOver={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
      onDragLeave={dropEnabled ? leaveTree : undefined}
      onDrop={dropEnabled ? (event) => dragController.onRowDrop(event, null) : undefined}
      onContextMenu={onRootContextMenu}
      onKeyDown={handleTreeKeyDown}
    >
      {showRoot && (
        <div className="explorer-tree-root-scope">
          {onRootClick ? (
            <button
              className={`tree-row root root-command ${dropTarget?.rowPath === null && dropTarget.valid ? "drop-target" : ""} ${dropTarget?.rowPath === null && !dropTarget.valid ? "drop-invalid" : ""}`}
              type="button"
              style={{ "--depth": 0 } as CSSProperties}
              onDragEnter={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
              onDragOver={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
              onDragLeave={dropEnabled ? (event) => dragController.onRowDragLeave(event, null) : undefined}
              onDrop={dropEnabled ? (event) => dragController.onRowDrop(event, null) : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onRootClick(event);
              }}
            >
              {renderRootContent ? renderRootContent() : (
                <span className="tree-row-content">
                  <span className="tree-label">{rootLabel}</span>
                </span>
              )}
            </button>
          ) : (
            <div
              className={`tree-row root ${dropTarget?.rowPath === null && dropTarget.valid ? "drop-target" : ""} ${dropTarget?.rowPath === null && !dropTarget.valid ? "drop-invalid" : ""}`}
              style={{ "--depth": 0 } as CSSProperties}
              onDragEnter={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
              onDragOver={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
              onDragLeave={dropEnabled ? (event) => dragController.onRowDragLeave(event, null) : undefined}
              onDrop={dropEnabled ? (event) => dragController.onRowDrop(event, null) : undefined}
            >
              <span className="tree-row-content">
                <span className="tree-label">{rootLabel}</span>
                {renderRootActions && (
                  <span className="tree-row-actions root-actions" onClick={(event) => event.stopPropagation()}>
                    {renderRootActions()}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={`explorer-tree-scroll ${scrollable ? "is-scrollable" : ""}`}
        role="tree"
        aria-multiselectable="true"
        aria-activedescendant={activeIndex !== null ? getExplorerRowDomId(activeIndex) : undefined}
        onScroll={virtualWindow.onScroll}
      >
        <div className="explorer-tree-list">
          {rootError && nodes.length === 0 ? (
            <ExplorerTreeMetaRow depth={0}>{rootError}</ExplorerTreeMetaRow>
          ) : rootLoading && nodes.length === 0 ? (
            <ExplorerTreeMetaRow depth={0} loading>{loadingLabel}</ExplorerTreeMetaRow>
          ) : nodes.length === 0 ? (
            <ExplorerTreeMetaRow depth={0}>{emptyLabel}</ExplorerTreeMetaRow>
          ) : (
            <div
              className="explorer-tree-virtual-canvas"
              style={{ height: `${virtualWindow.totalHeight}px` }}
              data-visible-row-count={visibleModel.rows.length}
              data-mounted-row-count={visibleRows.length + (motionPlan?.ghosts.length ?? 0)}
              data-motion-generation={motionPlan?.generation}
            >
              {visibleRows.map((row) => (
                <div
                  key={row.key}
                  className="explorer-tree-virtual-row"
                  data-depth={row.depth}
                  style={{
                    "--depth": row.depth,
                    transform: `translateY(${row.index * EXPLORER_VIRTUAL_ROW_SIZE}px)`,
                  } as CSSProperties}
                >
                  <ExplorerVirtualMotionShell
                    depth={row.depth}
                    generation={motionPlan?.generation ?? 0}
                    instruction={motionPlan?.instructions.get(row.key)}
                  >
                    {row.kind === "meta" ? (
                      <ExplorerTreeMetaRow depth={row.depth} loading={row.loading}>{row.label}</ExplorerTreeMetaRow>
                    ) : (
                      <TreeNodeRow
                        row={row}
                        isExpanded={row.node.type === "folder" && expandedPaths.has(row.path)}
                        focusable={activePath ? activePath === row.path : row.index === firstNavigableIndex}
                        interaction={selectExplorerRowInteraction(row.path, rowStateSources)}
                        fileIconTheme={fileIconTheme}
                        onToggleFolder={toggleFolder}
                        onSelectNode={selectNode}
                        dragController={dragController}
                        hasNodeContextMenu={Boolean(onNodeContextMenu)}
                        onNodeContextMenu={openNodeContextMenu}
                        renderRowActions={renderNodeRowActions}
                      />
                    )}
                  </ExplorerVirtualMotionShell>
                </div>
              ))}
              {motionPlan?.ghosts.map(({ row, top }) => (
                <div
                  key={`exit:${motionPlan.generation}:${row.key}`}
                  className="explorer-tree-virtual-row explorer-tree-exit-ghost"
                  data-depth={row.depth}
                  style={{
                    "--depth": row.depth,
                    transform: `translateY(${top}px)`,
                  } as CSSProperties}
                  aria-hidden="true"
                >
                  <ExplorerVirtualMotionShell
                    depth={row.depth}
                    generation={motionPlan.generation}
                    exit
                  >
                    <ExplorerExitGhostRow
                      row={row}
                      expandedPaths={expandedPaths}
                      fileIconTheme={fileIconTheme}
                    />
                  </ExplorerVirtualMotionShell>
                </div>
              ))}
            </div>
          )}
          {renderListEnd?.()}
        </div>
      </div>
    </div>
  );
}

type TreeNodeRowProps = {
  row: ExplorerVisibleNodeRow;
  isExpanded: boolean;
  focusable: boolean;
  interaction: ExplorerRowInteractionState;
  fileIconTheme: FileIconThemeId;
  onToggleFolder: (node: DataNode, expanded: boolean) => void;
  onSelectNode: ExplorerTreeProps["onSelectNode"];
  dragController: TreeDragController;
  hasNodeContextMenu: boolean;
  onNodeContextMenu: NonNullable<ExplorerTreeProps["onNodeContextMenu"]>;
  renderRowActions: (node: DataNode) => ReactNode;
};

const TreeNodeRow = memo(function TreeNodeRow({
  row,
  isExpanded,
  focusable,
  interaction,
  fileIconTheme,
  onToggleFolder,
  onSelectNode,
  dragController,
  hasNodeContextMenu,
  onNodeContextMenu,
  renderRowActions,
}: TreeNodeRowProps) {
  const { node, depth, siblingDisplayNameCounts } = row;
  const isFolder = node.type === "folder";
  const hoverExpandTimer = useRef<number | null>(null);
  const rowActions = renderRowActions(node);
  const displayName = useMemo(() => getExplorerDisplayName(node), [node.name, node.type]);
  const showExtensionDisambiguator = Boolean(
    displayName.extension
      && (siblingDisplayNameCounts.get(getDisplayNameKey(displayName.primary)) ?? 0) > 1,
  );

  const toggleCurrentFolder = useCallback(() => {
    if (!isFolder) return;
    onToggleFolder?.(node, !isExpanded);
  }, [isExpanded, isFolder, node, onToggleFolder]);

  const clearHoverExpandTimer = useCallback(() => {
    if (hoverExpandTimer.current === null) return;
    window.clearTimeout(hoverExpandTimer.current);
    hoverExpandTimer.current = null;
  }, []);

  useLayoutEffect(() => clearHoverExpandTimer, [clearHoverExpandTimer]);

  const scheduleHoverExpand = useCallback(() => {
    if (!isFolder || isExpanded || hoverExpandTimer.current !== null) return;
    hoverExpandTimer.current = window.setTimeout(() => {
      hoverExpandTimer.current = null;
      onToggleFolder?.(node, true);
    }, FOLDER_HOVER_EXPAND_MS);
  }, [isExpanded, isFolder, node, onToggleFolder]);

  const getDropIntent = useCallback((event: ReactDragEvent<HTMLElement>): {
    targetFolderPath: string | null;
    mode: "folder" | "parent";
  } => {
    if (!isFolder) {
      return { targetFolderPath: getParentPath(node.path), mode: "parent" };
    }

    if (isPointerInFolderPeerDropZone(event)) {
      return { targetFolderPath: getParentPath(node.path), mode: "parent" };
    }

    return { targetFolderPath: node.path, mode: "folder" };
  }, [isFolder, node.path]);

  return (
    <button
      id={getExplorerRowDomId(row.index)}
      className={`tree-row ${isFolder ? "folder" : "file"} ${interaction.selected ? "selected" : ""} ${interaction.active ? "active" : ""} ${interaction.cut ? "clipboard-cut" : ""} ${interaction.loading ? "loading" : ""} ${interaction.dragging ? "dragging" : ""} ${interaction.dropOver ? "drop-target" : ""} ${interaction.dropParentOver ? "drop-parent-target" : ""} ${interaction.dropInvalid ? "drop-invalid" : ""} ${node.status ? `status-${node.status}` : ""}`}
      type="button"
      role="treeitem"
      data-explorer-path={node.path}
      draggable={dragController.enabled}
      tabIndex={focusable ? 0 : -1}
      aria-level={row.depth + 1}
      aria-posinset={row.positionInSet}
      aria-setsize={row.setSize}
      aria-current={interaction.active ? "true" : undefined}
      aria-selected={interaction.selected || undefined}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-busy={interaction.loading || undefined}
      aria-grabbed={interaction.dragging ? "true" : undefined}
      aria-label={interaction.cut ? `${node.name}, cut` : node.name}
      title={displayName.hidden || showExtensionDisambiguator ? node.name : undefined}
      onDragStart={(event) => dragController.onNodeDragStart(event, node)}
      onDragEnd={dragController.onNodeDragEnd}
      onDragEnter={(event) => {
        const dropIntent = getDropIntent(event);
        const validTarget = dragController.onRowDragOver(event, node.path, dropIntent.targetFolderPath, dropIntent.mode);
        if (isFolder && dropIntent.mode === "folder" && validTarget) scheduleHoverExpand();
      }}
      onDragOver={(event) => {
        const dropIntent = getDropIntent(event);
        const validTarget = dragController.onRowDragOver(event, node.path, dropIntent.targetFolderPath, dropIntent.mode);
        if (isFolder && dropIntent.mode === "folder" && validTarget) scheduleHoverExpand();
      }}
      onDragLeave={(event) => {
        clearHoverExpandTimer();
        dragController.onRowDragLeave(event, node.path);
      }}
      onDrop={(event) => {
        clearHoverExpandTimer();
        const dropIntent = getDropIntent(event);
        dragController.onRowDrop(event, dropIntent.targetFolderPath);
      }}
      onClick={(event) => {
        event.stopPropagation();
        const intent = getSelectionIntent(event);
        onSelectNode(node, intent);
        if (isFolder && !intent.additive && !intent.range) toggleCurrentFolder();
      }}
      onContextMenu={hasNodeContextMenu ? (event) => {
        event.stopPropagation();
        if (!interaction.selected) onSelectNode(node);
        onNodeContextMenu(node, event);
      } : undefined}
      style={{ "--depth": depth } as CSSProperties}
    >
      <span className="tree-row-content">
        <span
          className="tree-icon-slot"
          onClick={(event) => {
            if (!isFolder) return;
            event.stopPropagation();
            toggleCurrentFolder();
          }}
        >
          {isFolder ? (
            <TreeDisclosureMarker expanded={isExpanded} />
          ) : (
            <FileGlyphIcon name={node.name} type={node.type} size={18} theme={fileIconTheme} />
          )}
        </span>
        <span className="tree-label">
          <span className="tree-label-primary">{displayName.primary}</span>
          {showExtensionDisambiguator && (
            <span className="tree-label-extension" aria-hidden="true">
              {displayName.extension}
            </span>
          )}
        </span>
        {node.status && node.status !== "clean" && (
          <span className={`tree-status ${node.status}`}>{shortStatus(node.status)}</span>
        )}
        {interaction.loading && (
          <DotsLoader
            size="sm"
            className="tree-loading-indicator"
            ariaHidden
          />
        )}
        {rowActions && (
          <span className="tree-row-actions" onClick={(event) => event.stopPropagation()}>
            {rowActions}
          </span>
        )}
      </span>
    </button>
  );
}, areTreeNodeRowPropsEqual);

function areTreeNodeRowPropsEqual(left: TreeNodeRowProps, right: TreeNodeRowProps): boolean {
  return left.row === right.row
    && left.isExpanded === right.isExpanded
    && left.focusable === right.focusable
    && equalExplorerRowInteraction(left.interaction, right.interaction)
    && left.fileIconTheme === right.fileIconTheme
    && left.onToggleFolder === right.onToggleFolder
    && left.onSelectNode === right.onSelectNode
    && left.dragController === right.dragController
    && left.hasNodeContextMenu === right.hasNodeContextMenu
    && left.onNodeContextMenu === right.onNodeContextMenu
    && left.renderRowActions === right.renderRowActions;
}

function ExplorerVirtualMotionShell({
  depth,
  generation,
  instruction,
  exit = false,
  children,
}: {
  depth: number;
  generation: number;
  instruction?: ExplorerRowMotionInstruction;
  exit?: boolean;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || (!instruction && !exit)) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (typeof element.animate !== "function") return undefined;

    const rowDelta = instruction?.kind === "move"
      ? Math.abs(instruction.offsetY) / EXPLORER_VIRTUAL_ROW_SIZE
      : 0;
    const duration = exit
      ? 145
      : instruction?.kind === "move"
        ? Math.min(220, 150 + rowDelta * 5)
        : 165;
    const keyframes: Keyframe[] = exit
      ? [
          { opacity: 1, transform: "translateY(0) scale(1)" },
          { opacity: 0, transform: "translateY(-5px) scale(0.985)" },
        ]
      : instruction?.kind === "move"
        ? [
            { transform: `translateY(${instruction.offsetY}px)` },
            { transform: "translateY(0)" },
          ]
        : [
            { opacity: 0, transform: "translateY(-6px) scale(0.985)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ];
    const animation = element.animate(keyframes, {
      duration,
      easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
      fill: "both",
    });
    return () => animation.cancel();
  }, [exit, generation, instruction]);

  return (
    <div
      ref={elementRef}
      className="explorer-tree-motion-shell"
      data-depth={depth}
      data-explorer-motion={exit ? "exit" : instruction?.kind}
      style={{ "--depth": depth } as CSSProperties}
    >
      {children}
    </div>
  );
}

function ExplorerExitGhostRow({
  row,
  expandedPaths,
  fileIconTheme,
}: {
  row: ExplorerVisibleRow;
  expandedPaths: ReadonlySet<string>;
  fileIconTheme: FileIconThemeId;
}) {
  if (row.kind === "meta") {
    return <ExplorerTreeMetaRow depth={row.depth} loading={row.loading}>{row.label}</ExplorerTreeMetaRow>;
  }

  const displayName = getExplorerDisplayName(row.node);
  const showExtensionDisambiguator = Boolean(
    displayName.extension
      && (row.siblingDisplayNameCounts.get(getDisplayNameKey(displayName.primary)) ?? 0) > 1,
  );
  const isFolder = row.node.type === "folder";
  return (
    <div
      className={`tree-row explorer-tree-exit-ghost-row ${isFolder ? "folder" : "file"}`}
      style={{ "--depth": row.depth } as CSSProperties}
    >
      <span className="tree-row-content">
        <span className="tree-icon-slot">
          {isFolder ? (
            <TreeDisclosureMarker expanded={expandedPaths.has(row.path)} />
          ) : (
            <FileGlyphIcon name={row.node.name} type={row.node.type} size={18} theme={fileIconTheme} />
          )}
        </span>
        <span className="tree-label">
          <span className="tree-label-primary">{displayName.primary}</span>
          {showExtensionDisambiguator && (
            <span className="tree-label-extension" aria-hidden="true">{displayName.extension}</span>
          )}
        </span>
        {row.node.status && row.node.status !== "clean" && (
          <span className={`tree-status ${row.node.status}`}>{shortStatus(row.node.status)}</span>
        )}
      </span>
    </div>
  );
}

function TreeDisclosureMarker({
  expanded = false,
  size = 12,
}: {
  expanded?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="tree-disclosure-marker"
      style={{
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      }}
    >
      <path d="M4 2.5 7.5 6 4 9.5" />
    </svg>
  );
}

function ExplorerTreeMetaRow({
  depth,
  loading = false,
  children,
}: {
  depth: number;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`tree-meta-row ${loading ? "loading" : ""}`} style={{ "--depth": depth } as CSSProperties}>
      {loading ? (
        <InlineLoading
          label={children}
          size="sm"
          indicator="dots"
          className="tree-meta-loading"
        />
      ) : (
        <span>{children}</span>
      )}
    </div>
  );
}

function shortStatus(status: NonNullable<DataNode["status"]>) {
  if (status === "modified") return "M";
  if (status === "created") return "A";
  if (status === "deleted") return "D";
  if (status === "moved") return "R";
  return "";
}

function isValidMoveTarget(node: DataNode, targetFolderPath: string | null): boolean {
  if (getParentPath(node.path) === targetFolderPath) return false;
  if (targetFolderPath === node.path) return false;
  if (targetFolderPath?.startsWith(`${node.path}/`)) return false;
  return true;
}

function isValidMoveTargetForNodes(nodes: DataNode[], targetFolderPath: string | null): boolean {
  if (nodes.length === 0) return false;
  return nodes.every((node) => isValidMoveTarget(node, targetFolderPath));
}

function collectTopLevelSelectedNodes(
  nodeIndex: ReadonlyMap<string, DataNode>,
  selectedPaths: ReadonlySet<string>,
): DataNode[] {
  if (selectedPaths.size === 0) return [];
  const selectedNodes = [...selectedPaths]
    .map((path) => nodeIndex.get(path) ?? null)
    .filter((node): node is DataNode => node !== null);
  return selectedNodes.filter((node) => !selectedNodes.some((candidate) => (
    candidate.path !== node.path && node.path.startsWith(`${candidate.path}/`)
  )));
}

function findNavigableRowIndex(
  rows: readonly ExplorerVisibleRow[],
  startIndex: number,
  direction: 1 | -1,
): number | null {
  for (
    let index = Math.min(Math.max(0, startIndex), Math.max(0, rows.length - 1));
    index >= 0 && index < rows.length;
    index += direction
  ) {
    if (rows[index]?.kind === "node") return index;
  }
  return null;
}

function getExplorerRowDomId(index: number): string {
  return `${EXPLORER_ROW_DOM_ID_PREFIX}-${index}`;
}

function getSelectionIntent(event: ReactMouseEvent<HTMLElement>): ExplorerSelectionIntent {
  return {
    additive: event.metaKey || event.ctrlKey,
    range: event.shiftKey,
  };
}

function isPrimaryModifierShortcut(event: ReactKeyboardEvent<HTMLElement>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

function getParentPath(path: string): string | null {
  if (!path.includes("/")) return null;
  return path.slice(0, path.lastIndexOf("/"));
}

function didLeaveElementBounds(event: ReactDragEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom
  );
}

function hasDataTransferFiles(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.files.length > 0) return true;
  if (Array.from(dataTransfer.types).includes("Files")) return true;
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function getDataTransferFiles(dataTransfer: DataTransfer): File[] {
  const files = Array.from(dataTransfer.files).filter((file) => file.name.length > 0);
  if (files.length > 0) return files;

  return Array.from(dataTransfer.items)
    .map((item) => (item.kind === "file" ? item.getAsFile() : null))
    .filter((file): file is File => Boolean(file && file.name.length > 0));
}

function isPointerInFolderPeerDropZone(event: ReactDragEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  const peerZoneTop = rect.bottom - rect.height * FOLDER_PEER_DROP_ZONE_RATIO;
  return event.clientY >= peerZoneTop;
}

const EMPTY_PATH_SET: ReadonlySet<string> = new Set();
