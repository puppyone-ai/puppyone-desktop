import { useCallback, useEffect } from "react";
import type { AgentSessionController } from "../application/AgentSessionController";
import type { AgentControllerState } from "../application/agent-controller-state";
import type { AgentModel } from "../domain/agent-contract";
import type { AgentRoutePreference } from "../domain/agent-route-preference";
import type { AgentSessionControlId } from "../domain/agent-session-controls";

type Options = {
  active: boolean;
  controller: AgentSessionController;
  state: AgentControllerState;
  runtimeModels: AgentModel[];
  preferredRuntimeId: string | null;
  preferredRoute: Readonly<AgentRoutePreference>;
  preferredModel: string | null;
  onPreferredRuntimeChange?: (runtimeId: string | null) => void;
  onPreferredRouteChange?: (route: AgentRoutePreference) => void;
  onPreferredModelChange?: (model: string) => void;
};

/** Applies and records routing without leaking one runtime's model into another. */
export function useAgentRoutingPreferences({
  active,
  controller,
  state,
  runtimeModels,
  preferredRuntimeId,
  preferredRoute,
  preferredModel,
  onPreferredRuntimeChange,
  onPreferredRouteChange,
  onPreferredModelChange,
}: Options) {
  const preferredModelId = preferredRoute.modelId || preferredModel;
  const preferredModelIsAvailable = Boolean(
    preferredModelId
    && state.selectedRuntimeId === preferredRuntimeId
    && state.inspection?.selectedRuntimeId === state.selectedRuntimeId
    && state.inspection.models.some((model) => model.model === preferredModelId),
  );
  const modelPreferencePending = Boolean(
    !state.session && preferredModelIsAvailable && state.selectedModel !== preferredModelId,
  );
  const preferredModeIsAvailable = Boolean(
    preferredRoute.mode
    && state.selectedRuntimeId === preferredRuntimeId
    && state.inspection?.modes?.some((mode) => mode.id === preferredRoute.mode),
  );
  const modePreferencePending = Boolean(
    !state.session && preferredModeIsAvailable && state.selectedMode !== preferredRoute.mode,
  );
  const selectedModelProfile = runtimeModels.find((model) => model.model === state.selectedModel);
  const preferredEffort = preferredRoute.effort || preferredRoute.variant;
  const preferredEffortIsAvailable = Boolean(
    preferredEffort && selectedModelProfile?.variants?.includes(preferredEffort),
  );
  const effortPreferencePending = Boolean(
    !state.session && preferredEffortIsAvailable && state.selectedEffort !== preferredEffort,
  );

  useEffect(() => {
    if (!active) return;
    void controller.initialize(false);
  }, [active, controller]);

  useEffect(() => {
    if (!active || !state.initialized) return;
    if (state.selectedRuntimeId && state.selectedRuntimeId !== preferredRuntimeId) {
      onPreferredRuntimeChange?.(state.selectedRuntimeId);
      return;
    }
    const preferredStillRegistered = state.inspection?.runtimes
      ?.some((entry) => entry.descriptor.id === preferredRuntimeId) === true;
    if (!state.selectedRuntimeId && preferredRuntimeId && state.inspection && !preferredStillRegistered) {
      onPreferredRuntimeChange?.(null);
    }
  }, [active, onPreferredRuntimeChange, preferredRuntimeId, state.initialized, state.inspection, state.selectedRuntimeId]);

  useEffect(() => {
    if (active && modelPreferencePending && preferredModelId) controller.selectModel(preferredModelId);
  }, [active, controller, modelPreferencePending, preferredModelId]);

  useEffect(() => {
    if (active && modePreferencePending && preferredRoute.mode) controller.selectMode(preferredRoute.mode);
  }, [active, controller, modePreferencePending, preferredRoute.mode]);

  useEffect(() => {
    if (active && effortPreferencePending && preferredEffort) controller.selectEffort(preferredEffort);
  }, [active, controller, effortPreferencePending, preferredEffort]);

  useEffect(() => {
    if (
      !active
      || !state.initialized
      || !state.selectedRuntimeId
      || state.selectedRuntimeId !== preferredRuntimeId
      || modelPreferencePending
      || effortPreferencePending
      || modePreferencePending
    ) return;
    const nextRoute: AgentRoutePreference = {
      providerId: state.selectedProviderId ?? undefined,
      modelId: state.selectedModel ?? undefined,
      effort: state.selectedEffort ?? undefined,
      mode: state.selectedMode ?? undefined,
    };
    if (routeChanged(preferredRoute, nextRoute)) onPreferredRouteChange?.(nextRoute);
  }, [
    active,
    onPreferredRouteChange,
    modePreferencePending,
    effortPreferencePending,
    modelPreferencePending,
    preferredRoute,
    preferredRuntimeId,
    state.initialized,
    state.inspection?.models,
    state.selectedMode,
    state.selectedModel,
    state.selectedEffort,
    state.selectedProviderId,
    state.selectedRuntimeId,
  ]);

  const selectModel = useCallback((model: string) => {
    controller.selectModel(model);
    const selected = runtimeModels.find((entry) => entry.model === model);
    const currentEffort = state.selectedModel === model && selected?.variants?.includes(state.selectedEffort ?? "")
      ? state.selectedEffort
      : selected?.defaultVariant ?? selected?.variants?.[0] ?? undefined;
    onPreferredRouteChange?.({
      ...preferredRoute,
      providerId: selected?.providerId,
      modelId: model,
      variant: undefined,
      effort: currentEffort ?? undefined,
    });
    onPreferredModelChange?.(model);
  }, [controller, onPreferredModelChange, onPreferredRouteChange, preferredRoute, runtimeModels, state.selectedEffort, state.selectedModel]);

  const selectEffort = useCallback((effort: string) => {
    controller.selectEffort(effort);
    onPreferredRouteChange?.({
      ...preferredRoute,
      providerId: state.selectedProviderId ?? undefined,
      modelId: state.selectedModel ?? undefined,
      variant: undefined,
      effort,
    });
  }, [controller, onPreferredRouteChange, preferredRoute, state.selectedModel, state.selectedProviderId]);

  const selectMode = useCallback((mode: string) => {
    controller.selectMode(mode);
    onPreferredRouteChange?.({
      ...preferredRoute,
      providerId: state.selectedProviderId ?? undefined,
      modelId: state.selectedModel ?? undefined,
      effort: state.selectedEffort ?? undefined,
      mode,
    });
  }, [controller, onPreferredRouteChange, preferredRoute, state.selectedEffort, state.selectedModel, state.selectedProviderId]);

  const selectSessionControl = useCallback((id: AgentSessionControlId, value: string) => {
    if (id === "model") selectModel(value);
    else if (id === "effort") selectEffort(value);
    else selectMode(value);
  }, [selectEffort, selectMode, selectModel]);

  const selectRuntime = useCallback((runtimeId: string) => {
    void controller.selectRuntime(runtimeId).then((switched) => {
      if (switched) onPreferredRuntimeChange?.(runtimeId);
    });
  }, [controller, onPreferredRuntimeChange]);

  return {
    selectModel,
    selectEffort,
    selectMode,
    selectSessionControl,
    selectRuntime,
    preferencesReady: !modelPreferencePending && !effortPreferencePending && !modePreferencePending,
  };
}

function routeChanged(left: Readonly<AgentRoutePreference>, right: Readonly<AgentRoutePreference>) {
  return ["providerId", "modelId", "variant", "effort", "mode"].some((key) => (
    left[key as keyof AgentRoutePreference] !== right[key as keyof AgentRoutePreference]
  ));
}
