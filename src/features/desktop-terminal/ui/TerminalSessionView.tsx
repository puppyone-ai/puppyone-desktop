import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  classifyReferenceDataTransfer,
  hasFileReferenceDataTransferSource,
} from "@puppyone/shared-ui";
import type { TerminalRuntimeHandle } from "../runtime/terminalRuntime";

type TerminalSessionViewProps = {
  active: boolean;
  labelledBy?: string;
  panelId?: string;
  runtime: TerminalRuntimeHandle;
  workspacePath: string;
};

export function TerminalSessionView({
  active,
  labelledBy,
  panelId,
  runtime,
  workspacePath,
}: TerminalSessionViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(runtime.ready);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const unsubscribeReady = runtime.subscribeReady(setReady);
    runtime.mount(container);
    return () => {
      unsubscribeReady();
      runtime.unmount(container);
    };
  }, [runtime]);

  useLayoutEffect(() => {
    runtime.setActive(active);
  }, [active, runtime]);

  const handleTerminalDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasTerminalDroppablePaths(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleTerminalDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const paths = readTerminalDroppedPaths(event.dataTransfer, workspacePath);
    if (paths.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    runtime.write(paths.map(shellQuotePath).join(" "));
    runtime.focus();
  }, [runtime, workspacePath]);

  return (
    <div
      id={panelId}
      className={`desktop-terminal-session ${active ? "is-active" : ""} ${ready ? "is-ready" : ""}`}
      role={panelId ? "tabpanel" : undefined}
      aria-labelledby={labelledBy}
      aria-hidden={!active}
      aria-busy={active && !ready}
    >
      <div
        className="desktop-terminal-xterm"
        dir="ltr"
        ref={containerRef}
        onDragOver={handleTerminalDragOver}
        onDrop={handleTerminalDrop}
      />
    </div>
  );
}

function hasTerminalDroppablePaths(dataTransfer: DataTransfer) {
  return hasFileReferenceDataTransferSource(dataTransfer);
}

function readTerminalDroppedPaths(dataTransfer: DataTransfer, rootPath: string) {
  const source = classifyReferenceDataTransfer(dataTransfer);
  if (source.kind === "workspace-entries") {
    return source.entries.map((entry) => joinWorkspacePath(rootPath, entry.path));
  }
  if (source.kind === "files") {
    return source.files
      .map(readDroppedFilePath)
      .filter((pathValue): pathValue is string => Boolean(pathValue));
  }
  return [];
}

function readDroppedFilePath(file: File) {
  const bridgePath = window.puppyoneDesktop?.getPathForFile?.(file);
  const legacyPath = (file as File & { path?: string }).path;
  const pathValue = bridgePath || legacyPath || "";
  return pathValue.trim() || null;
}

function joinWorkspacePath(rootPath: string, nodePath: string) {
  const cleanNodePath = nodePath.trim().replace(/^[/\\]+/, "");
  if (!cleanNodePath) return rootPath;
  const separator = /[/\\]$/.test(rootPath) ? "" : "/";
  return `${rootPath}${separator}${cleanNodePath}`;
}

function shellQuotePath(pathValue: string) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(pathValue)) return pathValue;
  return `'${pathValue.replace(/'/g, "'\\''")}'`;
}
