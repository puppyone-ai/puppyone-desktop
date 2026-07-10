import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { AgentApprovalDock } from "./AgentApprovalDock";
import { AgentComposer } from "./AgentComposer";
import { AgentControls } from "./AgentControls";
import { AgentQuestionDock } from "./AgentQuestionDock";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { applyAgentEvent, applyAgentEvents, createAgentProjection } from "./agentProjection";
import type {
  AgentApprovalDecision,
  AgentEvent,
  AgentProviderInspection,
  AgentSessionMetadata,
  AgentSessionSnapshot,
} from "./agentTypes";

export type RightAgentPanelHandle = {
  newSession: () => void;
};

type RightAgentPanelProps = {
  workspace: Workspace;
  active: boolean;
  onViewChanges?: () => void;
  onRunningChange?: (running: boolean) => void;
  preferredModel?: string | null;
  onPreferredModelChange?: (model: string) => void;
};

type PanelState = "idle" | "discovering" | "restoring" | "ready" | "creating" | "failed";

export const RightAgentPanel = forwardRef<RightAgentPanelHandle, RightAgentPanelProps>(function RightAgentPanel({
  workspace,
  active,
  onViewChanges,
  onRunningChange,
  preferredModel = null,
  onPreferredModelChange,
}, ref) {
  const [hasStarted, setHasStarted] = useState(active);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [inspection, setInspection] = useState<AgentProviderInspection | null>(null);
  const [session, setSession] = useState<AgentSessionMetadata | null>(null);
  const [projection, setProjection] = useState(() => createAgentProjection());
  const [selectedModel, setSelectedModel] = useState<string | null>(preferredModel);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingApproval, setResolvingApproval] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const projectionRef = useRef(projection);
  const replayInFlightRef = useRef(false);

  useEffect(() => {
    if (active) setHasStarted(true);
  }, [active]);

  useEffect(() => {
    onRunningChange?.(Boolean(projection.runningTurnId));
  }, [onRunningChange, projection.runningTurnId]);

  const commitProjection = useCallback((next: ReturnType<typeof createAgentProjection>) => {
    projectionRef.current = next;
    setProjection(next);
  }, []);

  const applySnapshot = useCallback((snapshot: AgentSessionSnapshot) => {
    sessionIdRef.current = snapshot.session.id;
    setSession(snapshot.session);
    setSelectedModel((current) => (
      snapshot.session.selectedModel
      || current
      || snapshot.models.find((model) => model.isDefault)?.model
      || snapshot.models[0]?.model
      || null
    ));
    setInspection((current) => ({
      readiness: current?.readiness ?? {
        provider: "codex",
        status: "ready",
        version: null,
        minimumVersion: null,
        message: "Codex is ready.",
      },
      account: snapshot.account,
      models: snapshot.models,
      capabilities: snapshot.capabilities,
      warnings: current?.warnings ?? [],
    }));
    commitProjection(applyAgentEvents(
      createAgentProjection({ partialHistory: snapshot.partial }),
      snapshot.events,
      { partialHistory: snapshot.partial },
    ));
  }, [commitProjection]);

  const replayFrom = useCallback(async (afterSequence: number) => {
    const bridge = window.puppyoneDesktop;
    const sessionId = sessionIdRef.current;
    if (!bridge?.replayAgentSession || !sessionId || replayInFlightRef.current) return;
    replayInFlightRef.current = true;
    try {
      const snapshot = await bridge.replayAgentSession({ sessionId, afterSequence });
      let next = projectionRef.current;
      next = applyAgentEvents(next, snapshot.events, { partialHistory: snapshot.partial });
      commitProjection(next);
      setSession(snapshot.session);
    } catch (replayError) {
      setError(formatAgentError(replayError));
    } finally {
      replayInFlightRef.current = false;
    }
  }, [commitProjection]);

  useEffect(() => {
    if (!hasStarted) return undefined;
    const bridge = window.puppyoneDesktop;
    if (!bridge?.onAgentEvent) return undefined;
    return bridge.onAgentEvent((event: AgentEvent) => {
      if (event.sessionId !== sessionIdRef.current) return;
      const current = projectionRef.current;
      if (current.lastSequence > 0 && event.sequence > current.lastSequence + 1) {
        void replayFrom(current.lastSequence);
        return;
      }
      commitProjection(applyAgentEvent(current, event));
      setSession((value) => value ? {
        ...value,
        lastSequence: event.sequence,
        updatedAt: event.emittedAt,
        activeTurnId: event.type === "turn.started"
          ? event.turnId
          : event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted"
            ? null
            : value.activeTurnId,
        terminalState: event.type === "turn.started"
          ? "running"
          : event.type === "turn.completed"
            ? "completed"
            : event.type === "turn.failed"
              ? "failed"
              : event.type === "turn.interrupted"
                ? "interrupted"
                : value.terminalState,
      } : value);
    });
  }, [commitProjection, hasStarted, replayFrom]);

  const initialize = useCallback(async (refresh = false) => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.discoverAgentProviders || !bridge.resumeAgentSession) {
      setPanelState("failed");
      setError("Desktop Agent bridge unavailable. Restart PuppyOne so the native bridge can load.");
      return;
    }
    setError(null);
    setPanelState("discovering");
    try {
      const nextInspection = await bridge.discoverAgentProviders({ refresh });
      setInspection(nextInspection);
      setSelectedModel((current) => current
        || nextInspection.models.find((model) => model.isDefault)?.model
        || nextInspection.models[0]?.model
        || null);
      if (nextInspection.readiness.status !== "ready") {
        setPanelState("ready");
        return;
      }
      setPanelState("restoring");
      const restored = await bridge.resumeAgentSession({ rootPath: workspace.path });
      if (restored) applySnapshot(restored);
      setPanelState("ready");
    } catch (initializationError) {
      setPanelState("failed");
      setError(formatAgentError(initializationError));
    }
  }, [applySnapshot, workspace.path]);

  useEffect(() => {
    if (!hasStarted) return;
    sessionIdRef.current = null;
    setSession(null);
    commitProjection(createAgentProjection());
    void initialize(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitProjection, hasStarted, initialize, workspace.path]);

  const createSession = useCallback(async () => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.createAgentSession) throw new Error("Desktop Agent bridge unavailable.");
    setPanelState("creating");
    const snapshot = await bridge.createAgentSession({ rootPath: workspace.path, model: selectedModel });
    applySnapshot(snapshot);
    setPanelState("ready");
    return snapshot.session;
  }, [applySnapshot, selectedModel, workspace.path]);

  const handleNewSession = useCallback(async () => {
    const bridge = window.puppyoneDesktop;
    setError(null);
    try {
      if (sessionIdRef.current && bridge?.closeAgentSession) {
        await bridge.closeAgentSession({ sessionId: sessionIdRef.current, removePersistence: true });
      }
      sessionIdRef.current = null;
      setSession(null);
      commitProjection(createAgentProjection());
      // The draft is intentionally left untouched: a fresh session should
      // carry forward whatever the user was mid-typing.
      await createSession();
    } catch (newSessionError) {
      setPanelState("failed");
      setError(formatAgentError(newSessionError));
    }
  }, [commitProjection, createSession]);

  const handleResetSession = useCallback(() => {
    void handleNewSession();
  }, [handleNewSession]);

  const handleCloseSession = useCallback(async () => {
    const bridge = window.puppyoneDesktop;
    if (!sessionIdRef.current || !bridge?.closeAgentSession) return;
    setError(null);
    try {
      await bridge.closeAgentSession({ sessionId: sessionIdRef.current, removePersistence: true });
      sessionIdRef.current = null;
      setSession(null);
      commitProjection(createAgentProjection());
    } catch (closeError) {
      setError(formatAgentError(closeError));
    }
  }, [commitProjection]);

  useImperativeHandle(ref, () => ({
    newSession: () => void handleNewSession(),
  }), [handleNewSession]);

  const handleSubmit = async (prompt: string) => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.startAgentTurn) return false;
    setSubmitting(true);
    setError(null);
    try {
      let activeSession = session;
      if (!activeSession) activeSession = await createSession();
      await bridge.startAgentTurn({
        sessionId: activeSession.id,
        prompt,
        model: selectedModel,
      });
      return true;
    } catch (submitError) {
      setError(formatAgentError(submitError));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async () => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.interruptAgentTurn || !session?.id || !projection.runningTurnId) return;
    setError(null);
    try {
      await bridge.interruptAgentTurn({ sessionId: session.id, turnId: projection.runningTurnId });
    } catch (stopError) {
      setError(formatAgentError(stopError));
    }
  };

  const handleApproval = async (decision: AgentApprovalDecision) => {
    const bridge = window.puppyoneDesktop;
    const approval = projection.approvals[0];
    if (!bridge?.resolveAgentApproval || !session || !approval) return;
    setResolvingApproval(true);
    setError(null);
    try {
      await bridge.resolveAgentApproval({
        sessionId: session.id,
        turnId: approval.turnId,
        requestId: approval.requestId,
        decision,
      });
    } catch (approvalError) {
      setError(formatAgentError(approvalError));
      void replayFrom(projection.lastSequence);
    } finally {
      setResolvingApproval(false);
    }
  };

  const handleSelectModel = (model: string) => {
    setSelectedModel(model || null);
    if (model) onPreferredModelChange?.(model);
  };

  const readiness = inspection?.readiness;
  const setupRequired = readiness?.status === "installed-not-authenticated";
  const unsupportedVersion = readiness?.status === "unsupported-version";
  const unavailable = readiness?.status !== "ready";
  const loading = panelState === "discovering" || panelState === "restoring" || panelState === "creating";

  return (
    <section className="desktop-agent-panel" aria-label="Codex Chat">
      <AgentSurfaceHeader
        title={session?.title || "Codex"}
        statusLabel={session ? session.terminalState : readinessLabel(readiness?.status)}
        loading={loading}
        newSessionDisabled={unavailable || Boolean(projection.runningTurnId)}
        onNewSession={() => void handleNewSession()}
        diagnostic={readiness?.diagnostic || (inspection?.warnings.length ? inspection.warnings.join(" ") : null)}
        closeDisabled={!session}
        onCloseSession={() => void handleCloseSession()}
        onResetSession={handleResetSession}
      />

      <AgentControls
        providerLabel="Codex"
        models={inspection?.models ?? []}
        selectedModel={selectedModel}
        modelSelectionAvailable={Boolean(inspection?.capabilities?.modelSelection)}
        disabled={Boolean(projection.runningTurnId)}
        onSelectModel={handleSelectModel}
      />

      {(unavailable || panelState === "failed") && (
        <div className="desktop-agent-readiness" role="status">
          <CircleAlert size={15} />
          <div>
            <strong>{readinessHeading(readiness?.status)}</strong>
            {unsupportedVersion ? (
              <p>
                Detected Codex {readiness?.version || "unknown version"}; PuppyOne requires{" "}
                {readiness?.minimumVersion || "a newer version"}. Update Codex via its install channel, then refresh.
              </p>
            ) : setupRequired ? (
              <p>Codex is installed but not signed in. Run `codex login` in Terminal, then refresh.</p>
            ) : (
              <p>{readiness?.message || error || "Unable to inspect Codex."}</p>
            )}
          </div>
          <button type="button" aria-label="Refresh Codex readiness" onClick={() => void initialize(true)}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {loading && (
        <div className="desktop-agent-provider-progress" role="status">
          <LoaderCircle size={13} className="desktop-agent-spin" /> {panelState === "restoring" ? "Restoring session" : panelState === "creating" ? "Starting session" : "Checking Codex"}
        </div>
      )}

      {error && !unavailable && (
        <div className="desktop-agent-inline-error" role="alert"><CircleAlert size={14} /> {error}</div>
      )}

      <AgentTranscript projection={projection} loading={loading} onViewChanges={onViewChanges} />

      <AgentQuestionDock
        question={null}
        capabilities={inspection?.capabilities ?? null}
        onSubmit={() => {}}
        onCancel={() => {}}
      />

      {projection.approvals[0] && (
        <AgentApprovalDock
          approval={projection.approvals[0]}
          queueLength={projection.approvals.length}
          resolving={resolvingApproval}
          onResolve={(decision) => void handleApproval(decision)}
        />
      )}

      <AgentComposer
        draft={draft}
        onDraftChange={setDraft}
        disabled={loading || unavailable || panelState === "failed" || projection.approvals.length > 0}
        running={Boolean(projection.runningTurnId)}
        submitting={submitting}
        placeholder={setupRequired ? "Codex setup required" : unavailable ? "Codex unavailable" : "Message Codex…"}
        onSubmit={handleSubmit}
        onStop={() => void handleStop()}
      />
    </section>
  );
});

function readinessLabel(status: string | undefined) {
  if (status === "ready") return "ready";
  if (status === "installed-not-authenticated") return "setup required";
  if (status === "not-installed") return "not installed";
  if (status === "unsupported-version") return "update required";
  return "checking";
}

function readinessHeading(status: string | undefined) {
  if (status === "installed-not-authenticated") return "Codex setup required";
  if (status === "unsupported-version") return "Codex update required";
  return "Codex unavailable";
}

function formatAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered for 'agent:")) {
    return "Desktop Agent runtime was updated. Restart PuppyOne once so the native bridge can load.";
  }
  return message;
}
