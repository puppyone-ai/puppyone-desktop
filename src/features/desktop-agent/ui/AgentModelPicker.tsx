import { Box } from "lucide-react";
import type { AgentModel } from "../domain/agent-contract";
import { AgentPickerPopover, type AgentPickerGroup } from "./AgentPickerPopover";

type AgentModelPickerProps = {
  models: AgentModel[];
  selectedModel: string | null;
  disabled?: boolean;
  onSelectModel: (model: string) => void;
};

export function AgentModelPicker({ models, selectedModel, disabled = false, onSelectModel }: AgentModelPickerProps) {
  const selected = models.find((model) => model.model === selectedModel) ?? models[0] ?? null;
  const groups: AgentPickerGroup[] = [{
    id: "models",
    label: "Models",
    options: models.map((model) => ({
      id: model.model,
      label: model.displayName,
      description: model.description || "Text and tool-capable model",
      meta: model.contextWindow ? `${compactNumber(model.contextWindow)} context` : undefined,
      keywords: `${model.id} ${model.model} ${(model.variants || []).join(" ")}`,
      selectable: true,
      selected: model.model === selectedModel,
      kind: "model",
      icon: <Box size={13} />,
    })),
  }];
  return (
    <AgentPickerPopover
      ariaLabel="Agent model"
      placeholder="Model"
      valueLabel={selected?.displayName}
      groups={groups}
      disabled={disabled}
      className="is-model"
      onSelect={onSelectModel}
    />
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 0 }).format(value);
}
