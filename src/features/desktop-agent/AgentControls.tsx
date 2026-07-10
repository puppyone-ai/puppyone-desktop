import type { AgentModel } from "./agentTypes";

type AgentControlsProps = {
  providerLabel: string;
  models: AgentModel[];
  selectedModel: string | null;
  modelSelectionAvailable: boolean;
  disabled: boolean;
  onSelectModel: (model: string) => void;
};

export function AgentControls({
  providerLabel,
  models,
  selectedModel,
  modelSelectionAvailable,
  disabled,
  onSelectModel,
}: AgentControlsProps) {
  return (
    <div className="desktop-agent-controls">
      <div className="desktop-agent-provider-control">
        <span className="desktop-agent-provider-dot" /> {providerLabel}
      </div>
      {modelSelectionAvailable && models.length > 0 && (
        <label>
          <span className="desktop-agent-visually-hidden">{providerLabel} model</span>
          <select
            value={selectedModel ?? ""}
            disabled={disabled}
            onChange={(event) => onSelectModel(event.target.value)}
          >
            {models.map((model) => (
              <option value={model.model} key={model.id}>{model.displayName}</option>
            ))}
          </select>
        </label>
      )}
      {/* Mode selection (Agent/Plan/Ask) is Proposed: no provider currently
          advertises a real mode capability, so no control or label renders
          here rather than showing a static "Mode: Agent" placeholder. */}
    </div>
  );
}
