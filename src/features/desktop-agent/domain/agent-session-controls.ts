import type { AgentRuntimeInspection } from "./agent-contract";

export type AgentSessionControlId = "model" | "effort" | "mode";

export type AgentSessionControlOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
};

export type AgentSessionControl = {
  id: AgentSessionControlId;
  value: string | null;
  options: AgentSessionControlOption[];
};

type AgentSessionControlSelection = {
  selectedModel: string | null;
  selectedEffort: string | null;
  selectedMode: string | null;
};

/**
 * Projects a runtime's negotiated capability surface into renderer controls.
 * Runtime identity never participates: a new Harness gets the same controls as
 * soon as its adapter reports the corresponding normalized capabilities.
 */
export function deriveAgentSessionControls(
  inspection: AgentRuntimeInspection | null,
  selection: AgentSessionControlSelection,
): AgentSessionControl[] {
  if (!inspection?.capabilities) return [];

  const controls: AgentSessionControl[] = [];
  if (inspection.capabilities.modelSelection && inspection.models.length > 0) {
    controls.push({
      id: "model",
      value: selection.selectedModel,
      options: inspection.models.map((model) => ({
        value: model.model,
        label: model.displayName,
        description: model.description || undefined,
        keywords: `${model.id} ${model.model} ${(model.variants || []).join(" ")}`,
      })),
    });
  }

  const selectedModel = inspection.models.find((model) => model.model === selection.selectedModel);
  if (selectedModel?.variants?.length) {
    controls.push({
      id: "effort",
      value: selection.selectedEffort,
      options: selectedModel.variants.map((effort) => ({ value: effort, label: effort })),
    });
  }

  if (inspection.capabilities.modeSelection && inspection.modes?.length) {
    controls.push({
      id: "mode",
      value: selection.selectedMode,
      options: inspection.modes.map((mode) => ({
        value: mode.id,
        label: mode.displayName,
        description: mode.description || undefined,
        keywords: `${mode.id} ${mode.displayName}`,
      })),
    });
  }

  return controls;
}
