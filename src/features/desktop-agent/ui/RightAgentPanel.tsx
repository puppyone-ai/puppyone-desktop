import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useSyncExternalStore } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { AgentApprovalDock } from "./AgentApprovalDock";
import { AgentChangesPill } from "./AgentChangesPill";
import { AgentComposer, DEFAULT_AGENT_COMPOSER_PLACEHOLDER_ID } from "./AgentComposer";
import { AgentPanelLayout } from "./AgentPanelLayout";
import { AgentPanelStatus } from "./AgentPanelStatus";
import { AgentRuntimePicker } from "./AgentRuntimePicker";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { AgentQuestionDock } from "./AgentQuestionDock";
import { readinessLabel, readinessStatusCode, sessionStatusCode, sessionStatusLabel } from "./agentPanelPresentation";
import { getAgentSessionController } from "../application/controllerRegistry";
import type { AgentSubmissionStage } from "../application/agent-controller-state";
import type { AgentRoutePreference } from "../domain/agent-route-preference";
import { listEnabledAgentRuntimes } from "../domain/agent-backend-routing";
import { getElectronAgentClient } from "../infrastructure/electron/electronAgentClient";
import { useAgentSessionPreparation } from "./useAgentSessionPreparation";
import { useAgentReferenceIngestion } from "./useAgentReferenceIngestion";
import { useAgentRoutingPreferences } from "./useAgentRoutingPreferences";
import "./desktop-agent.css";
export type RightAgentPanelHandle = { newSession: () => void };
type RightAgentPanelProps = {
  workspace: Workspace;
  active: boolean;
  onViewChanges?: () => void;
  onOpenFile?: (path: string) => void;
  onRunningChange?: (running: boolean) => void;
  preferredRuntimeId?: string | null;
  onPreferredRuntimeChange?: (runtimeId: string | null) => void;
  preferredRoute?: Readonly<AgentRoutePreference>;
  onPreferredRouteChange?: (route: AgentRoutePreference) => void;
  /** @deprecated Use preferredRoute.modelId. */
  preferredModel?: string | null;
  /** @deprecated Use onPreferredRouteChange. */
  onPreferredModelChange?: (model: string) => void;
  enabledRuntimeIds?: readonly string[] | null;
};
export const RightAgentPanel = forwardRef<RightAgentPanelHandle, RightAgentPanelProps>(function RightAgentPanel({
  workspace, active,
  onViewChanges,
  onOpenFile,
  onRunningChange,
  preferredRuntimeId = null,
  onPreferredRuntimeChange,
  preferredRoute = {},
  onPreferredRouteChange,
  preferredModel = null,
  onPreferredModelChange,
  enabledRuntimeIds = null,
}, ref) {
  const { t } = useLocalization();
  const controller = useMemo(() => getAgentSessionController(workspace.path, getElectronAgentClient), [workspace.path]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const referenceIngestion = useAgentReferenceIngestion({ controller, workspaceId: workspace.id, capabilities: state.inspection?.capabilities?.referenceInputs });
  useEffect(() => {
    onRunningChange?.(Boolean(state.projection.runningTurnId));
  }, [onRunningChange, state.projection.runningTurnId]);
  useImperativeHandle(ref, () => ({ newSession: () => { void controller.newSession(); } }), [controller]);
  const inspection = state.inspection;
  const readiness = inspection?.readiness;
  const runtime = state.session?.runtime
    || inspection?.runtime
    || inspection?.runtimes?.find((entry) => entry.descriptor.id === state.selectedRuntimeId)?.descriptor;
  const runtimeLabel = runtime?.displayName || t("agent.name");
  const capabilities = inspection?.capabilities;
  const unavailable = Boolean(readiness && readiness.status !== "ready");
  const loading = state.phase === "discovering" || state.phase === "restoring" || state.phase === "creating";
  const failed = state.phase === "failed" || state.phase === "runtime-exited";
  const hasCommittedTranscript = [state.projection.rows, state.projection.parts, state.projection.messages, state.projection.activities]
    .some((entries) => entries.length > 0);
  const startupLoading = active && (!state.initialized || loading) && !state.pendingPrompt && !hasCommittedTranscript;
  const sessionKey = state.session?.id || "new-agent-session";
  const viewport = useMemo(() => ({ sessionKey, value: controller.readViewport() }), [controller, sessionKey]).value;
  const agentRuntimes = listEnabledAgentRuntimes(inspection, enabledRuntimeIds);
  const agentRuntimeSelected = agentRuntimes.some((entry) => entry.descriptor.id === state.selectedRuntimeId);
  const runtimeModels = agentRuntimeSelected ? inspection?.models ?? [] : [];
  const routingPreferences = useAgentRoutingPreferences({
    active, controller, state, runtimeModels, preferredRuntimeId, preferredRoute, preferredModel,
    onPreferredRuntimeChange, onPreferredRouteChange, onPreferredModelChange,
  });
  const modelSelectionAvailable = Boolean(capabilities?.modelSelection);
  const routingReady = Boolean(
    agentRuntimeSelected
    && (!modelSelectionAvailable || (
      state.selectedModel && runtimeModels.some((model) => model.model === state.selectedModel)
    )),
  );
  const preparingSession = state.sessionPreparation === "preparing";
  const submissionPending = state.submitting || Boolean(state.pendingPrompt);
  const submissionStage: AgentSubmissionStage = state.pendingPrompt && !state.projection.runningTurnId
    ? !state.session || preparingSession ? "preparing-session" : "starting-turn"
    : null;
  useAgentSessionPreparation(controller, state, active && routingReady);
  const composerPlaceholder = unavailable || failed
    ? t("agent.composer.placeholder.preparing")
    : !agentRuntimeSelected
      ? t("agent.composer.placeholder.chooseAgent")
      : modelSelectionAvailable && !state.selectedModel
        ? t("agent.composer.placeholder.chooseModel")
        : state.projection.rows.length > 0 || state.projection.messages.length > 0
          ? t("agent.composer.placeholder.followUp")
          : t(DEFAULT_AGENT_COMPOSER_PLACEHOLDER_ID);
  const sessionStatus = state.session?.terminalState;
  const statusCode = state.session ? sessionStatusCode(sessionStatus) : readinessStatusCode(readiness?.status);
  const hasStatus = unavailable || failed || Boolean(state.error);
  const handleViewportChange = useCallback((scrollTop: number, measurements: Record<string, number>, pinned: boolean) => {
    controller.rememberViewport(scrollTop, measurements, pinned);
  }, [controller]);
  const handleDraftChange = useCallback((draft: string) => controller.setDraft(draft), [controller]);
  const handleSubmit = useCallback((prompt: string) => controller.submit(prompt), [controller]);
  return (
    <AgentPanelLayout
      ariaLabel={t("agent.panel.chat", { agent: bidiIsolate(runtimeLabel) })}
      phase={state.phase} dropActive={referenceIngestion.dropActive} dropInvalid={referenceIngestion.dropInvalid}
      dropLabel={referenceIngestion.dropLabel} announcement={referenceIngestion.announcement}
      onDragEnter={referenceIngestion.onDragEnter} onDragOver={referenceIngestion.onDragOver}
      onDragLeave={referenceIngestion.onDragLeave} onDrop={referenceIngestion.onDrop}
      header={(
        <AgentSurfaceHeader
          title={state.session?.title || t("agent.header.newChat")}
          runtimeLabel={runtimeLabel}
          statusCode={statusCode}
          statusLabel={state.session ? sessionStatusLabel(sessionStatus, t) : readinessLabel(readiness?.status, t)}
          loading={loading}
          newSessionDisabled={unavailable || !routingReady || preparingSession || submissionPending || Boolean(state.projection.runningTurnId)}
          onNewSession={() => void controller.newSession()}
          agentSelector={<AgentRuntimePicker
            agentRuntimes={agentRuntimes}
            selectedRuntimeId={agentRuntimeSelected ? state.selectedRuntimeId : null}
            disabled={loading || preparingSession || submissionPending || Boolean(state.projection.runningTurnId)}
            onSelectRuntime={routingPreferences.selectRuntime}
          />}
          diagnostic={readiness?.diagnostic || (inspection?.warnings.length ? inspection.warnings.join(" ") : null)}
          onCompactSession={capabilities?.compaction ? () => void controller.compactSession() : undefined}
          canCompact={Boolean(capabilities?.compaction)}
        />
      )}
      status={hasStatus ? <AgentPanelStatus
        unavailable={unavailable}
        failed={failed}
        error={state.error}
        runtimeLabel={runtimeLabel}
        readiness={readiness ?? undefined}
        onRetry={() => void controller.initialize(true)}
      /> : null}
      conversation={<AgentTranscript
        key={sessionKey}
        projection={state.projection}
        loading={startupLoading}
        pendingPrompt={state.pendingPrompt} pendingReferences={state.pendingIntent?.references ?? []}
        submissionStage={submissionStage}
        working={state.submitting || Boolean(state.projection.runningTurnId)}
        runtimeLabel={runtimeLabel}
        initialScrollTop={viewport.scrollTop}
        initialMeasurements={viewport.measurements}
        initialPinned={viewport.pinned}
        onViewportChange={handleViewportChange}
        onOpenFile={onOpenFile}
      />}
      dock={startupLoading ? null : <>
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
          floatingAccessory={state.projection.approvals.length === 0 && state.projection.questions.length === 0 ? <AgentChangesPill projection={state.projection} onViewChanges={onViewChanges} /> : null}
          draft={state.draft}
          onDraftChange={handleDraftChange}
          disabled={loading || unavailable || failed || !routingReady || state.projection.approvals.length > 0 || state.projection.questions.length > 0}
          running={Boolean(state.projection.runningTurnId)}
          stopping={state.stopping}
          submitting={submissionPending}
          placeholder={composerPlaceholder}
          runtimeLabel={runtimeLabel}
          configurationDisabled={loading || preparingSession || submissionPending}
          models={capabilities?.modelSelection ? runtimeModels : []}
          selectedModel={state.selectedModel}
          onSelectModel={routingPreferences.selectModel}
          commands={capabilities?.slashCommands ? inspection?.commands ?? [] : []}
          references={state.references} referenceCapabilities={capabilities?.referenceInputs}
          steerAvailable={Boolean(capabilities?.steer)}
          queueAvailable={Boolean(capabilities?.queue)}
          onRemoveReference={(id) => controller.removeReference(id)}
          onRetryReference={(id) => controller.retryReference(id)}
          onAddExternalFiles={referenceIngestion.addExternalFiles} onPaste={referenceIngestion.onPaste}
          onPickWorkspaceReferences={referenceIngestion.pickWorkspaceReferences}
          onSubmit={handleSubmit}
          onStop={() => void controller.stop()}
        />
      </>}
    />
  );
});
