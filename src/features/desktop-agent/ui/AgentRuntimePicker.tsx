import { memo } from "react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentRuntimeCatalogEntry } from "../domain/agent-contract";
import { isSelectableAgentBackend } from "../domain/agent-backend-routing";
import { AgentBrandMark } from "./AgentBrandMark";
import { AgentPickerPopover, type AgentPickerGroup, type AgentPickerOption } from "./AgentPickerPopover";

export type AgentRuntimePickerProps = {
  agentRuntimes: AgentRuntimeCatalogEntry[];
  selectedRuntimeId: string | null;
  disabled?: boolean;
  onSelectRuntime: (runtimeId: string) => void;
};

/** Selects a complete Agent product/harness. Model providers are configured inside managed runtimes. */
export const AgentRuntimePicker = memo(function AgentRuntimePicker({
  agentRuntimes,
  selectedRuntimeId,
  disabled = false,
  onSelectRuntime,
}: AgentRuntimePickerProps) {
  const { t } = useLocalization();
  const availableRuntimes = agentRuntimes.filter((entry) => Boolean(entry?.descriptor?.id && entry?.readiness));
  const selected = availableRuntimes.find((entry) => entry.descriptor.id === selectedRuntimeId) ?? null;
  const options: AgentPickerOption[] = availableRuntimes.map((entry) => {
    const runnable = isSelectableAgentBackend(entry);
    return {
      id: entry.descriptor.id,
      label: entry.descriptor.displayName,
      description: entry.descriptor.description,
      warning: runnable ? undefined : readinessWarning(entry, t),
      meta: entry.descriptor.version || entry.readiness.version || distributionLabel(entry.descriptor.distribution, t),
      keywords: `${entry.descriptor.id} ${entry.descriptor.kind || ""} ${entry.descriptor.source || ""}`,
      // A non-ready runtime remains inspectable/selectable; execution is gated by readiness.
      selectable: true,
      selected: entry.descriptor.id === selectedRuntimeId,
      kind: "agent",
      icon: <AgentBrandMark kind="agent" iconKey={entry.descriptor.iconKey} label={entry.descriptor.displayName} />,
    };
  });
  const groups: AgentPickerGroup[] = [{ id: "agents", label: "", options }];

  return (
    <AgentPickerPopover
      ariaLabel={t("agent.runtime.ariaLabel")}
      placeholder={t("agent.runtime.placeholder")}
      valueLabel={selected?.descriptor.displayName}
      triggerIcon={selected
        ? <AgentBrandMark kind="agent" iconKey={selected.descriptor.iconKey} label={selected.descriptor.displayName} />
        : undefined}
      title={selected
        ? t("agent.runtime.selectedTitle", { agent: bidiIsolate(selected.descriptor.displayName) })
        : t("agent.runtime.choose")}
      triggerDescription={t("agent.runtime.switchStartsNewChat")}
      groups={groups}
      disabled={disabled || availableRuntimes.length === 0}
      className="is-agent is-header"
      onSelect={onSelectRuntime}
    />
  );
});

function distributionLabel(value: string | null | undefined, t: MessageFormatter) {
  if (value === "bundled") return t("agent.runtime.distribution.managed");
  if (value === "sdk-bundled") return t("agent.runtime.distribution.nativeSdk");
  if (value === "user-installed") return t("agent.runtime.distribution.local");
  return undefined;
}

function readinessWarning(entry: AgentRuntimeCatalogEntry, t: MessageFormatter) {
  const detail = entry.readiness.message || entry.descriptor.description;
  const detailValue = bidiIsolate(detail || t("agent.runtime.notReady"));
  if (entry.readiness.status === "unsupported-version") return t("agent.runtime.warning.update", { detail: detailValue });
  if (entry.readiness.status === "installed-not-authenticated") return t("agent.runtime.warning.setup", { detail: detailValue });
  if (entry.readiness.status === "protocol-unavailable") return t("agent.runtime.warning.integration", { detail: detailValue });
  if (entry.readiness.status === "not-installed") return t("agent.runtime.warning.notInstalled", { detail: detailValue });
  return detail || t("agent.runtime.notReady");
}
