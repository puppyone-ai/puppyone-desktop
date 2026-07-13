import { Check, ChevronRight, Cloud, Copy, ExternalLink, FileText, FolderOpen, GitBranch, RefreshCw, Server } from "lucide-react";
import { FilePreviewIcon, type Workspace } from "@puppyone/shared-ui";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { useState, type ReactNode } from "react";
import type {
  DesktopCloudDashboard,
  DesktopCloudMcpEndpoint,
  DesktopCloudProject,
  DesktopCloudTreeEntry,
} from "../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../lib/cloudHistoryApi";
import type { CloudAccessIconComponent } from "../accessFilters";
import type { CloudWorkspaceSection } from "../types";
import { PageLoading } from "../../../components/loading";
import {
  copyText,
  formatCloudTreeEntryDetail,
  formatCommitChangeCount,
  formatRelativeTime,
  formatStatusLabel,
  normalizeCloudEntryPath,
  shortCommit,
} from "../utils";

export function CloudWorkspaceLoadingState({ label }: { label?: string }) {
  const { t } = useLocalization();
  const resolvedLabel = label ?? t("cloud.common.loading");
  return (
    <div className="desktop-cloud-loading-state" role="status" aria-label={resolvedLabel}>
      <PageLoading
        variant="fill"
        tone="info"
        label={resolvedLabel}
        style={{ width: "auto", height: "auto", minHeight: 0, gap: 8 }}
      />
    </div>
  );
}

export function CloudMainSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: string | number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="desktop-cloud-section-card">
      <div className="desktop-cloud-section-card-header">
        <div>
          <span>{title}</span>
          {count !== undefined && <small>{count}</small>}
        </div>
        {action}
      </div>
      <div className="desktop-cloud-section-card-body">
        {children}
      </div>
    </section>
  );
}

export function CloudMainMetric({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "ready" | "warning";
  mono?: boolean;
}) {
  return (
    <div className={`desktop-cloud-main-metric ${tone ?? ""} ${mono ? "mono" : ""}`}>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

export function CloudAuthorityCell({
  label,
  value,
  title,
  tone,
  mono,
}: {
  label: string;
  value: string;
  title?: string;
  tone?: "ready" | "warning";
  mono?: boolean;
}) {
  return (
    <div className={`desktop-cloud-authority-cell ${tone ?? ""} ${mono ? "mono" : ""}`}>
      <span>{label}</span>
      <strong title={title ?? value}>{value}</strong>
    </div>
  );
}

export function CloudAssetGrid({
  entries,
  emptyLabel,
  emptyDetail,
  loading = false,
  onEntryClick,
}: {
  entries: DesktopCloudTreeEntry[];
  emptyLabel: string;
  emptyDetail: string;
  loading?: boolean;
  onEntryClick: (entry: DesktopCloudTreeEntry) => void;
}) {
  const localization = useLocalization();
  if (loading) {
    return <PageLoading variant="fill" label={localization.t("cloud.common.loading")} className="desktop-cloud-asset-loading" />;
  }

  if (entries.length === 0) {
    return <CloudInlineEmpty icon={FolderOpen} title={emptyLabel} detail={emptyDetail} />;
  }

  return (
    <div className="desktop-cloud-asset-grid">
      {entries.map((entry) => (
        <button
          className="desktop-cloud-asset-tile"
          key={entry.path || entry.name}
          type="button"
          title={entry.path || entry.name}
          onClick={() => onEntryClick(entry)}
        >
          <span className="desktop-cloud-asset-icon">
            <CloudFilePreviewIcon
              name={entry.name || entry.path}
              type={entry.type}
              size={44}
              childrenCount={entry.children_count ?? undefined}
            />
          </span>
          <strong>{entry.name || entry.path}</strong>
          <small>{formatCloudTreeEntryDetail(entry, localization)}</small>
        </button>
      ))}
    </div>
  );
}

export function CloudFilePreviewIcon({
  name,
  type,
  size,
  childrenCount,
}: {
  name: string;
  type?: string | null;
  size: number;
  childrenCount?: number | null;
}) {
  if (type === "folder") {
    return (
      <span
        className="desktop-cloud-folder-icon"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img src="/icons/folder.svg" alt="" width={size} height={size} />
        {childrenCount != null && childrenCount > 0 && (
          <em>{childrenCount}</em>
        )}
      </span>
    );
  }

  return <FilePreviewIcon name={name} type={type} size={size} childrenCount={childrenCount} />;
}

export function CloudPathBreadcrumb({
  path,
  onSelectPath,
}: {
  path: string;
  onSelectPath: (path: string) => void;
}) {
  const { t } = useLocalization();
  const parts = normalizeCloudEntryPath(path).split("/").filter(Boolean);
  const crumbs = [
    { label: t("cloud.common.cloudSource"), path: "" },
    ...parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join("/"),
    })),
  ];

  return (
    <div className="desktop-cloud-path-breadcrumb" aria-label={t("cloud.path.ariaLabel")}>
      {crumbs.map((crumb, index) => (
        <button
          key={crumb.path || "root"}
          type="button"
          className={index === crumbs.length - 1 ? "active" : ""}
          onClick={() => onSelectPath(crumb.path)}
        >
          {index > 0 && <ChevronRight className="desktop-cloud-directional-icon" size={12} />}
          <span dir="auto">{crumb.label}</span>
        </button>
      ))}
    </div>
  );
}

export function CloudWebPage({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useLocalization();
  return (
    <section className={`desktop-cloud-web-page ${className ?? ""}`}>
      <div className="desktop-cloud-web-header">
        <div>
          <span>{title}</span>
          {count !== undefined && <small>{count}</small>}
        </div>
        {action}
      </div>
      <div className="desktop-cloud-web-body">
        {children}
      </div>
    </section>
  );
}

export function CloudSectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="desktop-cloud-section-label">
      <span>{children}</span>
      {right}
    </div>
  );
}

export function CloudWebEmpty({
  icon: Icon,
  title,
  detail,
}: {
  icon: CloudAccessIconComponent;
  title: string;
  detail: string;
}) {
  return (
    <div className="desktop-cloud-web-empty">
      <span><Icon size={18} /></span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function CloudSourceDock({
  remote,
  branch,
  title,
}: {
  remote: string;
  branch: string;
  title?: string;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-cloud-source-dock" title={title}>
      <span className="desktop-cloud-web-status-dot ready" aria-hidden="true" />
      <strong>{t("cloud.common.cloudSource")}</strong>
      <em dir="auto">{remote}</em>
      <em dir="auto">{branch}</em>
    </div>
  );
}

export function CloudPromptBlock({ value }: { value: string }) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="desktop-cloud-prompt-block">
      <pre>{value}</pre>
      <button type="button" onClick={handleCopy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? t("cloud.common.copied") : t("cloud.common.copyPrompt")}</span>
      </button>
    </div>
  );
}

export function CloudCommandBlock({
  label,
  value,
  disabled,
}: {
  label: string;
  value: string;
  disabled?: boolean;
}) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (disabled) return;
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="desktop-cloud-command-block">
      <div>
        <span>{label}</span>
        <button type="button" disabled={disabled} aria-label={t("cloud.common.copyValue", { label })} onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre>{value}</pre>
    </div>
  );
}

export function CloudMethodSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useLocalization();
  return (
    <section className="desktop-cloud-method-section">
      <CloudSectionLabel>{title}</CloudSectionLabel>
      {children}
    </section>
  );
}

export function CloudMethodCard({
  icon: Icon,
  subtitle,
  active,
  children,
}: {
  icon: typeof Cloud;
  subtitle: string;
  active: boolean;
  children: ReactNode;
}) {
  const { t } = useLocalization();
  return (
    <div className={`desktop-cloud-method-card ${active ? "active" : ""}`}>
      <div className="desktop-cloud-method-card-header">
        <span><Icon size={16} /></span>
        <strong>{subtitle}</strong>
        <em>{t(active ? "cloud.status.active" : "cloud.status.needs-key")}</em>
      </div>
      {active && <div className="desktop-cloud-method-card-body">{children}</div>}
      {!active && <div className="desktop-cloud-method-card-body">{children}</div>}
    </div>
  );
}

export function CloudMcpEndpointCard({
  endpoint,
  apiBase,
  onOpen,
  compact = false,
}: {
  endpoint: DesktopCloudMcpEndpoint;
  apiBase: string;
  onOpen: () => void;
  compact?: boolean;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const serverUrl = endpoint.api_key && apiBase ? `${apiBase}/api/v1/mcp/server/${endpoint.api_key}` : "";
  const accessLabel = endpoint.accesses?.length
    ? endpoint.accesses.map((access) => access.path || "/").join(", ")
    : endpoint.path || "/";

  return (
    <div className={`desktop-cloud-mcp-card ${compact ? "compact" : ""}`}>
      <div className="desktop-cloud-mcp-card-header">
        <span><Server size={15} /></span>
        <div>
          <strong dir="auto">{endpoint.name || t("cloud.access.surface.mcp.endpoint")}</strong>
          <small><bdi>{accessLabel}</bdi> · {formatStatusLabel(endpoint.status || "active", t)}</small>
        </div>
        <button className="desktop-cloud-row-action" type="button" onClick={onOpen}>{t("cloud.common.open")}</button>
      </div>
      {serverUrl ? (
        <CloudCommandBlock label={t("cloud.access.command.server-url")} value={serverUrl} />
      ) : (
        <div className="desktop-cloud-mcp-key-hint">
          <span>{t("cloud.common.apiKey")}</span>
          <strong>{endpoint.api_key_hint || t("cloud.common.hidden")}</strong>
        </div>
      )}
      {!compact && endpoint.description && <p>{endpoint.description}</p>}
    </div>
  );
}

export function CloudProjectRow({
  project,
  action,
  onOpenProject,
  onConnectProject,
  onCopyCloneCommand,
}: {
  project: DesktopCloudProject;
  action: { kind: "backup" | "connect" | "copy" | null; projectId: string | null };
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onConnectProject: (project: DesktopCloudProject) => void;
  onCopyCloneCommand: (project: DesktopCloudProject) => void;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const busy = action.projectId === project.id ? action.kind : null;
  return (
    <div className="desktop-cloud-project-row">
      <span><Cloud size={15} /></span>
      <div>
        <strong title={project.name} dir="auto">{project.name}</strong>
        <small dir={project.description ? "auto" : undefined}>{project.description || t("cloud.project.updated", {
          time: bidiIsolate(project.updated_at ? formatRelativeTime(project.updated_at, localization) : t("cloud.time.recently")),
        })}</small>
      </div>
      <div className="desktop-cloud-project-row-actions">
        <button type="button" onClick={() => onOpenProject(project.id, "access")}>{t("cloud.common.open")}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => onConnectProject(project)}>
          {t(busy === "connect" ? "cloud.project.connecting" : "cloud.project.useHere")}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => onCopyCloneCommand(project)}>
          {t(busy === "copy" ? "cloud.common.copying" : "cloud.project.cloneCommand")}
        </button>
      </div>
    </div>
  );
}

export function CloudInlineEmpty({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Cloud;
  title: string;
  detail: string;
}) {
  return (
    <div className="desktop-cloud-inline-empty">
      <span><Icon size={15} /></span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
