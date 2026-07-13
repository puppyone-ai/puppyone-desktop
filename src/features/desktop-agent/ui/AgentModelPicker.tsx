import { Box } from "lucide-react";
import { memo } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentModel } from "../domain/agent-contract";
import { AgentPickerPopover, type AgentPickerGroup } from "./AgentPickerPopover";

type AgentModelPickerProps = {
  models: AgentModel[];
  selectedModel: string | null;
  disabled?: boolean;
  onSelectModel: (model: string) => void;
};

export const AgentModelPicker = memo(function AgentModelPicker({ models, selectedModel, disabled = false, onSelectModel }: AgentModelPickerProps) {
  const { t, formatNumber } = useLocalization();
  const selected = models.find((model) => model.model === selectedModel) ?? models[0] ?? null;
  const groups: AgentPickerGroup[] = [{
    id: "models",
    label: t("agent.model.models"),
    options: models.map((model) => ({
      id: model.model,
      label: model.displayName,
      description: model.description,
      meta: model.contextWindow
        ? t("agent.model.context", { value: formatNumber(model.contextWindow, { notation: "compact", maximumFractionDigits: 0 }) })
        : undefined,
      keywords: `${model.id} ${model.model} ${(model.variants || []).join(" ")}`,
      selectable: true,
      selected: model.model === selectedModel,
      kind: "model",
      icon: <Box size={13} />,
    })),
  }];
  return (
    <AgentPickerPopover
      ariaLabel={t("agent.model.ariaLabel")}
      placeholder={t("agent.model.placeholder")}
      valueLabel={selected?.displayName}
      title={selected?.displayName}
      groups={groups}
      disabled={disabled}
      className="is-model"
      onSelect={onSelectModel}
    />
  );
});
