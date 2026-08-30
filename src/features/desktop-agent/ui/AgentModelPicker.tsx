import { memo } from "react";
import { Brain } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentModel } from "../domain/agent-contract";
import { AgentPickerPopover, type AgentPickerGroup } from "./AgentPickerPopover";

const MODEL_OPTION_PREFIX = "model:";
const EFFORT_OPTION_PREFIX = "effort:";

type AgentModelPickerProps = {
  models: AgentModel[];
  selectedModel: string | null;
  efforts?: string[];
  selectedEffort?: string | null;
  disabled?: boolean;
  onSelectModel: (model: string) => void;
  onSelectEffort?: (effort: string) => void;
};

export const AgentModelPicker = memo(function AgentModelPicker({
  models,
  selectedModel,
  efforts = [],
  selectedEffort = null,
  disabled = false,
  onSelectModel,
  onSelectEffort,
}: AgentModelPickerProps) {
  const { t } = useLocalization();
  const selected = models.find((model) => model.model === selectedModel) ?? null;
  const modelGroup: AgentPickerGroup = {
    id: "models",
    label: t("agent.model.models"),
    options: models.map((model) => ({
      id: `${MODEL_OPTION_PREFIX}${model.model}`,
      label: model.displayName,
      description: model.description,
      keywords: `${model.id} ${model.model} ${(model.variants || []).join(" ")}`,
      selectable: true,
      selected: model.model === selectedModel,
      kind: "model",
      icon: null,
    })),
  };
  const effortGroup: AgentPickerGroup | null = efforts.length > 0 && onSelectEffort ? {
    id: "reasoning-effort",
    label: t("agent.effort.reasoning"),
    options: efforts.map((effort) => ({
      id: `${EFFORT_OPTION_PREFIX}${effort}`,
      label: effortLabel(effort, t),
      keywords: effort,
      selectable: true,
      selected: effort === selectedEffort,
      kind: "effort",
      icon: null,
    })),
  } : null;
  const groups = effortGroup ? [modelGroup, effortGroup] : [modelGroup];
  const selectedEffortLabel = selectedEffort ? effortLabel(selectedEffort, t) : null;
  const valueLabel = [selected?.displayName, selectedEffortLabel].filter(Boolean).join(" · ");
  const ariaLabel = effortGroup
    ? `${t("agent.model.ariaLabel")} · ${t("agent.effort.reasoning")}`
    : t("agent.model.ariaLabel");

  const select = (id: string) => {
    if (id.startsWith(MODEL_OPTION_PREFIX)) {
      onSelectModel(id.slice(MODEL_OPTION_PREFIX.length));
      return;
    }
    if (id.startsWith(EFFORT_OPTION_PREFIX)) onSelectEffort?.(id.slice(EFFORT_OPTION_PREFIX.length));
  };
  return (
    <AgentPickerPopover
      ariaLabel={ariaLabel}
      placeholder={t("agent.model.placeholder")}
      valueLabel={valueLabel}
      groups={groups}
      disabled={disabled}
      className={`is-model${effortGroup ? " has-effort" : ""}`}
      triggerIcon={effortGroup ? <Brain size={13} strokeWidth={1.8} aria-hidden="true" /> : undefined}
      onSelect={select}
    />
  );
});

function effortLabel(effort: string, t: (id: string) => string) {
  const key = `agent.effort.${effort}`;
  const localized = t(key);
  if (localized !== key) return localized;
  return effort.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
