import type {
  AgentAttachmentKind,
  AgentReferenceInputCapabilities,
} from "./types";

export type AgentAttachmentDescriptor = Readonly<{
  mime?: string | null;
  name?: string | null;
}>;

export function classifyAgentAttachment(attachment?: AgentAttachmentDescriptor): AgentAttachmentKind;
export function acceptsAgentAttachment(
  capabilities: AgentReferenceInputCapabilities | null | undefined,
  attachment: AgentAttachmentDescriptor,
): boolean;
export function hasAgentAttachmentSupport(
  capabilities: AgentReferenceInputCapabilities | null | undefined,
): boolean;
export function acceptedAgentAttachmentPickerTypes(
  capabilities: AgentReferenceInputCapabilities | null | undefined,
): string[];
export function isTextMime(value?: string | null): boolean;
export const agentAttachmentKinds: readonly AgentAttachmentKind[];
