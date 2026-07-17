type AgentBrandMarkProps = {
  iconKey?: string | null;
  label: string;
  kind?: "agent" | "provider";
};

/** Local official product marks; no remote fetches or backend protocol knowledge. */
export function AgentBrandMark({ iconKey, label, kind = "agent" }: AgentBrandMarkProps) {
  const identity = `${iconKey || ""} ${label}`.toLowerCase();

  if (identity.includes("puppyone")) {
    return <span className="desktop-agent-brand-mark is-puppyone" aria-hidden="true"><img src="/PuppyAgentLOGO.png" alt="" draggable={false} /></span>;
  }

  if (identity.includes("codex") || identity.includes("openai")) {
    return <span className="desktop-agent-brand-mark is-openai" aria-hidden="true"><img src="/icons/ChatGPT_logo.png" alt="" draggable={false} /></span>;
  }

  if (identity.includes("claude") || identity.includes("anthropic")) {
    return <span className="desktop-agent-brand-mark is-claude" aria-hidden="true"><img src="/icons/agent-claude-code.svg" alt="" draggable={false} /></span>;
  }

  if (identity.includes("cursor")) {
    return <span className="desktop-agent-brand-mark is-cursor" aria-hidden="true"><img src="/icons/agent-cursor.svg" alt="" draggable={false} /></span>;
  }

  if (identity.includes("opencode")) {
    return <span className="desktop-agent-brand-mark is-opencode" aria-hidden="true"><img src="/icons/agent-opencode.svg" alt="" draggable={false} /></span>;
  }

  const initials = label.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "A";
  return <span className={`desktop-agent-brand-mark is-fallback is-${kind}`} aria-hidden="true">{initials}</span>;
}
