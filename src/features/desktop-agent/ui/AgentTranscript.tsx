import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CircleAlert, LoaderCircle, MessageSquareCode } from "lucide-react";
import type { AgentPart, AgentProjection, TimelineRow } from "../domain/agent-projection-types";
import { AgentPartRenderer } from "./AgentPartRenderer";

type AgentTranscriptProps = {
  projection: AgentProjection;
  loading: boolean;
  runtimeLabel?: string;
  initialScrollTop?: number;
  initialMeasurements?: Record<string, number>;
  initialPinned?: boolean;
  onViewportChange?: (scrollTop: number, measurements: Record<string, number>, pinned: boolean) => void;
  onViewChanges?: () => void;
};

const OVERSCAN_ROWS = 14;
const MAX_MOUNTED_ROWS = 120;
const DEFAULT_VIEWPORT_HEIGHT = 640;

export function AgentTranscript({
  projection,
  loading,
  runtimeLabel = "Agent",
  initialScrollTop = 0,
  initialMeasurements = {},
  initialPinned = true,
  onViewportChange,
  onViewChanges,
}: AgentTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const measurementsRef = useRef<Record<string, number>>({ ...initialMeasurements });
  const scrollTopRef = useRef(initialScrollTop);
  const pinnedRef = useRef(initialPinned);
  const offsetsRef = useRef<number[]>([]);
  const rowMetaRef = useRef(new Map<string, { index: number; estimatedHeight: number }>());
  const onViewportChangeRef = useRef(onViewportChange);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [pinned, setPinned] = useState(initialPinned);
  const timeline = useMemo(() => buildTimeline(projection), [projection]);
  const layout = useMemo(() => buildLayout(timeline.rows, measurementsRef.current, measurementRevision), [measurementRevision, timeline.rows]);
  const range = useMemo(() => visibleRange(layout.offsets, timeline.rows.length, scrollTop, viewportHeight), [layout.offsets, scrollTop, timeline.rows.length, viewportHeight]);
  const visibleRows = timeline.rows.slice(range.start, range.end);
  offsetsRef.current = layout.offsets;
  rowMetaRef.current = new Map(timeline.rows.map((row, index) => [row.id, { index, estimatedHeight: row.estimatedHeight }]));
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    element.scrollTop = initialScrollTop;
    scrollTopRef.current = element.scrollTop;
    pinnedRef.current = initialPinned;
    setScrollTop(element.scrollTop);
    setPinned(initialPinned);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(([entry]) => {
      if (entry?.contentRect.height > 0) setViewportHeight(entry.contentRect.height);
    }) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [initialPinned, initialScrollTop]);

  useEffect(() => {
    if (!pinned) return;
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    scrollTopRef.current = element.scrollTop;
    pinnedRef.current = true;
    setScrollTop(element.scrollTop);
    onViewportChangeRef.current?.(element.scrollTop, measurementsRef.current, true);
  }, [layout.totalHeight, pinned, projection.approvals.length, projection.questions.length]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nextScrollTop = element.scrollTop;
    const nextPinned = element.scrollHeight - nextScrollTop - element.clientHeight < 40;
    scrollTopRef.current = nextScrollTop;
    pinnedRef.current = nextPinned;
    setScrollTop(nextScrollTop);
    setPinned(nextPinned);
    onViewportChangeRef.current?.(nextScrollTop, measurementsRef.current, nextPinned);
  };

  const measure = useCallback((rowId: string, height: number) => {
    const meta = rowMetaRef.current.get(rowId);
    const previousHeight = measurementsRef.current[rowId] ?? meta?.estimatedHeight ?? 0;
    if (!Number.isFinite(height) || height <= 0 || Math.abs(previousHeight - height) < 1) return;
    measurementsRef.current[rowId] = height;
    if (
      !pinnedRef.current
      && meta
      && (offsetsRef.current[meta.index] ?? Number.POSITIVE_INFINITY) < scrollTopRef.current
    ) {
      const element = scrollRef.current;
      if (element) {
        const anchoredScrollTop = Math.max(0, scrollTopRef.current + height - previousHeight);
        element.scrollTop = anchoredScrollTop;
        scrollTopRef.current = anchoredScrollTop;
        setScrollTop(anchoredScrollTop);
        onViewportChangeRef.current?.(anchoredScrollTop, measurementsRef.current, false);
      }
    }
    setMeasurementRevision((value) => value + 1);
  }, []);

  return (
    <div className="desktop-agent-transcript-wrap">
      <div
        className="desktop-agent-transcript"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label={`${runtimeLabel} conversation`}
        tabIndex={0}
      >
        {projection.partialHistory && (
          <div className="desktop-agent-history-warning" role="status">
            <CircleAlert size={14} /> Part of this session history is unavailable.
          </div>
        )}
        {timeline.rows.length === 0 && !loading && (
          <div className="desktop-agent-empty">
            <div className="desktop-agent-empty-mark"><MessageSquareCode size={18} /></div>
            <strong>What should we build?</strong>
            <p>Ask about this workspace, plan a change, run commands, or edit files. You stay in control of approvals.</p>
          </div>
        )}
        {loading && timeline.rows.length === 0 && (
          <div className="desktop-agent-loading" role="status">
            <LoaderCircle size={15} className="desktop-agent-spin" /> Restoring session…
          </div>
        )}
        {timeline.rows.length > 0 && (
          <div className="desktop-agent-virtual-canvas" style={{ height: layout.totalHeight }}>
            {visibleRows.map((row, relativeIndex) => {
              const index = range.start + relativeIndex;
              const part = timeline.parts.get(row.partId);
              if (!part) return null;
              return (
                <MeasuredRow key={row.id} rowId={row.id} kind={part.kind} top={layout.offsets[index]} onMeasure={measure}>
                  <MemoAgentPartRenderer part={part} runtimeLabel={runtimeLabel} onViewChanges={onViewChanges} />
                </MeasuredRow>
              );
            })}
          </div>
        )}
        <div className="desktop-agent-announcer" aria-live="polite" aria-atomic="true">
          {projection.terminalState ? `${runtimeLabel} turn ${projection.terminalState}.` : ""}
        </div>
      </div>
      {!pinned && timeline.rows.length > 0 && (
        <button className="desktop-agent-jump-latest" type="button" onClick={() => {
          const element = scrollRef.current;
          if (element) element.scrollTop = element.scrollHeight;
          pinnedRef.current = true;
          setPinned(true);
        }}><ArrowDown size={13} /> Jump to latest</button>
      )}
    </div>
  );
}

const MemoAgentPartRenderer = memo(AgentPartRenderer);

function MeasuredRow({ rowId, kind, top, onMeasure, children }: {
  rowId: string;
  kind: AgentPart["kind"];
  top: number;
  onMeasure: (rowId: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const commit = () => onMeasure(rowId, element.getBoundingClientRect().height);
    commit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(commit) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [onMeasure, rowId]);
  return <div ref={ref} className="desktop-agent-virtual-row" data-kind={kind} style={{ transform: `translateY(${top}px)` }}>{children}</div>;
}

function buildTimeline(projection: AgentProjection) {
  if (projection.rows.length > 0 && projection.parts.length > 0) {
    return { rows: [...projection.rows].sort((left, right) => left.sequence - right.sequence), parts: new Map(projection.parts.map((part) => [part.id, part])) };
  }
  // Compatibility for consumers constructing the original projection shape.
  const parts: AgentPart[] = [
    ...projection.messages.map((message): AgentPart => ({ ...message, kind: message.role })),
    ...projection.activities.map((activity): AgentPart => ({ ...activity })),
  ].sort((left, right) => left.sequence - right.sequence);
  const rows: TimelineRow[] = parts.map((part) => ({
    id: `row:${part.id}`,
    partId: part.id,
    turnId: part.turnId,
    kind: part.kind,
    sequence: part.sequence,
    estimatedHeight: part.kind === "assistant"
      ? Math.min(640, 50 + Math.ceil(part.text.length / 64) * 20)
      : part.kind === "user"
        ? 64
        : 34,
  }));
  return { rows, parts: new Map(parts.map((part) => [part.id, part])) };
}

function buildLayout(rows: TimelineRow[], measurements: Record<string, number>, _measurementRevision: number) {
  const offsets = new Array<number>(rows.length + 1);
  offsets[0] = 0;
  for (let index = 0; index < rows.length; index += 1) {
    offsets[index + 1] = offsets[index] + (measurements[rows[index].id] || rows[index].estimatedHeight);
  }
  return { offsets, totalHeight: offsets.at(-1) ?? 0 };
}

function visibleRange(offsets: number[], count: number, scrollTop: number, viewportHeight: number) {
  const first = Math.max(0, lowerBound(offsets, Math.max(0, scrollTop)) - 1 - OVERSCAN_ROWS);
  const last = Math.min(count, lowerBound(offsets, scrollTop + viewportHeight) + OVERSCAN_ROWS);
  return { start: first, end: Math.min(last, first + MAX_MOUNTED_ROWS) };
}

function lowerBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export const agentTimelineLimits = Object.freeze({ maxMountedRows: MAX_MOUNTED_ROWS, streamBatchMs: 32 });
