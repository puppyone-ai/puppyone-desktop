import { ChevronDown, ChevronRight, Monitor } from "lucide-react";
import { useState, type ReactNode } from "react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudRepositoryView } from "../../../../lib/cloudApi";
import {
  CloudAuthorityCell,
  CloudCommandBlock,
} from "../../components/shared";
import type { CloudAccessSurface } from "../../model";
import {
  formatCloudAccessCommandLabel,
  formatCloudAccessSurfacePrompt,
  formatCloudAccessSurfaceTitle,
} from "../../cloudPresentation";
import {
  copyText,
  formatProviderLabel,
  formatStatusLabel,
  getScopeDisplayName,
  getScopePathLabel,
  isConnectorActiveStatus,
} from "../../utils";
import {
  DesktopCloudPermissionPanel,
  getDesktopCliPermissionGroups,
  getDesktopMcpPermissionGroups,
  getDesktopMcpWritable,
  parseCliCommandPermissions,
  parseMcpToolPermissions,
} from "./AccessMethodPermissions";
import {
  DesktopCloudProviderIcon,
  getAccessMethodIconSize,
  getAccessMethodTileProvider,
  getDesktopCloudAccessMethodMeta,
} from "./accessProviders";
import {
  isCliAccessSurface,
  isDesktopMcpPlaceholderSurface,
  isDesktopVmPlaceholderSurface,
  isMcpAccessSurface,
} from "./accessSurfaceModel";

export function DesktopCloudAccessMethodCard({
  scope,
  surface,
  expanded,
  creatingMcp,
  mcpError,
  configPending,
  configError,
  onToggle,
  onCreateMcpEndpoint,
  onUpdatePermissions,
  canManage = false,
}: {
  scope: DesktopCloudRepositoryView;
  surface: CloudAccessSurface;
  expanded: boolean;
  creatingMcp: boolean;
  mcpError: string | null;
  configPending: boolean;
  configError: string | null;
  onToggle: () => void;
  onCreateMcpEndpoint: () => void;
  onUpdatePermissions: (nextAllowedKeys: ReadonlySet<string>) => Promise<void>;
  canManage?: boolean;
}) {
  const { t } = useLocalization();
  const meta = getDesktopCloudAccessMethodMeta(surface, t);
  const live = isConnectorActiveStatus(surface.status);
  const tileProvider = getAccessMethodTileProvider(surface.provider);
  const promptText = getDesktopCloudAccessPromptText(scope, surface, t);
  const mcpPlaceholder = isDesktopMcpPlaceholderSurface(surface);
  const vmPlaceholder = isDesktopVmPlaceholderSurface(surface);

  if (vmPlaceholder) {
    return <DesktopCloudRemoteWorkspaceCard surface={surface} canManage={canManage} />;
  }

  if (mcpPlaceholder) {
    return (
      <article className="desktop-cloud-access-method-card remote mcp-placeholder">
        <div className="desktop-cloud-access-method-info">
          <span className="desktop-cloud-access-method-icon mcp" aria-hidden="true">
            <DesktopCloudProviderIcon provider={surface.provider} size={19} />
          </span>
          <div className="desktop-cloud-access-method-main">
            <div className="desktop-cloud-access-method-title-line">
              <h2>{t("cloud.access.surface.mcp.title")}</h2>
              <span aria-hidden="true">·</span>
              <span className={`desktop-cloud-access-method-status ${mcpError ? "error" : "off"}`}>
                <span className={`desktop-cloud-web-status-dot ${mcpError ? "warning" : "muted"}`} aria-hidden="true" />
                {t(mcpError ? "cloud.status.error" : "cloud.status.off")}
              </span>
            </div>
            <p title={mcpError ?? meta.description}>{mcpError ?? meta.description}</p>
          </div>
        </div>
        {canManage && <button
          className="desktop-cloud-access-method-remote-button"
          type="button"
          disabled={creatingMcp}
          onClick={onCreateMcpEndpoint}
        >
          <span>{t(creatingMcp ? "cloud.access.method.mcp.creating" : mcpError ? "cloud.common.retry" : "cloud.access.method.mcp.create")}</span>
        </button>}
      </article>
    );
  }

  return (
    <article className={`desktop-cloud-access-method-card ${expanded ? "expanded" : ""}`}>
      <div className="desktop-cloud-access-method-info">
        <span className={`desktop-cloud-access-method-icon ${tileProvider}`} aria-hidden="true">
          <DesktopCloudProviderIcon provider={surface.provider} size={getAccessMethodIconSize(surface.provider)} />
        </span>
        <div className="desktop-cloud-access-method-main">
          <div className="desktop-cloud-access-method-title-line">
            <h2>{meta.title}</h2>
            <span aria-hidden="true">·</span>
            <span className={`desktop-cloud-access-method-status ${live ? "active" : ""}`}>
              <span className={`desktop-cloud-web-status-dot ${live ? "ready" : ""}`} aria-hidden="true" />
              {formatStatusLabel(live ? "active" : surface.status, t)}
            </span>
          </div>
          <p>{meta.description}</p>
          <div className="desktop-cloud-access-method-actions">
            <button
              className={`desktop-cloud-access-method-outline-button ${expanded ? "active" : ""}`}
              type="button"
              aria-expanded={expanded}
              onClick={onToggle}
            >
              <span>{expanded ? meta.expandedActionLabel : meta.actionLabel}</span>
              {expanded ? <ChevronDown className="desktop-cloud-access-method-expanded-chevron" size={12} /> : meta.actionIcon}
            </button>
          </div>
        </div>
      </div>
      <DesktopCloudAccessPromptPreview
        buttonLabel={meta.previewButtonLabel}
        icon={meta.previewIcon}
        text={promptText}
      />
      {expanded && (
        <DesktopCloudAccessMethodExpandedDetail
          surface={surface}
          scope={scope}
          pending={configPending}
          error={configError}
          onUpdatePermissions={onUpdatePermissions}
          canManage={canManage}
        />
      )}
    </article>
  );
}

export function DesktopCloudRemoteWorkspaceCard({
  surface,
  canManage = false,
}: {
  surface?: CloudAccessSurface;
  canManage?: boolean;
}) {
  const { t } = useLocalization();
  return (
    <article className="desktop-cloud-access-method-card remote">
      <div className="desktop-cloud-access-method-info">
        <span className="desktop-cloud-access-method-icon vm" aria-hidden="true">
          {surface ? <DesktopCloudProviderIcon provider={surface.provider} size={18} /> : <Monitor size={18} />}
        </span>
        <div className="desktop-cloud-access-method-main">
          <div className="desktop-cloud-access-method-title-line">
            <h2>{surface ? formatCloudAccessSurfaceTitle(surface, t) : t("cloud.access.surface.vm.title")}</h2>
            <span aria-hidden="true">·</span>
            <span className="desktop-cloud-access-method-status off">
              <span className="desktop-cloud-web-status-dot muted" aria-hidden="true" />
              {formatStatusLabel(surface?.status || "off", t)}
            </span>
          </div>
          <p>{surface ? formatCloudAccessSurfacePrompt(surface, t("cloud.scope.workspaceRoot"), t) : t("cloud.access.surface.vm.prompt")}</p>
        </div>
      </div>
      {canManage && <button className="desktop-cloud-access-method-remote-button" type="button">
        <span>{t("cloud.access.method.vm.addSshKey")}</span>
        <ChevronRight className="desktop-cloud-directional-icon" size={13} />
      </button>}
    </article>
  );
}

function DesktopCloudAccessMethodExpandedDetail({
  surface,
  scope,
  pending,
  error,
  onUpdatePermissions,
  canManage,
}: {
  surface: CloudAccessSurface;
  scope: DesktopCloudRepositoryView;
  pending: boolean;
  error: string | null;
  onUpdatePermissions: (nextAllowedKeys: ReadonlySet<string>) => Promise<void>;
  canManage: boolean;
}) {
  const { t } = useLocalization();
  if (isCliAccessSurface(surface.provider)) {
    return (
      <div className="desktop-cloud-access-method-expanded-detail">
        <DesktopCloudPermissionPanel
          title={t("cloud.access.permissions.title")}
          groups={getDesktopCliPermissionGroups(scope)}
          allowedKeys={parseCliCommandPermissions(surface.connector?.config)}
          pending={pending}
          error={error}
          canUpdate={canManage && !!surface.connector}
          unavailableLabel={t("cloud.access.permissions.cliUnavailable")}
          onUpdate={onUpdatePermissions}
        />
      </div>
    );
  }
  if (isMcpAccessSurface(surface.provider)) {
    const writable = getDesktopMcpWritable(surface.endpoint, scope);
    return (
      <div className="desktop-cloud-access-method-expanded-detail">
        <DesktopCloudPermissionPanel
          title={t("cloud.access.permissions.mcpTools")}
          groups={getDesktopMcpPermissionGroups(writable)}
          allowedKeys={parseMcpToolPermissions(surface.endpoint?.tools_config)}
          pending={pending}
          error={error}
          canUpdate={canManage && !!surface.endpoint}
          unavailableLabel={t("cloud.access.permissions.mcpUnavailable")}
          footer={t("cloud.access.permissions.mcpPolicyFooter")}
          onUpdate={onUpdatePermissions}
        />
      </div>
    );
  }
  const commands = surface.commands?.filter((command) => command.value) ?? [];
  return (
    <div className="desktop-cloud-access-method-expanded-detail">
      {commands.length > 0 ? (
        <div className="desktop-cloud-access-method-command-list">
          {commands.map((command) => (
            <CloudCommandBlock
              key={command.id}
              label={formatCloudAccessCommandLabel(command, t)}
              value={command.value}
              disabled={command.disabled}
            />
          ))}
        </div>
      ) : (
        <p className="desktop-cloud-access-method-expanded-note">
          {surface.endpoint?.description || formatCloudAccessSurfacePrompt(surface, getScopeDisplayName(scope, t), t)}
        </p>
      )}
      <div className="desktop-cloud-access-method-expanded-summary">
        <CloudAuthorityCell label={t("cloud.common.cloudPath")} value={getScopePathLabel(scope)} mono />
        <CloudAuthorityCell label={t("cloud.common.type")} value={formatProviderLabel(surface.provider, t)} />
        <CloudAuthorityCell
          label={t("cloud.common.status")}
          value={formatStatusLabel(surface.status, t)}
          tone={isConnectorActiveStatus(surface.status) ? "ready" : "warning"}
        />
      </div>
    </div>
  );
}

function DesktopCloudAccessPromptPreview({
  text,
  buttonLabel,
  icon,
}: {
  text: string;
  buttonLabel: string;
  icon: ReactNode;
}) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);

  return (
    <div className="desktop-cloud-access-method-preview">
      <pre aria-hidden="true" dir="auto">{text || t("cloud.access.setupPreparing")}</pre>
      <div className="desktop-cloud-access-method-preview-fade" aria-hidden="true" />
      <button
        className="desktop-cloud-access-method-copy-button"
        type="button"
        disabled={!text}
        onClick={async (event) => {
          event.stopPropagation();
          if (!text) return;
          await copyText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        {icon}
        <span>{copied ? t("cloud.common.copied") : buttonLabel}</span>
      </button>
    </div>
  );
}

function getDesktopCloudAccessPromptText(scope: DesktopCloudRepositoryView, surface: CloudAccessSurface, t: MessageFormatter) {
  const commandText = surface.commands
    ?.filter((command) => !command.disabled)
    .map((command) => `${formatCloudAccessCommandLabel(command, t)}\n${command.value}`)
    .join("\n\n") ?? "";

  if (isMcpAccessSurface(surface.provider)) {
    const endpoint = surface.endpoint;
    return [
      t("cloud.access.surface.mcp.title"),
      commandText || endpoint?.api_key_hint || t("cloud.access.connectionPreparing"),
      "",
      t("cloud.access.prompt.scope", { scope: bidiIsolate(getScopePathLabel(scope)) }),
    ].join("\n");
  }

  return [
    formatCloudAccessSurfacePrompt(surface, getScopeDisplayName(scope, t), t),
    commandText,
    t("cloud.access.prompt.scope", { scope: bidiIsolate(getScopeDisplayName(scope, t)) }),
  ].filter(Boolean).join("\n\n");
}
