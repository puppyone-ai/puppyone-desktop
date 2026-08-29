import { useCallback, useEffect } from "react";
import type { AgentSessionController } from "../application/AgentSessionController";
import type { AgentControllerState } from "../application/agent-controller-state";
import type { AgentModel } from "../domain/agent-contract";
import type { AgentRoutePreference } from "../domain/agent-route-preference";

type Options = {
  active: boolean;
  controller: AgentSessionController;
  state: AgentControllerState;
  runtimeModels: AgentModel[];
  preferredRuntimeId: string | null;
  preferredRoute: Readonly<AgentRoutePreference>;
  preferredModel: string | null;
  onPreferredRuntimeChange?: (runtimeId: string) => void;
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
    && state.inspection?.selectedRuntimeId === state.selectedRuntimeId
    && state.inspection.models.some((model) => model.model === preferredModelId),
  );
  const modelPreferencePending = Boolean(
    !state.session && preferredModelIsAvailable && state.selectedModel !== preferredModelId,
  );
  const preferredModeIsAvailable = Boolean(
    preferredRoute.mode && state.inspection?.modes?.some((mode) => mode.id === preferredRoute.mode),
  );
  const modePreferencePending = Boolean(
    !state.session && preferredModeIsAvailable && state.selectedMode !== preferredRoute.mode,
  );

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
    if (modelPreferencePending && preferredModelId) controller.selectModel(preferredModelId);
  }, [controller, modelPreferencePending, preferredModelId]);

  useEffect(() => {
    if (modePreferencePending && preferredRoute.mode) controller.selectMode(preferredRoute.mode);
  }, [controller, modePreferencePending, preferredRoute.mode]);

  useEffect(() => {
    if (
      !state.initialized
      || !state.selectedRuntimeId
      || state.selectedRuntimeId !== preferredRuntimeId
      || modelPreferencePending
      || modePreferencePending
    ) return;
    const selectedModel = state.inspection?.models.find((model) => model.model === state.selectedModel);
    const nextRoute: AgentRoutePreference = {
      providerId: state.selectedProviderId ?? undefined,
      modelId: state.selectedModel ?? undefined,
      variant: selectedModel?.defaultVariant ?? undefined,
      effort: selectedModel?.defaultVariant ?? undefined,
      mode: state.selectedMode ?? undefined,
    };
    if (routeChanged(preferredRoute, nextRoute)) onPreferredRouteChange?.(nextRoute);
  }, [
    onPreferredRouteChange,
    modePreferencePending,
    modelPreferencePending,
    preferredRoute,
    preferredRuntimeId,
    state.initialized,
    state.inspection?.models,
    state.selectedMode,
    state.selectedModel,
    state.selectedProviderId,
    state.selectedRuntimeId,
  ]);

  const selectModel = useCallback((model: string) => {
    controller.selectModel(model);
    const selected = runtimeModels.find((entry) => entry.model === model);
    onPreferredRouteChange?.({
      providerId: selected?.providerId,
      modelId: model,
      variant: selected?.defaultVariant ?? undefined,
      effort: selected?.defaultVariant ?? undefined,
    });
    onPreferredModelChange?.(model);
  }, [controller, onPreferredModelChange, onPreferredRouteChange, runtimeModels]);

  const selectRuntime = useCallback((runtimeId: string) => {
    void controller.selectRuntime(runtimeId).then((switched) => {
      if (switched) onPreferredRuntimeChange?.(runtimeId);
    });
  }, [controller, onPreferredRuntimeChange]);

  return { selectModel, selectRuntime };
}

function routeChanged(left: Readonly<AgentRoutePreference>, right: Readonly<AgentRoutePreference>) {
  return ["providerId", "modelId", "variant", "effort", "mode"].some((key) => (
    left[key as keyof AgentRoutePreference] !== right[key as keyof AgentRoutePreference]
  ));
}
