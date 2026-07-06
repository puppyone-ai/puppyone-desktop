import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DataNode } from "../core/types";
import { getMatchedExtension } from "../core/fileFormats";
import { FileGlyphIcon, type FileIconThemeId } from "../file/fileIcons";
import { DotsLoader, InlineLoading } from "../primitives/LoadingIndicator";
import { useScrollableState } from "../primitives/useScrollableClass";

export type ExplorerTreeProps = {
  nodes: DataNode[];
  activePath: string | null;
  selectedPaths?: ReadonlySet<string>;
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
  draggedNodes: DataNode[];
  dropTarget: TreeDropTarget;
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

const EXPLORER_TREE_ROW_HEIGHT = 30;
const EXPLORER_TREE_ROW_GAP = 2;
const EXPLORER_TREE_INDENT = 24;
const EXPLORER_TREE_ROW_MARGIN_X = 6;
const EXPLORER_TREE_CONTENT_INSET = 8;
const EXPLORER_TREE_ROW_MARGIN_Y = EXPLORER_TREE_ROW_GAP / 2;
const EXPLORER_TREE_LINE_OVERDRAW = 2;
const EXPLORER_TREE_META_OFFSET = 14;
const ROOT_HEADER_TOP_PADDING = 5;
const SUBTREE_MOTION_MIN_MS = 170;
const SUBTREE_MOTION_MAX_MS = 340;
const SUBTREE_MOTION_PX_FACTOR = 0.28;
const SUBTREE_MOTION_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
export const EXPLORER_TREE_NODE_DRAG_TYPE = "application/x-puppyone-data-node-path";
const FOLDER_HOVER_EXPAND_MS = 620;
const FOLDER_PEER_DROP_ZONE_RATIO = 0.34;

export function ExplorerTree({
  nodes,
  activePath,
  selectedPaths = EMPTY_PATH_SET,
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
  const rootDisplayNameCounts = useMemo(() => buildDisplayNameCounts(nodes), [nodes]);
  const selectedDragNodes = useMemo(() => collectTopLevelSelectedNodes(nodes, selectedPaths), [nodes, selectedPaths]);
  const moveEnabled = Boolean(canMoveNodes && (onMoveNodes || onMoveNode));
  const importEnabled = Boolean(onImportFiles);
  const dropEnabled = moveEnabled || importEnabled;
  const resolvedLoadingPaths = useMemo<ReadonlySet<string>>(
    () => loadingPaths ?? (loadingPath ? new Set([loadingPath]) : EMPTY_PATH_SET),
    [loadingPath, loadingPaths],
  );
  const scrollable = useScrollableState(scrollRef, {
    dependencies: [nodes, rootError, rootLoading, resolvedLoadingPaths, expandedPaths],
  });

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
    const movingNodes = selectedPaths.has(node.path) && selectedDragNodes.length > 0
      ? selectedDragNodes
      : [node];
    event.dataTransfer.setData(EXPLORER_TREE_NODE_DRAG_TYPE, movingNodes.map((item) => item.path).join("\n"));
    event.dataTransfer.setData("text/plain", movingNodes.map((item) => item.path).join("\n"));
    setDraggedNodes(movingNodes);
    setDropTarget(null);
  }, [moveEnabled, selectedDragNodes, selectedPaths]);

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

    if (!moveEnabled || draggedNodes.length === 0) return false;

    const valid = isValidMoveTargetForNodes(draggedNodes, targetFolderPath);
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = valid ? "move" : "none";
    setNextDropTarget(rowPath, targetFolderPath, mode, valid);
    return valid;
  }, [draggedNodes, importEnabled, moveEnabled, setNextDropTarget]);

  const dragLeaveRow = useCallback((event: ReactDragEvent<HTMLElement>, rowPath: string | null) => {
    event.stopPropagation();
  }, []);

  const dropOnRow = useCallback((event: ReactDragEvent<HTMLElement>, targetFolderPath: string | null) => {
    const importedFiles = getDataTransferFiles(event.dataTransfer);
    if (importEnabled && importedFiles.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      void Promise.resolve(onImportFiles?.(importedFiles, targetFolderPath)).catch((error) => {
        console.error("Unable to import dropped files:", error);
      });
      return;
    }

    if (!moveEnabled || draggedNodes.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    const movingNodes = draggedNodes;
    const valid = isValidMoveTargetForNodes(movingNodes, targetFolderPath);
    clearDragState();
    if (!valid) return;

    const moveResult = onMoveNodes
      ? onMoveNodes(movingNodes, targetFolderPath)
      : Promise.all(movingNodes.map((node) => onMoveNode?.(node, targetFolderPath)));
    void Promise.resolve(moveResult).catch((error) => {
      console.error("Unable to move explorer item:", error);
    });
  }, [clearDragState, draggedNodes, importEnabled, moveEnabled, onImportFiles, onMoveNode, onMoveNodes]);

  const leaveTree = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!dropTarget || !didLeaveElementBounds(event)) return;
    setDropTarget(null);
  }, [dropTarget]);

  const dragController = useMemo<TreeDragController>(() => ({
    enabled: moveEnabled,
    draggedNodes,
    dropTarget,
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
    draggedNodes,
    dropOnRow,
    dropTarget,
    moveEnabled,
  ]);

  return (
    <div
      className={`explorer-tree-shell ${showRoot ? "has-root" : "no-root"} ${scrollable ? "is-scrollable" : ""} ${draggedNodes.length > 0 ? "is-dragging-node" : ""} ${dropTarget && draggedNodes.length === 0 ? "is-importing-files" : ""}`}
      onDragEnter={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
      onDragOver={dropEnabled ? (event) => dragController.onRowDragOver(event, null, null, "folder") : undefined}
      onDragLeave={dropEnabled ? leaveTree : undefined}
      onDrop={dropEnabled ? (event) => dragController.onRowDrop(event, null) : undefined}
      onContextMenu={onRootContextMenu}
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

      <div ref={scrollRef} className={`explorer-tree-scroll ${scrollable ? "is-scrollable" : ""}`}>
        <div className="explorer-tree-list">
          {rootError && nodes.length === 0 ? (
            <ExplorerTreeMetaRow depth={0}>{rootError}</ExplorerTreeMetaRow>
          ) : rootLoading && nodes.length === 0 ? (
            <ExplorerTreeMetaRow depth={0} loading>{loadingLabel}</ExplorerTreeMetaRow>
          ) : nodes.length === 0 ? (
            <ExplorerTreeMetaRow depth={0}>{emptyLabel}</ExplorerTreeMetaRow>
          ) : (
            nodes.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                depth={0}
                siblingDisplayNameCounts={rootDisplayNameCounts}
                expandedPaths={expandedPaths}
                activePath={activePath}
                selectedPaths={selectedPaths}
                loadingPaths={resolvedLoadingPaths}
                emptyLabel={emptyLabel}
                loadingLabel={loadingLabel}
                fileIconTheme={fileIconTheme}
                onToggleFolder={onToggleFolder}
                onSelectNode={onSelectNode}
                dragController={dragController}
                onNodeContextMenu={onNodeContextMenu}
                renderFolderActions={renderFolderActions}
                renderNodeActions={renderNodeActions}
              />
            ))
          )}
          {renderListEnd?.()}
        </div>
      </div>
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  siblingDisplayNameCounts,
  expandedPaths,
  activePath,
  selectedPaths,
  loadingPaths,
  emptyLabel,
  loadingLabel,
  fileIconTheme,
  onToggleFolder,
  onSelectNode,
  dragController,
  onNodeContextMenu,
  renderFolderActions,
  renderNodeActions,
}: {
  node: DataNode;
  depth: number;
  siblingDisplayNameCounts: Map<string, number>;
  expandedPaths: ReadonlySet<string>;
  activePath: string | null;
  selectedPaths: ReadonlySet<string>;
  loadingPaths: ReadonlySet<string>;
  emptyLabel: string;
  loadingLabel: string;
  fileIconTheme: FileIconThemeId;
  onToggleFolder?: (node: DataNode, expanded: boolean) => void;
  onSelectNode: ExplorerTreeProps["onSelectNode"];
  dragController: TreeDragController;
  onNodeContextMenu?: ExplorerTreeProps["onNodeContextMenu"];
  renderFolderActions?: (node: DataNode) => ReactNode;
  renderNodeActions?: (node: DataNode) => ReactNode;
}) {
  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expandedPaths.has(node.path);
  const hoverExpandTimer = useRef<number | null>(null);
  const active = activePath === node.path;
  const selected = selectedPaths.has(node.path);
  const loading = loadingPaths.has(node.path);
  const dragging = dragController.draggedNodes.some((draggedNode) => draggedNode.path === node.path);
  const dropMatchesRow = dragController.dropTarget?.rowPath === node.path;
  const dropOver = dropMatchesRow && dragController.dropTarget?.mode === "folder" && dragController.dropTarget.valid;
  const dropParentOver = dropMatchesRow && dragController.dropTarget?.mode === "parent" && dragController.dropTarget.valid;
  const dropInvalid = dropMatchesRow && !dragController.dropTarget?.valid;
  const children = useMemo(() => node.children ?? [], [node.children]);
  const childDisplayNameCounts = useMemo(() => buildDisplayNameCounts(children), [children]);
  const rowActions = renderNodeActions?.(node) ?? (isFolder ? renderFolderActions?.(node) : null);
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

  useEffect(() => clearHoverExpandTimer, [clearHoverExpandTimer]);

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
    <>
      <button
        className={`tree-row ${isFolder ? "folder" : "file"} ${selected ? "selected" : ""} ${active ? "active" : ""} ${loading ? "loading" : ""} ${dragging ? "dragging" : ""} ${dropOver ? "drop-target" : ""} ${dropParentOver ? "drop-parent-target" : ""} ${dropInvalid ? "drop-invalid" : ""} ${node.status ? `status-${node.status}` : ""}`}
        type="button"
        draggable={dragController.enabled}
        aria-current={active ? "true" : undefined}
        aria-selected={selected || undefined}
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-busy={loading || undefined}
        aria-grabbed={dragging ? "true" : undefined}
        aria-label={node.name}
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
          if (isFolder) {
            if (!intent.additive && !intent.range) toggleCurrentFolder();
            return;
          }
        }}
        onContextMenu={onNodeContextMenu ? (event) => {
          event.stopPropagation();
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
          {loading && (
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

      {isFolder && (
        <ExplorerSubtreePresence expanded={isExpanded} guideDepth={depth + 1}>
          {loading && children.length === 0 && (
            <ExplorerTreeMetaRow depth={depth + 1} loading>{loadingLabel}</ExplorerTreeMetaRow>
          )}
          {!loading && children.length === 0 && node.children && (
            <ExplorerTreeMetaRow depth={depth + 1}>{emptyLabel}</ExplorerTreeMetaRow>
          )}
          {children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              siblingDisplayNameCounts={childDisplayNameCounts}
              expandedPaths={expandedPaths}
              activePath={activePath}
              selectedPaths={selectedPaths}
              loadingPaths={loadingPaths}
              emptyLabel={emptyLabel}
              loadingLabel={loadingLabel}
              fileIconTheme={fileIconTheme}
              onToggleFolder={onToggleFolder}
              onSelectNode={onSelectNode}
              dragController={dragController}
              onNodeContextMenu={onNodeContextMenu}
              renderFolderActions={renderFolderActions}
              renderNodeActions={renderNodeActions}
            />
          ))}
        </ExplorerSubtreePresence>
      )}
    </>
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

function TreeSubtreeGuide({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return <span className="tree-subtree-guide" style={{ "--depth": depth } as CSSProperties} aria-hidden />;
}

function ExplorerSubtreePresence({
  expanded,
  guideDepth,
  children,
}: {
  expanded: boolean;
  guideDepth: number;
  children: ReactNode;
}) {
  const mountedOnceRef = useRef(false);
  const [renderSubtree, setRenderSubtree] = useState(expanded);

  useLayoutEffect(() => {
    if (expanded) setRenderSubtree(true);
  }, [expanded]);

  useEffect(() => {
    mountedOnceRef.current = true;
  }, []);

  if (!expanded && !renderSubtree) return null;

  return (
    <ExplorerSubtreeMotion
      visible={expanded}
      guideDepth={guideDepth}
      animateInitialEnter={mountedOnceRef.current}
      onExited={() => setRenderSubtree(false)}
    >
      {children}
    </ExplorerSubtreeMotion>
  );
}

function getSubtreeMotionDurationMs(fromHeight: number, toHeight: number): number {
  const distance = Math.abs(toHeight - fromHeight);
  return Math.round(
    Math.min(
      SUBTREE_MOTION_MAX_MS,
      Math.max(
        SUBTREE_MOTION_MIN_MS,
        SUBTREE_MOTION_MIN_MS + distance * SUBTREE_MOTION_PX_FACTOR,
      ),
    ),
  );
}

function ExplorerSubtreeMotion({
  visible,
  guideDepth,
  animateInitialEnter,
  onExited,
  children,
}: {
  visible: boolean;
  guideDepth: number;
  animateInitialEnter: boolean;
  onExited: () => void;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const onExitedRef = useRef(onExited);
  const mountedRef = useRef(false);
  const [height, setHeight] = useState<number | "auto">(() => (
    visible && !animateInitialEnter ? "auto" : 0
  ));
  const [durationMs, setDurationMs] = useState(SUBTREE_MOTION_MIN_MS);

  const cancelFrame = useCallback(() => {
    if (rafRef.current === null) return;
    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => cancelFrame, [cancelFrame]);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    cancelFrame();

    if (!mountedRef.current) {
      mountedRef.current = true;
      if (!visible) {
        setHeight(0);
        return;
      }
      if (!animateInitialEnter) {
        setHeight("auto");
        return;
      }
      const nextHeight = content.scrollHeight;
      setDurationMs(getSubtreeMotionDurationMs(0, nextHeight));
      setHeight(0);
      rafRef.current = window.requestAnimationFrame(() => {
        setHeight(nextHeight);
        rafRef.current = null;
      });
      return;
    }

    const currentHeight = wrapper.getBoundingClientRect().height;
    const nextHeight = visible ? content.scrollHeight : 0;

    if (!visible && Math.abs(currentHeight - nextHeight) < 1) {
      setHeight(0);
      onExitedRef.current();
      return;
    }

    setDurationMs(getSubtreeMotionDurationMs(currentHeight, nextHeight));
    setHeight(currentHeight);
    rafRef.current = window.requestAnimationFrame(() => {
      setHeight(nextHeight);
      rafRef.current = null;
    });
  }, [animateInitialEnter, cancelFrame, visible]);

  useEffect(() => {
    if (!visible || height === "auto" || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return undefined;

    let previousHeight = content.scrollHeight;
    const observer = new ResizeObserver(() => {
      const nextHeight = content.scrollHeight;
      if (Math.abs(nextHeight - previousHeight) < 1) return;
      previousHeight = nextHeight;

      cancelFrame();
      const currentHeight = wrapper.getBoundingClientRect().height;
      setDurationMs(getSubtreeMotionDurationMs(currentHeight, nextHeight));
      setHeight(currentHeight);
      rafRef.current = window.requestAnimationFrame(() => {
        setHeight(nextHeight);
        rafRef.current = null;
      });
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [cancelFrame, height, visible]);

  return (
    <div
      ref={wrapperRef}
      className="tree-subtree-motion"
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.propertyName !== "height") return;
        if (!visible) {
          onExitedRef.current();
          return;
        }
        setHeight("auto");
      }}
      style={{
        "--tree-motion-duration": `${durationMs}ms`,
        "--tree-motion-ease": SUBTREE_MOTION_EASE,
        height: height === "auto" ? "auto" : `${Math.max(0, height)}px`,
      } as CSSProperties}
    >
      <div ref={contentRef} className="tree-subtree-content">
        <TreeSubtreeGuide depth={guideDepth} />
        {children}
      </div>
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

function collectTopLevelSelectedNodes(nodes: DataNode[], selectedPaths: ReadonlySet<string>): DataNode[] {
  if (selectedPaths.size === 0) return [];
  const selectedNodes = collectSelectedNodes(nodes, selectedPaths);
  return selectedNodes.filter((node) => !selectedNodes.some((candidate) => (
    candidate.path !== node.path && node.path.startsWith(`${candidate.path}/`)
  )));
}

function collectSelectedNodes(nodes: DataNode[], selectedPaths: ReadonlySet<string>): DataNode[] {
  const selectedNodes: DataNode[] = [];
  for (const node of nodes) {
    if (selectedPaths.has(node.path)) selectedNodes.push(node);
    if (node.children) selectedNodes.push(...collectSelectedNodes(node.children, selectedPaths));
  }
  return selectedNodes;
}

function getSelectionIntent(event: ReactMouseEvent<HTMLElement>): ExplorerSelectionIntent {
  return {
    additive: event.metaKey || event.ctrlKey,
    range: event.shiftKey,
  };
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

function getExplorerDisplayName(node: DataNode): {
  primary: string;
  extension: string | null;
  hidden: boolean;
} {
  if (node.type === "folder") {
    return { primary: node.name, extension: null, hidden: false };
  }

  const extension = getDisplayExtension(node.name);
  if (!extension) {
    return { primary: node.name, extension: null, hidden: false };
  }

  const suffix = `.${extension}`;
  const primary = node.name.slice(0, -suffix.length);
  if (!primary) {
    return { primary: node.name, extension: null, hidden: false };
  }

  return { primary, extension, hidden: true };
}

function buildDisplayNameCounts(nodes: readonly DataNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const displayName = getExplorerDisplayName(node);
    const key = getDisplayNameKey(displayName.primary);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function getDisplayNameKey(value: string): string {
  return value.toLocaleLowerCase();
}

function getDisplayExtension(name: string): string | null {
  if (!name) return null;
  if (name.startsWith(".") && name.indexOf(".", 1) === -1) return null;

  const extension = getMatchedExtension(name);
  if (!extension) return null;

  const suffix = `.${extension}`;
  if (!name.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) return null;
  if (name.length <= suffix.length) return null;
  return extension;
}

const EMPTY_PATH_SET: ReadonlySet<string> = new Set();
