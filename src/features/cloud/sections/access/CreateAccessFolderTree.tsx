import { Check, FileText } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PageLoading } from "../../../../components/loading";
import type {
  DesktopCloudSession,
  DesktopCloudTreeEntry,
} from "../../../../lib/cloudApi";
import {
  formatTreePath,
  normalizeAccessPath,
} from "./createAccessModel";
import { useCreateAccessFolderEntries } from "./useCreateAccessFolderEntries";

export function CreateAccessFolderTree({
  projectId,
  cloudSession,
  apiBaseUrl,
  selectedPath,
  existingPathSet,
  initialExpandedPath,
  onCloudSessionChange,
  onSelect,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  selectedPath: string | null;
  existingPathSet: ReadonlySet<string>;
  initialExpandedPath?: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onSelect: (path: string) => void;
}) {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(["", ...ancestorPaths(initialExpandedPath ?? "")]),
  );

  useEffect(() => {
    if (!selectedPath) return;
    setExpandedPaths((current) => {
      const next = new Set(current);
      next.add("");
      ancestorPaths(selectedPath).forEach((path) => next.add(path));
      return next;
    });
  }, [selectedPath]);

  const isExpanded = (path: string) => expandedPaths.has(normalizeAccessPath(path));
  const toggleExpanded = (path: string) => {
    const normalized = normalizeAccessPath(path);
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      next.add("");
      return next;
    });
  };

  return (
    <section className="desktop-cloud-create-access-tree">
      <header>Choose from Files</header>
      <div className="desktop-cloud-create-access-tree-body">
        <TreeRootRow />
        <FolderChildren
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          parentPath=""
          depth={1}
          ancestorLastSiblings={[]}
          selectedPath={selectedPath}
          existingPathSet={existingPathSet}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          onSelect={onSelect}
          onCloudSessionChange={onCloudSessionChange}
        />
      </div>
    </section>
  );
}

export function TreeDisclosureMarker({ expanded = false, size = 12 }: { expanded?: boolean; size?: number }) {
  return (
    <svg
      className="desktop-cloud-create-access-disclosure"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <path d="M4 2.5 7.5 6 4 9.5" />
    </svg>
  );
}

function TreeRootRow() {
  return (
    <div className="desktop-cloud-create-access-tree-row root">
      <span className="desktop-cloud-create-access-tree-marker">
        <TreeDisclosureMarker expanded />
      </span>
      <span className="desktop-cloud-create-access-tree-name">Root</span>
      <AccessStatusText />
    </div>
  );
}

function FolderChildren({
  projectId,
  cloudSession,
  apiBaseUrl,
  parentPath,
  depth,
  ancestorLastSiblings,
  selectedPath,
  existingPathSet,
  isExpanded,
  onToggle,
  onSelect,
  onCloudSessionChange,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  parentPath: string;
  depth: number;
  ancestorLastSiblings: readonly boolean[];
  selectedPath: string | null;
  existingPathSet: ReadonlySet<string>;
  isExpanded: (path: string) => boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
}) {
  const { entries, loading, error } = useCreateAccessFolderEntries({
    projectId,
    cloudSession,
    apiBaseUrl,
    path: parentPath,
    onCloudSessionChange,
  });

  if (loading) {
    return (
      <TreeMessage depth={depth}>
        <PageLoading label="Loading" size="xs" variant="fill" style={{ minHeight: 0, width: "auto", height: "auto" }} />
      </TreeMessage>
    );
  }
  if (error) return <TreeMessage depth={depth}>Could not load this folder.</TreeMessage>;
  if (entries.length === 0) return <TreeMessage depth={depth}>Empty folder</TreeMessage>;

  return (
    <>
      {entries.map((entry, index) => {
        const normalizedPath = normalizeAccessPath(entry.path);
        const isLastSibling = index === entries.length - 1;
        if (entry.type !== "folder") {
          return (
            <FileRow
              key={entry.path || entry.name}
              entry={entry}
              depth={depth}
              isLastSibling={isLastSibling}
              ancestorLastSiblings={ancestorLastSiblings}
            />
          );
        }
        const expanded = isExpanded(normalizedPath);
        return (
          <div key={entry.path || entry.name}>
            <FolderRow
              entry={entry}
              depth={depth}
              isLastSibling={isLastSibling}
              ancestorLastSiblings={ancestorLastSiblings}
              expanded={expanded}
              selected={selectedPath === normalizedPath}
              alreadyExists={existingPathSet.has(normalizedPath)}
              onToggle={() => onToggle(normalizedPath)}
              onSelect={() => onSelect(normalizedPath)}
            />
            {expanded ? (
              <FolderChildren
                projectId={projectId}
                cloudSession={cloudSession}
                apiBaseUrl={apiBaseUrl}
                parentPath={normalizedPath}
                depth={depth + 1}
                ancestorLastSiblings={[...ancestorLastSiblings, isLastSibling]}
                selectedPath={selectedPath}
                existingPathSet={existingPathSet}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onCloudSessionChange={onCloudSessionChange}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function FolderRow({
  entry,
  depth,
  isLastSibling,
  ancestorLastSiblings,
  expanded,
  selected,
  alreadyExists,
  onToggle,
  onSelect,
}: {
  entry: DesktopCloudTreeEntry;
  depth: number;
  isLastSibling: boolean;
  ancestorLastSiblings: readonly boolean[];
  expanded: boolean;
  selected: boolean;
  alreadyExists: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="desktop-cloud-create-access-tree-row-wrap">
      <TreeGuides depth={depth} isLastSibling={isLastSibling} ancestorLastSiblings={ancestorLastSiblings} />
      <button
        className={`desktop-cloud-create-access-tree-row folder ${selected ? "selected" : ""}`}
        type="button"
        title={`${expanded ? "Collapse" : "Expand"} ${formatTreePath(entry.path)}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={onToggle}
      >
        <span className="desktop-cloud-create-access-tree-marker">
          <TreeDisclosureMarker expanded={expanded} />
        </span>
        <span className="desktop-cloud-create-access-tree-name">{entry.name}</span>
        <FolderRowStatus selected={selected} alreadyExists={alreadyExists} onSelect={onSelect} />
      </button>
    </div>
  );
}

function FileRow({
  entry,
  depth,
  isLastSibling,
  ancestorLastSiblings,
}: {
  entry: DesktopCloudTreeEntry;
  depth: number;
  isLastSibling: boolean;
  ancestorLastSiblings: readonly boolean[];
}) {
  return (
    <div className="desktop-cloud-create-access-tree-row-wrap">
      <TreeGuides depth={depth} isLastSibling={isLastSibling} ancestorLastSiblings={ancestorLastSiblings} />
      <div
        className="desktop-cloud-create-access-tree-row file"
        title={formatTreePath(entry.path)}
        aria-disabled="true"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <span className="desktop-cloud-create-access-tree-marker" />
        <FileText size={15} />
        <span className="desktop-cloud-create-access-tree-name">{entry.name}</span>
      </div>
    </div>
  );
}

function FolderRowStatus({
  selected,
  alreadyExists,
  onSelect,
}: {
  selected: boolean;
  alreadyExists: boolean;
  onSelect: () => void;
}) {
  if (alreadyExists) return <AccessStatusText onSelect={onSelect} />;
  return (
    <button
      className={`desktop-cloud-create-access-tree-status action ${selected ? "selected" : ""}`}
      type="button"
      title={selected ? "Selected folder" : "Select this folder"}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span>{selected ? "Selected" : "Select"}</span>
      <span aria-hidden="true">
        {selected ? <Check size={13} strokeWidth={2.6} /> : null}
      </span>
    </button>
  );
}

function AccessStatusText({ onSelect }: { onSelect?: () => void }) {
  if (!onSelect) {
    return <span className="desktop-cloud-create-access-tree-status">Has access</span>;
  }
  return (
    <button
      className="desktop-cloud-create-access-tree-status existing"
      type="button"
      title="Open this access"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      Has access
    </button>
  );
}

function TreeMessage({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div className="desktop-cloud-create-access-tree-message" style={{ paddingLeft: 8 + depth * 16 + 24 }}>
      {children}
    </div>
  );
}

function TreeGuides({
  depth,
  isLastSibling,
  ancestorLastSiblings,
}: {
  depth: number;
  isLastSibling: boolean;
  ancestorLastSiblings: readonly boolean[];
}) {
  if (depth <= 0) return null;
  const width = 8 + depth * 16 + 8;
  const rowHeight = 30;
  const lineOverdraw = 2;
  const lineHeight = rowHeight + lineOverdraw * 2;
  const hookY = lineOverdraw + rowHeight / 2;
  return (
    <svg
      className="desktop-cloud-create-access-tree-guides"
      width={width}
      height={lineHeight}
      viewBox={`0 0 ${width} ${lineHeight}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ width, height: lineHeight, top: -lineOverdraw } as CSSProperties}
    >
      {ancestorLastSiblings.map((last, index) => {
        if (last) return null;
        const level = index + 1;
        return <rect key={level} x={level * 16} y={0} width={1} height={lineHeight} fill="var(--po-tree-guide)" />;
      })}
      <rect x={depth * 16} y={0} width={1} height={isLastSibling ? hookY : lineHeight} fill="var(--po-tree-guide)" />
      <rect x={depth * 16} y={hookY} width={8} height={1} fill="var(--po-tree-guide)" />
    </svg>
  );
}

function ancestorPaths(path: string) {
  const parts = normalizeAccessPath(path).split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors;
}
