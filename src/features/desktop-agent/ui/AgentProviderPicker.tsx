import { memo } from "react";
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
  const availableProviders = agentProviders.filter((entry) => Boolean(entry?.descriptor?.id && entry?.readiness));
  const selected = availableProviders.find((entry) => entry.descriptor.id === selectedAgentProviderId) ?? null;
  const options: AgentPickerOption[] = [];

  for (const entry of availableProviders) {
    const runnable = isSelectableAgentBackend(entry);
    const option: AgentPickerOption = {
      id: entry.descriptor.id,
      label: entry.descriptor.displayName,
      description: entry.descriptor.description,
      warning: runnable ? undefined : readinessWarning(entry),
      meta: entry.descriptor.version || entry.readiness.version || distributionLabel(entry.descriptor.distribution),
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
      ariaLabel="Coding agent provider"
      placeholder="Provider"
      valueLabel={selected?.descriptor.displayName}
      triggerIcon={selected ? <AgentBrandMark kind="provider" iconKey={selected.descriptor.iconKey} label={selected.descriptor.displayName} /> : undefined}
      title={selected ? `${selected.descriptor.displayName} · Switching provider starts a new chat` : "Choose a provider"}
      triggerDescription="Switching provider starts a new chat"
      groups={groups}
      disabled={disabled || availableProviders.length === 0}
      className="is-provider is-header"
      onSelect={onSelectAgentProvider}
    />
  );
});

function distributionLabel(value: string | null | undefined) {
  if (value === "sdk-bundled") return "Native SDK";
  if (value === "user-installed") return "Local";
  return undefined;
}

function readinessWarning(entry: AgentRuntimeCatalogEntry) {
  const message = entry.readiness.message || entry.descriptor.description || "This coding Agent is not ready yet.";
  if (entry.readiness.status === "unsupported-version") return `Update required. ${message}`;
  if (entry.readiness.status === "installed-not-authenticated") return `Setup required. ${message}`;
  if (entry.readiness.status === "protocol-unavailable") return `Integration unavailable. ${message}`;
  if (entry.readiness.status === "not-installed") return `Not installed. ${message}`;
  return message;
}
