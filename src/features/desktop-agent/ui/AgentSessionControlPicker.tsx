import { memo } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AgentSessionControl,
  AgentSessionControlId,
} from "../domain/agent-session-controls";
import { AgentPickerPopover, type AgentPickerGroup } from "./AgentPickerPopover";

type AgentSessionControlPickerProps = {
  control: AgentSessionControl;
  disabled?: boolean;
  onSelect: (id: AgentSessionControlId, value: string) => void;
};

const presentationById = {
  model: { group: "agent.model.models", aria: "agent.model.ariaLabel", placeholder: "agent.model.placeholder", width: "medium" },
  effort: { group: "agent.effort.reasoning", aria: "agent.effort.ariaLabel", placeholder: "agent.effort.placeholder", width: "narrow" },
  mode: { group: "agent.mode.modes", aria: "agent.mode.ariaLabel", placeholder: "agent.mode.placeholder", width: "narrow" },
} as const;

export const AgentSessionControlPicker = memo(function AgentSessionControlPicker({
  control,
  disabled = false,
  onSelect,
}: AgentSessionControlPickerProps) {
  const { t } = useLocalization();
  const presentation = presentationById[control.id];
  const selected = control.options.find((option) => option.value === control.value) ?? null;
  const groups: AgentPickerGroup[] = [{
    id: control.id,
    label: t(presentation.group),
    options: control.options.map((option) => ({
      id: option.value,
      label: control.id === "effort" ? effortLabel(option.label, t) : option.label,
      description: option.description,
      keywords: option.keywords || option.value,
      selectable: true,
      selected: option.value === control.value,
      icon: null,
    })),
  }];
  const valueLabel = selected
    ? control.id === "effort" ? effortLabel(selected.label, t) : selected.label
    : null;

  return <AgentPickerPopover
    ariaLabel={t(presentation.aria)}
    placeholder={t(presentation.placeholder)}
    valueLabel={valueLabel}
    groups={groups}
    disabled={disabled}
    indicator="none"
    width={presentation.width}
    onSelect={(value) => onSelect(control.id, value)}
  />;
});

function effortLabel(effort: string, t: (id: string) => string) {
  const key = `agent.effort.${effort}`;
  const localized = t(key);
  if (localized !== key) return localized;
  return effort.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
