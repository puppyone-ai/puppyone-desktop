import type { ReactNode } from "react";

type AgentToolEvidenceNodeKind = "command" | "request" | "result";

export function AgentToolEvidenceTree({ children }: { children: ReactNode }) {
  return <div className="desktop-agent-evidence-tree">{children}</div>;
}

export function AgentToolEvidenceNode({
  kind,
  marker,
  children,
}: {
  kind: AgentToolEvidenceNodeKind;
  marker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`desktop-agent-evidence-node is-${kind}`} data-evidence-kind={kind}>
      {marker !== undefined && <span className="desktop-agent-evidence-marker" aria-hidden="true">{marker}</span>}
      <div className="desktop-agent-evidence-content">{children}</div>
    </div>
  );
}
