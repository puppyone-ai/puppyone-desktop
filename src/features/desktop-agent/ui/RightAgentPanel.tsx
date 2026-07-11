import { forwardRef, useEffect, useImperativeHandle, useMemo, useSyncExternalStore } from "react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { AgentApprovalDock } from "./AgentApprovalDock";
import { AgentComposer } from "./AgentComposer";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { AgentQuestionDock } from "./AgentQuestionDock";
import { getAgentSessionController } from "../application/controllerRegistry";
import type { AgentSessionMetadata } from "../domain/agent-contract";
import "./desktop-agent.css";

export type RightAgentPanelHandle = { newSession: () => void };

type RightAgentPanelProps = {
  workspace: Workspace;
  active: boolean;
  onViewChanges?: () => void;
  onRunningChange?: (running: boolean) => void;
  preferredModel?: string | null;
  onPreferredModelChange?: (model: string) => void;
};

export const RightAgentPanel = forwardRef<RightAgentPanelHandle, RightAgentPanelProps>(function RightAgentPanel({
  workspace,
  active,
  onViewChanges,
  onRunningChange,
  preferredModel = null,
  onPreferredModelChange,
}, ref) {
  const controller = useMemo(() => getAgentSessionController(workspace.path), [workspace.path]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    if (active) void controller.initialize(false);
  }, [active, controller]);

  useEffect(() => {
    if (preferredModel && !state.selectedModel) controller.selectModel(preferredModel);
  }, [controller, preferredModel, state.selectedModel]);

  useEffect(() => {
    onRunningChange?.(Boolean(state.projection.runningTurnId));
  }, [onRunningChange, state.projection.runningTurnId]);

  useImperativeHandle(ref, () => ({ newSession: () => { void controller.newSession(); } }), [controller]);

  const inspection = state.inspection;
  const readiness = inspection?.readiness;
  const runtime = state.session?.runtime
    || inspection?.runtime
    || inspection?.runtimes?.find((entry) => entry.descriptor.id === state.selectedRuntimeId)?.descriptor;
  const runtimeLabel = runtime?.displayName || "Agent";
  const capabilities = inspection?.capabilities;
  const unavailable = Boolean(readiness && readiness.status !== "ready");
  const loading = state.phase === "discovering" || state.phase === "restoring" || state.phase === "creating";
  const failed = state.phase === "failed" || state.phase === "runtime-exited";
  const viewport = controller.readViewport();

  return (
    <section className="desktop-agent-panel" aria-label={`${runtimeLabel} Chat`} data-phase={state.phase}>
      <AgentSurfaceHeader
        title={state.session?.title || "New chat"}
        runtimeLabel={runtimeLabel}
        statusLabel={state.session ? sessionStatusLabel(state.session.terminalState) : readinessLabel(readiness?.status)}
        loading={loading}
        newSessionDisabled={unavailable || Boolean(state.projection.runningTurnId)}
        onNewSession={() => void controller.newSession()}
        diagnostic={readiness?.diagnostic || (inspection?.warnings.length ? inspection.warnings.join(" ") : null)}
        closeDisabled={!state.session || Boolean(state.projection.runningTurnId)}
        history={state.history}
        activeSessionId={state.session?.id}
        onSelectSession={(sessionId) => void controller.switchSession(sessionId)}
        onForkSession={capabilities?.fork ? () => void controller.forkSession() : undefined}
        onArchiveSession={state.session ? () => void controller.archiveSession() : undefined}
        onDeleteSession={state.session ? () => void controller.deleteSession() : undefined}
        onCompactSession={capabilities?.compaction ? () => void controller.compactSession() : undefined}
        canFork={Boolean(capabilities?.fork)}
        canCompact={Boolean(capabilities?.compaction)}
      />

      {(unavailable || failed) && (
        <div className="desktop-agent-readiness" role="status">
          <CircleAlert size={15} />
          <div>
            <strong>{failed ? `${runtimeLabel} session needs attention` : readinessHeading(readiness?.status, runtimeLabel)}</strong>
            <p>{failed ? state.error : readiness?.message || state.error || `Unable to inspect ${runtimeLabel}.`}</p>
          </div>
          <button type="button" aria-label={`Refresh ${runtimeLabel} readiness`} onClick={() => void controller.initialize(true)}><RefreshCw size={14} /> Refresh</button>
        </div>
      )}

      {loading && (
        <div className="desktop-agent-provider-progress" role="status">
          <LoaderCircle size={13} className="desktop-agent-spin" /> {state.phase === "restoring" ? "Restoring session" : state.phase === "creating" ? "Starting session" : `Checking ${runtimeLabel}`}
        </div>
      )}

      {state.error && !unavailable && !failed && <div className="desktop-agent-inline-error" role="alert"><CircleAlert size={14} /> {state.error}</div>}

      <AgentTranscript
        key={state.session?.id || "new-agent-session"}
        projection={state.projection}
        loading={loading}
        runtimeLabel={runtimeLabel}
        initialScrollTop={viewport.scrollTop}
        initialMeasurements={viewport.measurements}
        initialPinned={viewport.pinned}
        onViewportChange={(scrollTop, measurements, pinned) => controller.rememberViewport(scrollTop, measurements, pinned)}
        onViewChanges={onViewChanges}
      />

      {state.projection.approvals[0] && (
        <AgentApprovalDock
          approval={state.projection.approvals[0]}
          queueLength={state.projection.approvals.length}
          resolving={state.resolvingBlocker}
          runtimeLabel={runtimeLabel}
          onResolve={(decision) => void controller.resolveApproval(decision)}
        />
      )}

      {state.projection.questions[0] && (
        <AgentQuestionDock
          key={state.projection.questions[0].requestId}
          request={state.projection.questions[0]}
          queueLength={state.projection.questions.length}
          resolving={state.resolvingBlocker}
          onResolve={(resolution) => void controller.resolveQuestion(resolution)}
        />
      )}

      <AgentComposer
        draft={state.draft}
        onDraftChange={(draft) => controller.setDraft(draft)}
        disabled={loading || unavailable || failed || state.projection.approvals.length > 0 || state.projection.questions.length > 0}
        running={Boolean(state.projection.runningTurnId)}
        stopping={state.stopping}
        submitting={state.submitting}
        placeholder={unavailable ? `${runtimeLabel} unavailable` : `Plan, build, / for commands, @ for context`}
        runtimeLabel={runtimeLabel}
        models={capabilities?.modelSelection ? inspection?.models ?? [] : []}
        selectedModel={state.selectedModel}
        onSelectModel={(model) => { controller.selectModel(model); onPreferredModelChange?.(model); }}
        modes={capabilities?.modeSelection ? inspection?.modes ?? [] : []}
        selectedMode={state.selectedMode}
        onSelectMode={(mode) => controller.selectMode(mode)}
        commands={capabilities?.slashCommands ? inspection?.commands ?? [] : []}
        attachments={state.attachments}
        contextReferences={state.contextReferences}
        attachmentAvailable={Boolean(capabilities?.attachments)}
        contextAvailable={Boolean(capabilities?.contextReferences)}
        steerAvailable={Boolean(capabilities?.steer)}
        queueAvailable={Boolean(capabilities?.queue)}
        onAddAttachments={(references) => controller.addAttachments(references)}
        onAddContext={(references) => controller.addContextReferences(references)}
        onRemoveAttachment={(path) => controller.removeAttachment(path)}
        onRemoveContext={(path) => controller.removeContextReference(path)}
        onSubmit={(prompt) => controller.submit(prompt)}
        onStop={() => void controller.stop()}
      />
    </section>
  );
});

function readinessLabel(status: string | undefined) {
  if (status === "ready") return "ready";
  if (status === "installed-not-authenticated") return "setup required";
  if (status === "not-installed") return "not installed";
  if (status === "unsupported-version") return "update required";
  if (status === "error") return "unavailable";
  return "checking";
}

function sessionStatusLabel(status: AgentSessionMetadata["terminalState"]) {
  return status === "provider-exited" ? "provider exited" : status;
}

function readinessHeading(status: string | undefined, runtimeLabel: string) {
  if (status === "installed-not-authenticated") return `${runtimeLabel} setup required`;
  if (status === "unsupported-version") return `${runtimeLabel} update required`;
  return `${runtimeLabel} unavailable`;
}
