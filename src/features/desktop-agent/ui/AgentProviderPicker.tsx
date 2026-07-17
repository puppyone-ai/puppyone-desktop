import { memo } from "react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentRuntimeCatalogEntry } from "../domain/agent-contract";
import { isSelectableAgentBackend } from "../domain/agent-backend-routing";
import { AgentBrandMark } from "./AgentBrandMark";
import { AgentPickerPopover, type AgentPickerGroup, type AgentPickerOption } from "./AgentPickerPopover";

type AgentProviderPickerProps = {
  agentProviders: AgentRuntimeCatalogEntry[];
  selectedAgentProviderId: string | null;
  disabled?: boolean;
  onSelectAgentProvider: (providerId: string) => void;
};

export const AgentProviderPicker = memo(function AgentProviderPicker({
  agentProviders,
  selectedAgentProviderId,
  disabled = false,
  onSelectAgentProvider,
}: AgentProviderPickerProps) {
  const { t } = useLocalization();
  const availableProviders = agentProviders.filter((entry) => Boolean(entry?.descriptor?.id && entry?.readiness));
  const selected = availableProviders.find((entry) => entry.descriptor.id === selectedAgentProviderId) ?? null;
  const options: AgentPickerOption[] = [];

  for (const entry of availableProviders) {
    const runnable = isSelectableAgentBackend(entry);
    const option: AgentPickerOption = {
      id: entry.descriptor.id,
      label: entry.descriptor.displayName,
      description: entry.descriptor.description,
      warning: runnable ? undefined : readinessWarning(entry, t),
      meta: entry.descriptor.version || entry.readiness.version || distributionLabel(entry.descriptor.distribution, t),
      keywords: `${entry.descriptor.id} ${entry.descriptor.kind || ""} ${entry.descriptor.source || ""}`,
      // Selection is a presentation concern; readiness only gates execution.
      selectable: true,
      selected: entry.descriptor.id === selectedAgentProviderId,
      kind: "provider",
      icon: <AgentBrandMark kind="provider" iconKey={entry.descriptor.iconKey} label={entry.descriptor.displayName} />,
    };
    options.push(option);
  }

  const groups: AgentPickerGroup[] = [{ id: "providers", label: "", options }];

  return (
    <AgentPickerPopover
      ariaLabel={t("agent.provider.ariaLabel")}
      placeholder={t("agent.provider.placeholder")}
      valueLabel={selected?.descriptor.displayName}
      triggerIcon={selected ? <AgentBrandMark kind="provider" iconKey={selected.descriptor.iconKey} label={selected.descriptor.displayName} /> : undefined}
      title={selected
        ? t("agent.provider.selectedTitle", { provider: bidiIsolate(selected.descriptor.displayName) })
        : t("agent.provider.choose")}
      triggerDescription={t("agent.provider.switchStartsNewChat")}
      groups={groups}
      disabled={disabled || availableProviders.length === 0}
      className="is-provider is-header"
      onSelect={onSelectAgentProvider}
    />
  );
});

function distributionLabel(value: string | null | undefined, t: MessageFormatter) {
  if (value === "sdk-bundled") return t("agent.provider.distribution.nativeSdk");
  if (value === "user-installed") return t("agent.provider.distribution.local");
  return undefined;
}

function readinessWarning(entry: AgentRuntimeCatalogEntry, t: MessageFormatter) {
  const detail = entry.readiness.message || entry.descriptor.description;
  const detailValue = bidiIsolate(detail || t("agent.provider.notReady"));
  if (entry.readiness.status === "unsupported-version") return t("agent.provider.warning.update", { detail: detailValue });
  if (entry.readiness.status === "installed-not-authenticated") return t("agent.provider.warning.setup", { detail: detailValue });
  if (entry.readiness.status === "protocol-unavailable") return t("agent.provider.warning.integration", { detail: detailValue });
  if (entry.readiness.status === "not-installed") return t("agent.provider.warning.notInstalled", { detail: detailValue });
  return detail || t("agent.provider.notReady");
}
