import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { AgentApprovalDock } from "./AgentApprovalDock";
import { AgentComposer } from "./AgentComposer";
import { AgentTranscript } from "./AgentTranscript";
import { applyAgentEvent, applyAgentEvents, createAgentProjection } from "./agentProjection";
import type {
  AgentApprovalDecision,
  AgentEvent,
  AgentProviderInspection,
  AgentSessionMetadata,
  AgentSessionSnapshot,
} from "./agentTypes";

type RightAgentPanelProps = {
  workspace: Workspace;
  active: boolean;
  onViewChanges?: () => void;
};

type PanelState = "idle" | "discovering" | "restoring" | "ready" | "creating" | "failed";

export function RightAgentPanel({ workspace, active, onViewChanges }: RightAgentPanelProps) {
  const [hasStarted, setHasStarted] = useState(active);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [inspection, setInspection] = useState<AgentProviderInspection | null>(null);
  const [session, setSession] = useState<AgentSessionMetadata | null>(null);
  const [projection, setProjection] = useState(() => createAgentProjection());
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingApproval, setResolvingApproval] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const projectionRef = useRef(projection);
  const replayInFlightRef = useRef(false);

  useEffect(() => {
    if (active) setHasStarted(true);
  }, [active]);

  const commitProjection = useCallback((next: ReturnType<typeof createAgentProjection>) => {
    projectionRef.current = next;
    setProjection(next);
  }, []);

  const applySnapshot = useCallback((snapshot: AgentSessionSnapshot) => {
    sessionIdRef.current = snapshot.session.id;
    setSession(snapshot.session);
    setSelectedModel(snapshot.session.selectedModel || snapshot.models.find((model) => model.isDefault)?.model || snapshot.models[0]?.model || null);
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
    if (!bridge?.discoverAgentProvider || !bridge.restoreAgentSession) {
      setPanelState("failed");
      setError("Desktop Agent bridge unavailable. Restart PuppyOne so the native bridge can load.");
      return;
    }
    setError(null);
    setPanelState("discovering");
    try {
      const nextInspection = await bridge.discoverAgentProvider({ refresh });
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
      const restored = await bridge.restoreAgentSession({ rootPath: workspace.path });
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

  const handleNewSession = async () => {
    const bridge = window.puppyoneDesktop;
    setError(null);
    try {
      if (sessionIdRef.current && bridge?.closeAgentSession) {
        await bridge.closeAgentSession({ sessionId: sessionIdRef.current, removePersistence: true });
      }
      sessionIdRef.current = null;
      setSession(null);
      commitProjection(createAgentProjection());
      await createSession();
    } catch (newSessionError) {
      setPanelState("failed");
      setError(formatAgentError(newSessionError));
    }
  };

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

  const readiness = inspection?.readiness;
  const setupRequired = Boolean(inspection?.account?.requiresOpenaiAuth && !inspection.account.account);
  const unavailable = readiness?.status !== "ready" || setupRequired;
  const loading = panelState === "discovering" || panelState === "restoring" || panelState === "creating";

  return (
    <section className="desktop-agent-panel" aria-label="Codex Chat">
      <header className="desktop-agent-session-header">
        <div>
          <strong>{session?.title || "Codex"}</strong>
          <span>{session ? session.terminalState : readinessLabel(readiness?.status, setupRequired)}</span>
        </div>
        <button
          type="button"
          className="desktop-agent-icon-button"
          aria-label="New Codex session"
          title="New Codex session"
          disabled={loading || unavailable || Boolean(projection.runningTurnId)}
          onClick={() => void handleNewSession()}
        >
          <Plus size={15} />
        </button>
      </header>

      <div className="desktop-agent-controls">
        <div className="desktop-agent-provider-control">
          <span className="desktop-agent-provider-dot" /> Codex
        </div>
        {inspection?.capabilities?.modelSelection && inspection.models.length > 0 && (
          <label>
            <span className="desktop-agent-visually-hidden">Codex model</span>
            <select
              value={selectedModel ?? ""}
              disabled={Boolean(projection.runningTurnId)}
              onChange={(event) => setSelectedModel(event.target.value || null)}
            >
              {inspection.models.map((model) => (
                <option value={model.model} key={model.id}>{model.displayName}</option>
              ))}
            </select>
          </label>
        )}
        <span className="desktop-agent-mode">Agent</span>
      </div>

      {(unavailable || panelState === "failed") && (
        <div className="desktop-agent-readiness" role="status">
          <CircleAlert size={15} />
          <div>
            <strong>{setupRequired ? "Codex setup required" : "Codex unavailable"}</strong>
            <p>{setupRequired ? "Run `codex login` in Terminal, then refresh." : readiness?.message || error || "Unable to inspect Codex."}</p>
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

      {projection.approvals[0] && (
        <AgentApprovalDock
          approval={projection.approvals[0]}
          queueLength={projection.approvals.length}
          resolving={resolvingApproval}
          onResolve={(decision) => void handleApproval(decision)}
        />
      )}

      <AgentComposer
        disabled={loading || unavailable || panelState === "failed" || projection.approvals.length > 0}
        running={Boolean(projection.runningTurnId)}
        submitting={submitting}
        placeholder={unavailable ? "Codex setup required" : "Message Codex…"}
        onSubmit={handleSubmit}
        onStop={() => void handleStop()}
      />
    </section>
  );
}

function readinessLabel(status: string | undefined, setupRequired: boolean) {
  if (setupRequired) return "setup required";
  if (status === "ready") return "ready";
  if (status === "not-installed") return "not installed";
  if (status === "unsupported-version") return "update required";
  return "checking";
}

function formatAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered for 'agent:")) {
    return "Desktop Agent runtime was updated. Restart PuppyOne once so the native bridge can load.";
  }
  return message;
}
