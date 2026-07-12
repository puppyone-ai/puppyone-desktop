import { Cable, TerminalSquare } from "lucide-react";
import type { AgentInferenceProvider, AgentLocalConnection } from "../domain/agent-contract";
import { AgentPickerPopover, type AgentPickerGroup, type AgentPickerOption } from "./AgentPickerPopover";

type AgentProviderPickerProps = {
  providers: AgentInferenceProvider[];
  localConnections: AgentLocalConnection[];
  localConnectionsPhase: "idle" | "loading" | "ready" | "error";
  localConnectionsError?: string | null;
  selectedProviderId: string | null;
  disabled?: boolean;
  onSelectProvider: (providerId: string) => void;
  onDiscoverLocalConnections: (refresh: boolean) => void | Promise<void>;
};

export function AgentProviderPicker({
  providers,
  localConnections,
  localConnectionsPhase,
  localConnectionsError = null,
  selectedProviderId,
  disabled = false,
  onSelectProvider,
  onDiscoverLocalConnections,
}: AgentProviderPickerProps) {
  const selected = providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const connectedOptions: AgentPickerOption[] = providers.length > 0
    ? providers.map((provider) => ({
      id: provider.id,
      label: provider.displayName,
      description: "Available through the managed OpenCode engine",
      meta: `${provider.modelCount} ${provider.modelCount === 1 ? "model" : "models"}`,
      keywords: `${provider.id} ${provider.source || ""}`,
      selectable: true,
      selected: provider.id === selectedProviderId,
      kind: "connected",
      icon: <Cable size={13} />,
    }))
    : [statusOption("connected-empty", "No connected routes", "Connect a model provider before sending a message.")];
  const visibleLocalConnections = localConnections.filter((connection) => connection.installation !== "not-found");
  const localOptions = visibleLocalConnections.length > 0
    ? visibleLocalConnections.map(localConnectionOption)
    : localConnectionsPhase === "loading" || localConnectionsPhase === "idle"
      ? [statusOption("local-loading", "Checking local tools…", "Looking for supported local Agent tools in known installation locations.")]
      : [statusOption("local-empty", "No supported local tools found", "No registered local Agent tools were found in known installation locations.")];
  const groups: AgentPickerGroup[] = [
    { id: "connected", label: "Connected routes", options: connectedOptions },
    { id: "local", label: "Local tools on this Mac", options: localOptions },
  ];

  return (
    <AgentPickerPopover
      ariaLabel="Agent provider"
      placeholder="Provider"
      valueLabel={selected?.displayName}
      groups={groups}
      disabled={disabled}
      loading={localConnectionsPhase === "loading"}
      error={localConnectionsError}
      className="is-provider"
      onOpen={() => { void onDiscoverLocalConnections(false); }}
      onRefresh={() => { void onDiscoverLocalConnections(true); }}
      onSelect={onSelectProvider}
    />
  );
}

function localConnectionOption(connection: AgentLocalConnection): AgentPickerOption {
  return {
    id: `local:${connection.id}`,
    label: connection.displayName,
    description: shortStatus(connection),
    detail: connection.statusMessage,
    meta: connection.version || undefined,
    keywords: `${connection.id} ${connection.authentication} ${connection.integration}`,
    // Local inventory is explanatory only. A future bridge appears as a
    // connected OpenCode route instead of turning this row into a Provider.
    selectable: false,
    kind: "local",
    icon: <TerminalSquare size={13} />,
  };
}

function shortStatus(connection: AgentLocalConnection) {
  const authentication = connection.authentication === "signed-in"
    ? "Signed in"
    : connection.authentication === "signed-out"
      ? "Sign-in required"
      : connection.authentication === "expired"
        ? "Session expired"
        : connection.authentication === "error"
          ? "Status unavailable"
          : "Detected";
  const integration = connection.integration === "bridge-required"
    ? "OpenCode bridge required"
    : connection.integration === "incompatible"
      ? "Incompatible"
      : connection.integration === "blocked"
        ? "Needs attention"
        : "Inventory only";
  return `${authentication} · ${integration}`;
}

function statusOption(id: string, label: string, detail: string): AgentPickerOption {
  return {
    id,
    label,
    description: detail,
    detail,
    selectable: false,
    kind: "status",
  };
}
