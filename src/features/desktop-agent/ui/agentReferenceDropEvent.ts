/** Minimal drop contract shared by the Chat boundary and structured editor. */
export type AgentReferenceDropEvent = {
  dataTransfer: DataTransfer;
  preventDefault: () => void;
  stopPropagation: () => void;
  defaultPrevented: boolean;
};
