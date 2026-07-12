import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useSyncExternalStore } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { AgentApprovalDock } from "./AgentApprovalDock";
import { AgentChangesPill } from "./AgentChangesPill";
import { AgentComposer } from "./AgentComposer";
import { AgentPanelLayout } from "./AgentPanelLayout";
import { AgentPanelStatus } from "./AgentPanelStatus";
import { AgentProviderPicker } from "./AgentProviderPicker";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { AgentQuestionDock } from "./AgentQuestionDock";
import { getAgentSessionController } from "../application/controllerRegistry";
import { listCodingAgentProviders } from "../domain/agent-backend-routing";
import type { AgentSessionMetadata } from "../domain/agent-contract";
import { getElectronAgentClient } from "../infrastructure/electron/electronAgentClient";
import "./desktop-agent.css";

export type RightAgentPanelHandle = { newSession: () => void };

type RightAgentPanelProps = {
  workspace: Workspace;
  active: boolean;
  onViewChanges?: () => void;
  onOpenTerminal?: () => void;
  onOpenFile?: (path: string) => void;
  onRunningChange?: (running: boolean) => void;
  preferredRuntimeId?: string | null;
  onPreferredRuntimeChange?: (runtimeId: string) => void;
  preferredModel?: string | null;
  onPreferredModelChange?: (model: string) => void;
};

export const RightAgentPanel = forwardRef<RightAgentPanelHandle, RightAgentPanelProps>(function RightAgentPanel({
  workspace,
  active,
  onViewChanges,
  onOpenTerminal,
  onOpenFile,
  onRunningChange,
  preferredRuntimeId = null,
  onPreferredRuntimeChange,
  preferredModel = null,
  onPreferredModelChange,
}, ref) {
  const controller = useMemo(() => getAgentSessionController(workspace.path, getElectronAgentClient), [workspace.path]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    if (!active) return;
    controller.setInitialRuntimePreference(preferredRuntimeId);
    void controller.initialize(false);
  }, [active, controller, preferredRuntimeId]);

  useEffect(() => {
    if (!state.initialized || !state.selectedRuntimeId || state.selectedRuntimeId === preferredRuntimeId) return;
    onPreferredRuntimeChange?.(state.selectedRuntimeId);
  }, [onPreferredRuntimeChange, preferredRuntimeId, state.initialized, state.selectedRuntimeId]);

  useEffect(() => {
    if (
      preferredModel
      && !state.selectedModel
      && state.inspection?.selectedRuntimeId === state.selectedRuntimeId
      && state.inspection.models.some((model) => model.model === preferredModel)
    ) controller.selectModel(preferredModel);
  }, [controller, preferredModel, state.inspection, state.selectedModel, state.selectedRuntimeId]);

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
  const sessionKey = state.session?.id || "new-agent-session";
  const viewport = useMemo(() => ({ sessionKey, value: controller.readViewport() }), [controller, sessionKey]).value;
  const agentProviders = useMemo(() => listCodingAgentProviders(inspection), [inspection]);
  const codingProviderSelected = agentProviders.some((entry) => entry.descriptor.id === state.selectedRuntimeId);
  const providerModels = codingProviderSelected ? inspection?.models ?? [] : [];
  const modelSelectionAvailable = Boolean(capabilities?.modelSelection);
  const routingReady = Boolean(
    codingProviderSelected
    && (!modelSelectionAvailable || (
      state.selectedModel && providerModels.some((model) => model.model === state.selectedModel)
    )),
  );
  const composerPlaceholder = unavailable || failed
    ? "Draft while PuppyOne prepares the Agent"
    : !codingProviderSelected
      ? "Choose a coding Agent to start"
      : modelSelectionAvailable && !state.selectedModel
        ? "Choose a model to start"
        : state.projection.rows.length > 0 || state.projection.messages.length > 0
          ? "Send follow-up"
          : "Ask anything";

  const hasStatus = unavailable || failed || loading || Boolean(state.error);
  const handleViewportChange = useCallback((scrollTop: number, measurements: Record<string, number>, pinned: boolean) => {
    controller.rememberViewport(scrollTop, measurements, pinned);
  }, [controller]);
  const handleDraftChange = useCallback((draft: string) => controller.setDraft(draft), [controller]);
  const handleSubmit = useCallback((prompt: string) => controller.submit(prompt), [controller]);
  const handleSelectModel = useCallback((model: string) => {
    controller.selectModel(model);
    onPreferredModelChange?.(model);
  }, [controller, onPreferredModelChange]);
  const handleSelectRuntime = useCallback((providerId: string) => {
    void controller.selectRuntime(providerId).then((switched) => {
      const model = controller.getSnapshot().selectedModel;
      if (switched) onPreferredRuntimeChange?.(providerId);
      if (switched && model) onPreferredModelChange?.(model);
    });
  }, [controller, onPreferredModelChange, onPreferredRuntimeChange]);

  return (
    <AgentPanelLayout
      ariaLabel={`${runtimeLabel} Chat`}
      phase={state.phase}
      header={<AgentSurfaceHeader
        title={state.session?.title || "New chat"}
        runtimeLabel={runtimeLabel}
        statusLabel={state.session ? sessionStatusLabel(state.session.terminalState) : readinessLabel(readiness?.status)}
        loading={loading}
        newSessionDisabled={unavailable || !routingReady || state.submitting || Boolean(state.projection.runningTurnId)}
        onNewSession={() => void controller.newSession()}
        agentSelector={<AgentProviderPicker
          agentProviders={agentProviders}
          selectedAgentProviderId={codingProviderSelected ? state.selectedRuntimeId : null}
          disabled={loading || state.submitting || Boolean(state.projection.runningTurnId)}
          onSelectAgentProvider={handleSelectRuntime}
        />}
        diagnostic={readiness?.diagnostic || (inspection?.warnings.length ? inspection.warnings.join(" ") : null)}
        onCompactSession={capabilities?.compaction ? () => void controller.compactSession() : undefined}
        canCompact={Boolean(capabilities?.compaction)}
      />}
      status={hasStatus ? <AgentPanelStatus
        unavailable={unavailable}
        failed={failed}
        loading={loading}
        error={state.error}
        phase={state.phase}
        runtimeLabel={runtimeLabel}
        readiness={readiness}
        onRetry={() => void controller.initialize(true)}
      /> : null}
      conversation={<AgentTranscript
        key={sessionKey}
        projection={state.projection}
        loading={loading}
        pendingPrompt={state.pendingPrompt}
        working={state.submitting || Boolean(state.projection.runningTurnId)}
        runtimeLabel={runtimeLabel}
        initialScrollTop={viewport.scrollTop}
        initialMeasurements={viewport.measurements}
        initialPinned={viewport.pinned}
        onViewportChange={handleViewportChange}
        onViewChanges={onViewChanges}
        onOpenTerminal={onOpenTerminal}
        onOpenFile={onOpenFile}
      />}
      dock={<>
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
        <AgentChangesPill projection={state.projection} onViewChanges={onViewChanges} />
        <AgentComposer
          draft={state.draft}
          onDraftChange={handleDraftChange}
          disabled={loading || unavailable || failed || !routingReady || state.projection.approvals.length > 0 || state.projection.questions.length > 0}
          running={Boolean(state.projection.runningTurnId)}
          stopping={state.stopping}
          submitting={state.submitting}
          placeholder={composerPlaceholder}
          runtimeLabel={runtimeLabel}
          configurationDisabled={loading || state.submitting}
          models={capabilities?.modelSelection ? providerModels : []}
          selectedModel={state.selectedModel}
          onSelectModel={handleSelectModel}
          commands={capabilities?.slashCommands ? inspection?.commands ?? [] : []}
          attachments={state.attachments}
          contextReferences={state.contextReferences}
          steerAvailable={Boolean(capabilities?.steer)}
          queueAvailable={Boolean(capabilities?.queue)}
          onRemoveAttachment={(path) => controller.removeAttachment(path)}
          onRemoveContext={(path) => controller.removeContextReference(path)}
          onSubmit={handleSubmit}
          onStop={() => void controller.stop()}
        />
      </>}
    />
  );
});

function readinessLabel(status: string | undefined) {
  if (status === "ready") return "ready";
  if (status === "installed-not-authenticated") return "provider setup required";
  if (status === "not-installed" || status === "unsupported-version" || status === "error") return "needs repair";
  return "checking";
}

function sessionStatusLabel(status: AgentSessionMetadata["terminalState"]) {
  return status === "provider-exited" ? "provider exited" : status;
}
