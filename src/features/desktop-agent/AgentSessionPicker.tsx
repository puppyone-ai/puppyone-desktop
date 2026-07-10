export type AgentSessionPickerEntry = {
  sessionId: string;
  title: string;
  provider: string;
  workspaceRoot: string;
  updatedAt: string;
  terminalState: string;
  partial: boolean;
};

type AgentSessionPickerProps = {
  open: boolean;
  entries: AgentSessionPickerEntry[];
  onSelect: (sessionId: string) => void;
  onClose: () => void;
};

/**
 * Session-history picker (right-sidebar.md "Session history").
 *
 * Proposed: the header overflow menu does not yet expose history, and no
 * caller mounts this component. It exists as a typed no-op stub so the
 * component map matches the architecture doc ahead of implementation.
 */
export function AgentSessionPicker(_props: AgentSessionPickerProps) {
  return null;
}
