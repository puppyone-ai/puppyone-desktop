import { memo } from "react";
import { Brain } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { AgentPickerPopover, type AgentPickerGroup } from "./AgentPickerPopover";

type AgentEffortPickerProps = {
  efforts: string[];
  selectedEffort: string | null;
  disabled?: boolean;
  onSelectEffort: (effort: string) => void;
};

export const AgentEffortPicker = memo(function AgentEffortPicker({
  efforts,
  selectedEffort,
  disabled = false,
  onSelectEffort,
}: AgentEffortPickerProps) {
  const { t } = useLocalization();
  const groups: AgentPickerGroup[] = [{
    id: "reasoning-effort",
    label: t("agent.effort.reasoning"),
    options: efforts.map((effort) => ({
      id: effort,
      label: effortLabel(effort, t),
      keywords: effort,
      selectable: true,
      selected: effort === selectedEffort,
      kind: "effort",
      icon: null,
    })),
  }];
  return (
    <AgentPickerPopover
      ariaLabel={t("agent.effort.ariaLabel")}
      placeholder={t("agent.effort.placeholder")}
      valueLabel={selectedEffort ? effortLabel(selectedEffort, t) : null}
      groups={groups}
      disabled={disabled}
      className="is-effort"
      triggerIcon={<Brain size={13} strokeWidth={1.8} aria-hidden="true" />}
      onSelect={onSelectEffort}
    />
  );
});

function effortLabel(effort: string, t: (id: string) => string) {
  const key = `agent.effort.${effort}`;
  const localized = t(key);
  if (localized !== key) return localized;
  return effort.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
