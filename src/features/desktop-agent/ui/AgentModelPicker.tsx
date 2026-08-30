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

export const AgentModelPicker = memo(function AgentModelPicker({
  models,
  selectedModel,
  disabled = false,
  onSelectModel,
}: AgentModelPickerProps) {
  const { t } = useLocalization();
  const selected = models.find((model) => model.model === selectedModel) ?? null;
  const groups: AgentPickerGroup[] = [{
    id: "models",
    label: t("agent.model.models"),
    options: models.map((model) => ({
      id: model.model,
      label: model.displayName,
      description: model.description,
      keywords: `${model.id} ${model.model} ${(model.variants || []).join(" ")}`,
      selectable: true,
      selected: model.model === selectedModel,
      icon: null,
    })),
  }];
  return (
    <AgentPickerPopover
      ariaLabel={t("agent.model.ariaLabel")}
      placeholder={t("agent.model.placeholder")}
      valueLabel={selected?.displayName}
      groups={groups}
      disabled={disabled}
      width="medium"
      onSelect={onSelectModel}
    />
  );
});
