import { Copy, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudConnector,
  DesktopCloudCreateMcpEndpointRequest,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../../../lib/cloudApi";
import {
  createCloudMcpEndpoint,
  updateCloudConnector,
  updateCloudMcpEndpoint,
} from "../../../../lib/cloudApi";
import { getCloudAccessAggregate, type CloudAccessSurface } from "../../model";
import {
  cloudMessage,
  formatCloudAccessAggregate,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../../cloudPresentation";
import {
  copyText,
  getScopeDisplayName,
  getScopePathLabel,
  normalizeProviderKey,
} from "../../utils";
import { DesktopCloudAccessMethodCard } from "./AccessMethodCard";
import {
  CLI_PERMISSION_CONFIG_KEY,
  CLI_VALID_COMMANDS,
  buildMcpToolsConfig,
  sortCliCommands,
} from "./AccessMethodPermissions";
import { CloudScopeSettingsBlock } from "./CloudScopeDetail";
import {
  buildDesktopCloudAccessSurfacesForScope,
  getDesktopCloudAccessSurfaceContext,
  isDesktopAccessPlaceholderSurface,
  maskDesktopScopeAccessKey,
} from "./accessSurfaceModel";

export function DesktopCloudScopeAccessDetail({
  projectId,
  cloudSession,
  onCloudSessionChange,
  apiBaseUrl,
  scope,
  activeSurfaceId,
  identity,
  connectors,
  mcpEndpoints,
  onRefresh,
  canManage = false,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  apiBaseUrl: string | null;
  scope: DesktopCloudScope;
  activeSurfaceId?: string | null;
  identity: DesktopCloudRepoIdentity | null;
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  onRefresh: () => Promise<void>;
  canManage?: boolean;
}) {
  const { t } = useLocalization();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedSurfaceId, setExpandedSurfaceId] = useState<string | null>(null);
  const [creatingMcp, setCreatingMcp] = useState(false);
  const [mcpError, setMcpError] = useState<CloudMessageDescriptor | null>(null);
  const [surfaceConfigBusyId, setSurfaceConfigBusyId] = useState<string | null>(null);
  const [surfaceConfigError, setSurfaceConfigError] = useState<CloudMessageDescriptor | null>(null);

  useEffect(() => {
    setSettingsOpen(false);
    setExpandedSurfaceId(activeSurfaceId ?? null);
    setMcpError(null);
    setSurfaceConfigBusyId(null);
    setSurfaceConfigError(null);
  }, [activeSurfaceId, scope.id]);

  const accessContext = useMemo(() => getDesktopCloudAccessSurfaceContext({
    scope,
    identity,
    apiBaseUrl,
  }), [apiBaseUrl, identity, scope]);
  const scopeName = getScopeDisplayName(scope, t);
  const surfaces = useMemo(() => buildDesktopCloudAccessSurfacesForScope({
    scope,
    identity,
    apiBaseUrl,
    connectors,
    mcpEndpoints,
    includePlaceholders: true,
  }), [apiBaseUrl, connectors, identity, mcpEndpoints, scope]);
  const selectedSurface = activeSurfaceId
    ? surfaces.find((surface) => surface.id === activeSurfaceId) ?? null
    : null;
  const detailSurfaces = activeSurfaceId
    ? (selectedSurface ? [selectedSurface] : [])
    : surfaces;
  const aggregateSourceSurfaces = detailSurfaces.length > 0 ? detailSurfaces : surfaces;
  const aggregateSurfaces = aggregateSourceSurfaces.filter((surface) => !isDesktopAccessPlaceholderSurface(surface));
  const aggregateInputSurfaces = aggregateSurfaces.length > 0 ? aggregateSurfaces : aggregateSourceSurfaces;
  const aggregate = aggregateInputSurfaces.length > 0
    ? getCloudAccessAggregate(aggregateInputSurfaces)
    : { code: "paused", tone: "" } as const;
  const aggregateTone = aggregate.tone === "ready" ? "ready" : aggregate.tone === "warning" ? "warning" : "muted";
  const aggregateConnectorCount = aggregateSurfaces.length;
  const scopePath = getScopePathLabel(scope);
  const modeLabel = t(scope.mode === "rw" ? "cloud.scope.readWrite" : "cloud.scope.readOnly");
  const accessKeyLabel = scope.access_key ? maskDesktopScopeAccessKey(scope.access_key) : t("cloud.common.preparing");

  const handleCreateMcpEndpoint = async () => {
    if (creatingMcp || !canManage) return;
    setCreatingMcp(true);
    setMcpError(null);
    const body: DesktopCloudCreateMcpEndpointRequest = {
      project_id: projectId,
      path: scope.path,
      name: "MCP Server",
      accesses: [{ path: scope.path, json_path: "", readonly: scope.mode !== "rw" }],
    };
    try {
      await createCloudMcpEndpoint(cloudSession, body, onCloudSessionChange, apiBaseUrl);
      await onRefresh();
    } catch (error) {
      setMcpError(cloudMessage("create-mcp-failed", undefined, error instanceof Error ? error.message : undefined));
    } finally {
      setCreatingMcp(false);
    }
  };

  const handleUpdateSurfacePermissions = async (surface: CloudAccessSurface, allowedKeys: ReadonlySet<string>) => {
    if (surfaceConfigBusyId || !canManage) return;
    const provider = normalizeProviderKey(surface.provider);
    setSurfaceConfigBusyId(surface.id);
    setSurfaceConfigError(null);
    try {
      if (provider === "cli") {
        if (!surface.connector) {
          setSurfaceConfigError(cloudMessage("cli-unavailable"));
          return;
        }
        await updateCloudConnector(
          cloudSession,
          projectId,
          surface.connector.id,
          {
            config: {
              ...(surface.connector.config ?? {}),
              [CLI_PERMISSION_CONFIG_KEY]: {
                allowed: Array.from(allowedKeys).filter((key) => CLI_VALID_COMMANDS.has(key)).sort(sortCliCommands),
              },
            },
          },
          onCloudSessionChange,
          apiBaseUrl,
        );
      } else if (provider === "mcp" || provider === "mcp_endpoint") {
        if (!surface.endpoint) {
          setSurfaceConfigError(cloudMessage("mcp-unavailable"));
          return;
        }
        await updateCloudMcpEndpoint(
          cloudSession,
          surface.endpoint.id,
          {
            tools_config: buildMcpToolsConfig(surface.endpoint.tools_config, allowedKeys),
          },
          onCloudSessionChange,
          apiBaseUrl,
        );
      }
      await onRefresh();
    } catch (error) {
      setSurfaceConfigError(cloudMessage("update-config-failed", undefined, error instanceof Error ? error.message : undefined));
    } finally {
      setSurfaceConfigBusyId(null);
    }
  };

  return (
    <div className="desktop-cloud-access-web-detail" key={scope.id}>
      <div className="desktop-cloud-access-web-rail">
        <header className="desktop-cloud-access-web-scope-header">
          <div className="desktop-cloud-access-web-scope-copy">
            <h1 title={scopeName}>{scopeName}</h1>
            <div className={`desktop-cloud-access-web-aggregate ${aggregateTone}`}>
              <span className={`desktop-cloud-web-status-dot ${aggregateTone === "ready" ? "ready" : aggregateTone === "warning" ? "warning" : ""}`} aria-hidden="true" />
              <strong>{formatCloudAccessAggregate(aggregate.code, t)}</strong>
              <span aria-hidden="true">·</span>
              <em>{t("cloud.access.connectorCount", { count: aggregateConnectorCount })}</em>
            </div>
            <div className="desktop-cloud-access-web-meta">
              <span>{t("cloud.common.scope")}</span>
              <code title={scopePath}>{scopePath}</code>
              <span aria-hidden="true">·</span>
              <span>{modeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{t("cloud.common.accessKey")}</span>
              <code title={scope.access_key ?? undefined}>{accessKeyLabel}</code>
              <button
                className="desktop-cloud-access-key-copy"
                type="button"
                aria-label={t("cloud.common.copyAccessKey")}
                disabled={!scope.access_key}
                onClick={() => {
                  if (scope.access_key) void copyText(scope.access_key);
                }}
              >
                <Copy size={11} />
              </button>
            </div>
          </div>
          {canManage && <button
            className={`desktop-cloud-access-settings-button ${settingsOpen ? "active" : ""}`}
            type="button"
            aria-pressed={settingsOpen}
            aria-label={t(settingsOpen ? "cloud.scope.closeSettings" : "cloud.scope.openSettings")}
            title={t(settingsOpen ? "cloud.common.closeSettings" : "cloud.common.openSettings")}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings size={13} />
          </button>}
        </header>

        {canManage && settingsOpen && (
          <section className="desktop-cloud-access-web-settings">
            <span className="desktop-cloud-access-section-label">{t("cloud.common.settings")}</span>
            <div className="desktop-cloud-access-web-settings-body">
              <CloudScopeSettingsBlock
                projectId={projectId}
                session={cloudSession}
                scope={scope}
                apiBaseUrl={apiBaseUrl}
                onSessionChange={onCloudSessionChange}
                onMutated={onRefresh}
              />
            </div>
          </section>
        )}

        <section className="desktop-cloud-access-method-list" aria-label={t("cloud.access.methods")}>
          {detailSurfaces.map((surface) => (
            <DesktopCloudAccessMethodCard
              key={surface.id}
              scope={scope}
              surface={surface}
              expanded={expandedSurfaceId === surface.id}
              creatingMcp={creatingMcp}
              mcpError={mcpError ? formatCloudMessage(mcpError, t) : null}
              configPending={surfaceConfigBusyId === surface.id}
              configError={expandedSurfaceId === surface.id && surfaceConfigError ? formatCloudMessage(surfaceConfigError, t) : null}
              onToggle={() => setExpandedSurfaceId((current) => (current === surface.id ? null : surface.id))}
              onCreateMcpEndpoint={handleCreateMcpEndpoint}
              onUpdatePermissions={(nextAllowedKeys) => handleUpdateSurfacePermissions(surface, nextAllowedKeys)}
              canManage={canManage}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
