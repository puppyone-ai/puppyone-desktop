import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScrollEdgeState } from "@puppyone/shared-ui";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { ArrowDown, CircleAlert, LoaderCircle } from "lucide-react";
import { PageLoading } from "../../../components/loading";
import type { AgentSubmissionStage } from "../application/agent-controller-state";
import type { AgentPart, AgentProjection, TimelineRow } from "../domain/agent-projection-types";
import { AgentMessagePart } from "./AgentMessagePart";
import { AgentPartRenderer } from "./AgentPartRenderer";
import {
  agentTranscriptFadeGeometry,
  agentVirtualCanvasGeometry,
  agentVirtualRowGeometry,
} from "./agent-runtime-geometry";

type AgentTranscriptProps = {
  projection: AgentProjection;
  loading: boolean;
  pendingPrompt?: string | null;
  submissionStage?: AgentSubmissionStage;
  working?: boolean;
  runtimeLabel?: string;
  initialScrollTop?: number;
  initialMeasurements?: Record<string, number>;
  initialPinned?: boolean;
  onViewportChange?: (scrollTop: number, measurements: Record<string, number>, pinned: boolean) => void;
  onOpenFile?: (path: string) => void;
};

const OVERSCAN_ROWS = 14;
const MAX_MOUNTED_ROWS = 120;
const DEFAULT_VIEWPORT_HEIGHT = 640;

function AgentTranscriptView({
  projection,
  loading,
  pendingPrompt = null,
  submissionStage = null,
  working = false,
  runtimeLabel: runtimeLabelProp,
  initialScrollTop = 0,
  initialMeasurements = {},
  initialPinned = true,
  onViewportChange,
  onOpenFile,
}: AgentTranscriptProps) {
  const { t } = useLocalization();
  const runtimeLabel = runtimeLabelProp || t("agent.name");
  const scrollRef = useRef<HTMLDivElement>(null);
  const measurementsRef = useRef<Record<string, number>>({ ...initialMeasurements });
  const scrollTopRef = useRef(initialScrollTop);
  const pinnedRef = useRef(initialPinned);
  const seenPartIdsRef = useRef(new Set<string>());
  const seededPartIdsRef = useRef(false);
  const previousTimelineRef = useRef({ rows: 0, sequence: 0 });
  const offsetsRef = useRef<number[]>([]);
  const rowMetaRef = useRef(new Map<string, { index: number; estimatedHeight: number }>());
  const onViewportChangeRef = useRef(onViewportChange);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [pinned, setPinned] = useState(initialPinned);
  const [unreadCount, setUnreadCount] = useState(0);
  const timeline = useMemo(() => buildTimeline(projection), [projection]);
  const layout = useMemo(() => buildLayout(timeline.rows, measurementsRef.current, measurementRevision), [measurementRevision, timeline.rows]);
  const range = useMemo(() => visibleRange(layout.offsets, timeline.rows.length, scrollTop, viewportHeight), [layout.offsets, scrollTop, timeline.rows.length, viewportHeight]);
  const visibleRows = timeline.rows.slice(range.start, range.end);
  const latestSequence = timeline.rows.at(-1)?.sequence ?? 0;
  const submissionStatus = agentSubmissionStatusLabel(submissionStage, runtimeLabel, t);
  const showThinking = !submissionStatus && shouldShowAgentThinking(projection, working);
  const workingStatus = submissionStatus || (showThinking ? t("agent.activity.thinking") : null);
  const hasLiveTail = Boolean(pendingPrompt) || Boolean(workingStatus);
  const scrollEdgeState = useScrollEdgeState(scrollRef, {
    revision: `${timeline.rows.length}:${layout.totalHeight}:${hasLiveTail ? "live" : "settled"}`,
  });
  if (!seededPartIdsRef.current) {
    for (const row of timeline.rows) seenPartIdsRef.current.add(row.partId);
    seededPartIdsRef.current = true;
    previousTimelineRef.current = { rows: timeline.rows.length, sequence: latestSequence };
  }
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
  }, [layout.totalHeight, pendingPrompt, pinned, projection.approvals.length, projection.questions.length, workingStatus]);

  useEffect(() => {
    const previous = previousTimelineRef.current;
    if (latestSequence <= previous.sequence && timeline.rows.length <= previous.rows) return;
    if (pinnedRef.current) setUnreadCount(0);
    else {
      const addedRows = Math.max(0, timeline.rows.length - previous.rows);
      setUnreadCount((current) => Math.min(99, current + Math.max(1, addedRows)));
    }
    previousTimelineRef.current = { rows: timeline.rows.length, sequence: latestSequence };
  }, [latestSequence, timeline.rows.length]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nextScrollTop = element.scrollTop;
    const nextPinned = element.scrollHeight - nextScrollTop - element.clientHeight < 80;
    scrollTopRef.current = nextScrollTop;
    pinnedRef.current = nextPinned;
    setScrollTop(nextScrollTop);
    setPinned(nextPinned);
    if (nextPinned) setUnreadCount(0);
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
    <div
      className="desktop-agent-transcript-wrap"
      data-scroll-at-top={scrollEdgeState.atTop ? "true" : "false"}
      style={agentTranscriptFadeGeometry(scrollEdgeState.topFade)}
    >
      <div
        className="desktop-agent-transcript"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label={t("agent.transcript.conversation", { agent: bidiIsolate(runtimeLabel) })}
        tabIndex={0}
      >
        {projection.partialHistory && (
          <div className="desktop-agent-history-warning" role="status">
            <CircleAlert size={14} /> {t("agent.transcript.partialHistory")}
          </div>
        )}
        {loading && timeline.rows.length === 0 && !hasLiveTail && (
          <PageLoading
            variant="fill"
            label={null}
            ariaLabel={t("agent.transcript.preparing", { agent: bidiIsolate(runtimeLabel) })}
            className="desktop-agent-startup-loading"
          />
        )}
        {timeline.rows.length > 0 && (
          <div className="desktop-agent-virtual-canvas" style={agentVirtualCanvasGeometry(layout.totalHeight)}>
            {visibleRows.map((row, relativeIndex) => {
              const index = range.start + relativeIndex;
              const part = timeline.parts.get(row.partId);
              if (!part) return null;
              const animate = !seenPartIdsRef.current.has(part.id);
              if (animate) seenPartIdsRef.current.add(part.id);
              return (
                <MeasuredRow key={row.id} rowId={row.id} kind={part.kind} top={layout.offsets[index]} animate={animate} onMeasure={measure}>
                  <MemoAgentPartRenderer part={part} runtimeLabel={runtimeLabel} onOpenFile={onOpenFile} />
                </MeasuredRow>
              );
            })}
          </div>
        )}
        {hasLiveTail && (
          <div className="desktop-agent-live-tail">
            {pendingPrompt && <AgentMessagePart part={{
              id: "optimistic:user",
              kind: "user",
              turnId: null,
              itemId: null,
              text: pendingPrompt,
              streaming: false,
              terminalState: null,
              sequence: Number.MAX_SAFE_INTEGER,
            }} runtimeLabel={runtimeLabel} />}
            {workingStatus && (
              <div
                className="desktop-agent-working-indicator"
                role="status"
                aria-label={showThinking
                  ? t("agent.transcript.thinkingAria", { agent: bidiIsolate(runtimeLabel) })
                  : workingStatus}
              >
                <LoaderCircle size={13} className="desktop-agent-spin" aria-hidden="true" />
                <span>{workingStatus}</span>
              </div>
            )}
          </div>
        )}
        <div className="desktop-agent-announcer" aria-live="polite" aria-atomic="true">
          {projection.terminalState
            ? t("agent.transcript.turnEnded", {
                agent: bidiIsolate(runtimeLabel),
                status: t(`agent.turn.status.${projection.terminalState}`),
              })
            : ""}
        </div>
      </div>
      {!pinned && timeline.rows.length > 0 && (
        <button className="desktop-agent-jump-latest" type="button" onClick={() => {
          const element = scrollRef.current;
          if (element) element.scrollTop = element.scrollHeight;
          pinnedRef.current = true;
          setPinned(true);
          setUnreadCount(0);
        }} aria-label={unreadCount
          ? t("agent.transcript.jumpLatestUnread", { count: unreadCount })
          : t("agent.transcript.jumpLatest")} title={t("agent.transcript.jumpLatest")}><ArrowDown size={15} /></button>
      )}
    </div>
  );
}

export const AgentTranscript = memo(AgentTranscriptView);
AgentTranscript.displayName = "AgentTranscript";

const MemoAgentPartRenderer = memo(AgentPartRenderer);

function MeasuredRow({ rowId, kind, top, animate, onMeasure, children }: {
  rowId: string;
  kind: AgentPart["kind"];
  top: number;
  animate: boolean;
  onMeasure: (rowId: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(animate);
  useEffect(() => setEntering(animate), [animate, rowId]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const commit = () => onMeasure(rowId, element.getBoundingClientRect().height);
    commit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(commit) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [onMeasure, rowId]);
  return <div
    ref={ref}
    className={`desktop-agent-virtual-row${entering ? " is-new" : ""}`}
    data-kind={kind}
    style={agentVirtualRowGeometry(top)}
    onAnimationEnd={() => setEntering(false)}
  >{children}</div>;
}

function buildTimeline(projection: AgentProjection) {
  let parts: AgentPart[];
  let rows: TimelineRow[];
  if (projection.rows.length > 0 && projection.parts.length > 0) {
    parts = [...projection.parts];
    rows = [...projection.rows];
  } else {
    // Compatibility for consumers constructing the original projection shape.
    parts = [
      ...projection.messages.map((message): AgentPart => ({ ...message, kind: message.role })),
      ...projection.activities.map((activity): AgentPart => ({ ...activity })),
    ].sort((left, right) => left.sequence - right.sequence);
    rows = parts.map((part) => ({
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
  }
  return appendTurnSummaries(rows, parts, projection.turns);
}

function appendTurnSummaries(rows: TimelineRow[], parts: AgentPart[], turns: AgentProjection["turns"]) {
  const nextRows = [...rows];
  const partMap = new Map(parts.map((part) => [part.id, part]));
  for (const turn of turns) {
    if (turn.status === "running" || turn.durationMs === null || turn.completedAtSequence === null) continue;
    const id = `turn-summary:${turn.id}`;
    const lastTurnSequence = nextRows.reduce((latest, row) => (
      row.turnId === turn.id ? Math.max(latest, row.sequence) : latest
    ), turn.completedAtSequence);
    const sequence = lastTurnSequence + 0.5;
    const part: AgentPart = {
      id,
      kind: "turn-summary",
      turnId: turn.id,
      itemId: null,
      durationMs: turn.durationMs,
      status: turn.status,
      sequence,
    };
    partMap.set(id, part);
    nextRows.push({
      id: `row:${id}`,
      partId: id,
      turnId: turn.id,
      kind: "turn-summary",
      sequence,
      estimatedHeight: 30,
    });
  }
  return {
    rows: nextRows.sort((left, right) => left.sequence - right.sequence),
    parts: partMap,
  };
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

/** Presentation-only working state; never fabricates or persists model text. */
export function shouldShowAgentThinking(
  projection: AgentProjection,
  working: boolean,
) {
  if (!working || projection.approvals.length > 0 || projection.questions.length > 0) return false;
  const turnId = projection.runningTurnId;
  if (!turnId) return false;
  const typedParts = projection.parts.length > 0
    ? projection.parts
    : [
      ...projection.messages.map((message): AgentPart => ({ ...message, kind: message.role })),
      ...projection.activities.map((activity): AgentPart => ({ ...activity })),
    ];
  const visible = typedParts
    .filter((part) => part.turnId === turnId && !["user", "usage", "permission", "question"].includes(part.kind))
    .sort((left, right) => left.sequence - right.sequence);
  const latest = visible.at(-1);
  if (!latest) return true;
  if (latest.kind === "assistant") return false;
  if (latest.kind === "error" || latest.kind === "warning") return false;
  if ("status" in latest && ["running", "pending", "in-progress", "waiting-for-user", "blocked"].includes(latest.status)) {
    return false;
  }
  // A completed tool/reasoning item while the turn is still active means the
  // native harness has resumed work and needs a fresh, non-persistent pulse.
  return true;
}

export function agentSubmissionStatusLabel(
  stage: AgentSubmissionStage,
  runtimeLabel: string,
  t: MessageFormatter,
) {
  if (stage === "preparing-session") {
    return t("agent.transcript.preparing", { agent: bidiIsolate(runtimeLabel) });
  }
  if (stage === "starting-turn") return t("agent.transcript.startingTurn");
  return null;
}

export const agentTimelineLimits = Object.freeze({ maxMountedRows: MAX_MOUNTED_ROWS, streamBatchMs: 32 });
