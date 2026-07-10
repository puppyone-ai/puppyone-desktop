import type { AgentCapabilities } from "./agentTypes";

export type AgentQuestion = {
  requestId: string;
  turnId: string;
  itemId: string | null;
  prompts: string[];
  options: string[];
  allowFreeform: boolean;
};

type AgentQuestionDockProps = {
  question: AgentQuestion | null;
  capabilities: AgentCapabilities | null;
  onSubmit: (answer: string | string[]) => void;
  onCancel: () => void;
};

/**
 * Structured-question dock (right-sidebar.md "Structured-question dock").
 *
 * Provider structured questions remain Proposed: no adapter currently
 * advertises `structuredQuestions`, and `AgentService.resolveQuestion` fails
 * closed. This component intentionally renders nothing until a session's
 * capability snapshot reports `structuredQuestions: true`, so it is safe to
 * mount unconditionally ahead of that capability landing.
 */
export function AgentQuestionDock({ question, capabilities }: AgentQuestionDockProps) {
  if (!question || !capabilities?.structuredQuestions) return null;
  return null;
}
