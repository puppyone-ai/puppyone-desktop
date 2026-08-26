import {
  Clock3,
  FileText,
  Folder,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";
import type { CloudWorkspaceSection } from "../types";
import { CloudPublishFolderMark } from "./CloudPublishHeroMarks";
import "./mcp-activation.css";

type CloudActivationKind = "mcp" | "overview" | "automation" | "access";

const ACTIVATION_COPY = {
  mcp: {
    titleId: "cloud.auth.getCloud",
    descriptionId: "cloud.auth.shortDescription",
  },
  overview: {
    titleId: "cloud.activation.overview.title",
    descriptionId: "cloud.activation.overview.description",
  },
  automation: {
    titleId: "cloud.activation.automation.title",
    descriptionId: "cloud.activation.automation.description",
  },
  access: {
    titleId: "cloud.activation.access.title",
    descriptionId: "cloud.activation.access.description",
  },
} as const;

export function CloudActivationHero({
  activeSection,
  ariaLabel,
  className,
  titleId,
  action,
  supplemental,
}: {
  activeSection: CloudWorkspaceSection;
  ariaLabel?: string;
  className?: string;
  titleId?: string;
  action: ReactNode;
  supplemental?: ReactNode;
}) {
  const { t } = useLocalization();
  const generatedTitleId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;
  const kind = getCloudActivationKind(activeSection);
  const copy = ACTIVATION_COPY[kind];
  const title = t(copy.titleId);
  const rootClassName = [
    "desktop-cloud-mcp-activation",
    `is-${kind}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <section
      className={rootClassName}
      aria-label={ariaLabel ?? title}
      aria-labelledby={resolvedTitleId}
    >
      <div className="desktop-cloud-mcp-activation-copy">
        <header className="desktop-cloud-mcp-activation-header">
          <h1 id={resolvedTitleId}>{title}</h1>
          <p className="desktop-entry-state-description desktop-cloud-mcp-activation-description">
            {t(copy.descriptionId)}
          </p>
        </header>

        {supplemental && (
          <div className="desktop-cloud-mcp-activation-supplemental">
            {supplemental}
          </div>
        )}

        <div className="desktop-cloud-mcp-activation-actions">
          {action}
        </div>
      </div>

      <CloudActivationIllustration kind={kind} />
    </section>
  );
}

function getCloudActivationKind(section: CloudWorkspaceSection): CloudActivationKind {
  if (section === "automation") return "automation";
  if (section === "access") return "access";
  if (["contents", "history", "settings"].includes(section)) return "overview";
  return "mcp";
}

function CloudActivationIllustration({ kind }: { kind: CloudActivationKind }) {
  if (kind === "overview") return <CloudOverviewActivationIllustration />;
  if (kind === "automation") return <CloudAutomationActivationIllustration />;
  if (kind === "access") return <CloudAccessActivationIllustration />;
  return <CloudMcpConnectionIllustration />;
}

function CloudOverviewActivationIllustration() {
  return (
    <div className="desktop-cloud-activation-illustration is-overview" aria-hidden="true">
      <div className="desktop-cloud-activation-overview-card">
        <span className="desktop-cloud-activation-overview-row is-project">
          <Folder size={25} />
          <span className="desktop-cloud-activation-faux-copy"><i /><i /></span>
          <b />
        </span>
        <span className="desktop-cloud-activation-overview-row">
          <FileText size={17} />
          <span className="desktop-cloud-activation-faux-copy"><i /><i /></span>
          <em />
        </span>
        <span className="desktop-cloud-activation-overview-row">
          <UserRound size={17} />
          <span className="desktop-cloud-activation-faux-copy"><i /><i /></span>
          <em />
        </span>
      </div>
    </div>
  );
}

function CloudAutomationActivationIllustration() {
  return (
    <div className="desktop-cloud-activation-illustration is-automation" aria-hidden="true">
      <div className="desktop-cloud-activation-schedule-card">
        <span><Clock3 size={19} /><strong>09:00</strong></span>
        <span className="desktop-cloud-activation-faux-copy"><i /><i /></span>
      </div>
      <span className="desktop-cloud-activation-automation-link">
        <i /><i /><Sparkles size={22} /><i /><i />
      </span>
      <span className="desktop-cloud-activation-file-card"><FileText size={25} /></span>
    </div>
  );
}

function CloudAccessActivationIllustration() {
  return (
    <div className="desktop-cloud-activation-illustration is-access" aria-hidden="true">
      <span className="desktop-cloud-activation-identity"><UserRound size={22} /></span>
      <span className="desktop-cloud-activation-access-link" />
      <span className="desktop-cloud-activation-access-folder">
        <CloudPublishFolderMark />
        <ShieldCheck />
      </span>
      <span className="desktop-cloud-activation-access-link" />
      <span className="desktop-cloud-activation-identity"><Sparkles size={22} /></span>
    </div>
  );
}

function CloudMcpConnectionIllustration() {
  return (
    <div className="desktop-cloud-mcp-illustration" aria-hidden="true">
      <div className="desktop-cloud-mcp-folder">
        <CloudPublishFolderMark className="desktop-cloud-mcp-folder-shape" />
        <McpBrandMark />
      </div>
      <span className="desktop-cloud-mcp-connector" />
      <div className="desktop-cloud-mcp-phone">
        <span className="desktop-cloud-mcp-phone-speaker" />
        <div className="desktop-cloud-mcp-agent-grid">
          <AgentTile label="ChatGPT" kind="chatgpt" />
          <AgentTile label="Claude" kind="claude" />
          <AgentTile label="Cursor" kind="cursor" />
          <AgentTile label="Manus" kind="manus" />
          <AgentTile label="Hermes" kind="hermes" />
          <AgentTile label="Grok" kind="grok" />
        </div>
      </div>
    </div>
  );
}

function McpBrandMark() {
  return (
    <svg
      className="desktop-cloud-mcp-folder-logo"
      viewBox="0 0 180 180"
      fill="none"
      focusable="false"
    >
      <path
        d="M18 84.8528L85.8822 16.9706C95.2548 7.59798 110.451 7.59798 119.823 16.9706C129.196 26.3431 129.196 41.5391 119.823 50.9117L68.5581 102.177"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M69.2652 101.47L119.823 50.9117C129.196 41.5391 144.392 41.5391 153.765 50.9117L154.118 51.2652C163.491 60.6378 163.491 75.8338 154.118 85.2063L92.7248 146.6C89.6006 149.724 89.6006 154.789 92.7248 157.913L105.331 170.52"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M102.853 33.9411L52.6482 84.1457C43.2756 93.5183 43.2756 108.714 52.6482 118.087C62.0208 127.459 77.2167 127.459 86.5893 118.087L136.794 67.8822"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

type AgentKind = "chatgpt" | "claude" | "cursor" | "manus" | "hermes" | "grok";

function AgentTile({ label, kind }: { label: string; kind: AgentKind }) {
  return (
    <div className={`desktop-cloud-mcp-agent is-${kind}`}>
      <span className="desktop-cloud-mcp-agent-icon">
        <AgentMark kind={kind} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function AgentMark({ kind }: { kind: AgentKind }) {
  if (kind === "chatgpt") {
    return <img src={resolveRendererPublicAssetUrl("icons/ChatGPT_logo.png")} alt="" draggable={false} />;
  }
  if (kind === "claude") {
    return <img src={resolveRendererPublicAssetUrl("icons/agent-claude-code.svg")} alt="" draggable={false} />;
  }
  if (kind === "cursor") {
    return <img src={resolveRendererPublicAssetUrl("icons/agent-cursor.svg")} alt="" draggable={false} />;
  }
  if (kind === "manus") {
    return <img src={resolveRendererPublicAssetUrl("icons/agent-manus.svg")} alt="" draggable={false} />;
  }
  if (kind === "hermes") {
    return (
      <svg viewBox="0 0 40 40" fill="none" focusable="false">
        <path d="M7 26.5c7.2-.1 14.8-4.8 20.3-12.8-2.6 8.7-8.7 15.1-18.9 17.4" />
        <path d="M10.4 20.9c7-.5 12-3.9 16.3-9.8-2 7.2-7.1 12.2-14.7 14.5" />
        <path d="M15.1 15.5c4.5-.8 7.7-2.7 10.4-6-1.3 4.4-4.7 7.8-9.8 9.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" fill="none" focusable="false">
      <path d="M29.8 13.4a12.2 12.2 0 1 0 1.3 11.4" />
      <path d="M8.4 32.1 31.9 8.6" />
    </svg>
  );
}
