import { ChevronDown, ChevronRight, Monitor } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { DesktopCloudScope } from "../../../../lib/cloudApi";
import {
  CloudAuthorityCell,
  CloudCommandBlock,
} from "../../components/shared";
import type { CloudAccessSurface } from "../../model";
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
}: {
  scope: DesktopCloudScope;
  surface: CloudAccessSurface;
  expanded: boolean;
  creatingMcp: boolean;
  mcpError: string | null;
  configPending: boolean;
  configError: string | null;
  onToggle: () => void;
  onCreateMcpEndpoint: () => void;
  onUpdatePermissions: (nextAllowedKeys: ReadonlySet<string>) => Promise<void>;
}) {
  const meta = getDesktopCloudAccessMethodMeta(surface);
  const live = isConnectorActiveStatus(surface.status);
  const tileProvider = getAccessMethodTileProvider(surface.provider);
  const promptText = getDesktopCloudAccessPromptText(scope, surface);
  const mcpPlaceholder = isDesktopMcpPlaceholderSurface(surface);
  const vmPlaceholder = isDesktopVmPlaceholderSurface(surface);

  if (vmPlaceholder) {
    return <DesktopCloudRemoteWorkspaceCard surface={surface} />;
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
              <h2>MCP Server</h2>
              <span aria-hidden="true">·</span>
              <span className={`desktop-cloud-access-method-status ${mcpError ? "error" : "off"}`}>
                <span className={`desktop-cloud-web-status-dot ${mcpError ? "warning" : "muted"}`} aria-hidden="true" />
                {mcpError ? "Error" : "Off"}
              </span>
            </div>
            <p title={mcpError ?? meta.description}>{mcpError ?? meta.description}</p>
          </div>
        </div>
        <button
          className="desktop-cloud-access-method-remote-button"
          type="button"
          disabled={creatingMcp}
          onClick={onCreateMcpEndpoint}
        >
          <span>{creatingMcp ? "Creating endpoint" : mcpError ? "Retry" : "Create endpoint"}</span>
        </button>
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
              {live ? "Active" : formatStatusLabel(surface.statusLabel || surface.status)}
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
        />
      )}
    </article>
  );
}

export function DesktopCloudRemoteWorkspaceCard({ surface }: { surface?: CloudAccessSurface }) {
  return (
    <article className="desktop-cloud-access-method-card remote">
      <div className="desktop-cloud-access-method-info">
        <span className="desktop-cloud-access-method-icon vm" aria-hidden="true">
          {surface ? <DesktopCloudProviderIcon provider={surface.provider} size={18} /> : <Monitor size={18} />}
        </span>
        <div className="desktop-cloud-access-method-main">
          <div className="desktop-cloud-access-method-title-line">
            <h2>{surface?.title ?? "Remote Workspace"}</h2>
            <span aria-hidden="true">·</span>
            <span className="desktop-cloud-access-method-status off">
              <span className="desktop-cloud-web-status-dot muted" aria-hidden="true" />
              {surface?.statusLabel ?? "Off"}
            </span>
          </div>
          <p>{surface?.prompt ?? "Add your SSH public key, then open this scope in Cursor or VS Code over Remote-SSH."}</p>
        </div>
      </div>
      <button className="desktop-cloud-access-method-remote-button" type="button">
        <span>Add SSH key</span>
        <ChevronRight size={13} />
      </button>
    </article>
  );
}

function DesktopCloudAccessMethodExpandedDetail({
  surface,
  scope,
  pending,
  error,
  onUpdatePermissions,
}: {
  surface: CloudAccessSurface;
  scope: DesktopCloudScope;
  pending: boolean;
  error: string | null;
  onUpdatePermissions: (nextAllowedKeys: ReadonlySet<string>) => Promise<void>;
}) {
  if (isCliAccessSurface(surface.provider)) {
    return (
      <div className="desktop-cloud-access-method-expanded-detail">
        <DesktopCloudPermissionPanel
          title="Permissions"
          groups={getDesktopCliPermissionGroups(scope)}
          allowedKeys={parseCliCommandPermissions(surface.connector?.config)}
          pending={pending}
          error={error}
          canUpdate={!!surface.connector}
          unavailableLabel="CLI connector is not available yet."
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
          title="MCP tools"
          groups={getDesktopMcpPermissionGroups(writable)}
          allowedKeys={parseMcpToolPermissions(surface.endpoint?.tools_config)}
          pending={pending}
          error={error}
          canUpdate={!!surface.endpoint}
          unavailableLabel="MCP endpoint is not available yet."
          footer="The server applies this policy to both tools/list and tools/call. Client JSON only contains the URL and key."
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
              key={command.label}
              label={command.label}
              value={command.value}
              disabled={command.disabled}
            />
          ))}
        </div>
      ) : (
        <p className="desktop-cloud-access-method-expanded-note">
          {surface.endpoint?.description || surface.prompt || "Configuration details will appear here once this access method is connected."}
        </p>
      )}
      <div className="desktop-cloud-access-method-expanded-summary">
        <CloudAuthorityCell label="Cloud path" value={getScopePathLabel(scope)} mono />
        <CloudAuthorityCell label="Type" value={formatProviderLabel(surface.provider)} />
        <CloudAuthorityCell
          label="Status"
          value={formatStatusLabel(surface.statusLabel || surface.status)}
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
  const [copied, setCopied] = useState(false);

  return (
    <div className="desktop-cloud-access-method-preview">
      <pre aria-hidden="true">{text || "Access setup is preparing."}</pre>
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
        <span>{copied ? "Copied" : buttonLabel}</span>
      </button>
    </div>
  );
}

function getDesktopCloudAccessPromptText(scope: DesktopCloudScope, surface: CloudAccessSurface) {
  const commandText = surface.commands
    ?.filter((command) => !command.disabled)
    .map((command) => `${command.label}\n${command.value}`)
    .join("\n\n") ?? "";

  if (isMcpAccessSurface(surface.provider)) {
    const endpoint = surface.endpoint;
    return [
      "MCP server",
      commandText || endpoint?.api_key_hint || "Connection details are preparing.",
      "",
      `Scope: ${getScopePathLabel(scope)}`,
    ].join("\n");
  }

  return [
    surface.prompt,
    commandText,
    `Scope: ${getScopeDisplayName(scope)}`,
  ].filter(Boolean).join("\n\n");
}
