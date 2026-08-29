import {
  RENDERER_ASSET_PATHS,
  resolveRendererPublicAssetUrl,
} from "@puppyone/shared-ui";
import { PuppyBrandMark } from "../../../components/brand/PuppyBrandMark";

type AgentBrandMarkProps = {
  iconKey?: string | null;
  label: string;
  kind?: "agent" | "provider";
};

/** Local official product marks; no remote fetches or backend protocol knowledge. */
export function AgentBrandMark({ iconKey, label, kind = "agent" }: AgentBrandMarkProps) {
  const identity = `${iconKey || ""} ${label}`.toLowerCase();
  const agents = RENDERER_ASSET_PATHS.icons.agents;

  if (identity.includes("puppyone")) {
    return <span className="desktop-agent-brand-mark is-puppyone" aria-hidden="true"><PuppyBrandMark tone="dark" /></span>;
  }

  if (identity.includes("codex") || identity.includes("openai")) {
    return <span className="desktop-agent-brand-mark is-codex" aria-hidden="true"><img src={resolveRendererPublicAssetUrl(agents.codexLight)} alt="" draggable={false} /></span>;
  }

  if (identity.includes("claude") || identity.includes("anthropic")) {
    return <span className="desktop-agent-brand-mark is-claude" aria-hidden="true"><img src={resolveRendererPublicAssetUrl(agents.claudeCode)} alt="" draggable={false} /></span>;
  }

  if (identity.includes("cursor")) {
    return <span className="desktop-agent-brand-mark is-cursor" aria-hidden="true"><img src={resolveRendererPublicAssetUrl(agents.cursor)} alt="" draggable={false} /></span>;
  }

  if (identity.includes("opencode")) {
    return <span className="desktop-agent-brand-mark is-opencode" aria-hidden="true"><img src={resolveRendererPublicAssetUrl(agents.opencode)} alt="" draggable={false} /></span>;
  }

  const initials = label.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "A";
  return <span className={`desktop-agent-brand-mark is-fallback is-${kind}`} aria-hidden="true">{initials}</span>;
}
