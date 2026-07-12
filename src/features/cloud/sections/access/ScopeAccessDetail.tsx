import { Copy, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  copyText,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedSurfaceId, setExpandedSurfaceId] = useState<string | null>(null);
  const [creatingMcp, setCreatingMcp] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [surfaceConfigBusyId, setSurfaceConfigBusyId] = useState<string | null>(null);
  const [surfaceConfigError, setSurfaceConfigError] = useState<string | null>(null);

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
  const scopeName = accessContext.scopeName;
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
    : { label: "Paused", tone: "" };
  const aggregateTone = aggregate.tone === "ready" ? "ready" : aggregate.tone === "warning" ? "warning" : "muted";
  const aggregateConnectorCount = aggregateSurfaces.length;
  const scopePath = getScopePathLabel(scope);
  const modeLabel = scope.mode === "rw" ? "Read & write" : "Read only";
  const accessKeyLabel = scope.access_key ? maskDesktopScopeAccessKey(scope.access_key) : "Preparing";

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
      setMcpError(error instanceof Error ? error.message : "Failed to create MCP endpoint.");
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
        if (!surface.connector) throw new Error("CLI connector is not available yet.");
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
        if (!surface.endpoint) throw new Error("MCP endpoint is not available yet.");
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
      setSurfaceConfigError(error instanceof Error ? error.message : "Failed to update configuration.");
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
              <strong>{aggregate.label}</strong>
              <span aria-hidden="true">·</span>
              <em>{aggregateConnectorCount === 1 ? "1 connector" : `${aggregateConnectorCount} connectors`}</em>
            </div>
            <div className="desktop-cloud-access-web-meta">
              <span>Scope</span>
              <code title={scopePath}>{scopePath}</code>
              <span aria-hidden="true">·</span>
              <span>{modeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Access key</span>
              <code title={scope.access_key ?? undefined}>{accessKeyLabel}</code>
              <button
                className="desktop-cloud-access-key-copy"
                type="button"
                aria-label="Copy access key"
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
            aria-label={settingsOpen ? "Close scope settings" : "Open scope settings"}
            title={settingsOpen ? "Close settings" : "Open settings"}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings size={13} />
          </button>}
        </header>

        {canManage && settingsOpen && (
          <section className="desktop-cloud-access-web-settings">
            <span className="desktop-cloud-access-section-label">Settings</span>
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

        <section className="desktop-cloud-access-method-list" aria-label="Access methods">
          {detailSurfaces.map((surface) => (
            <DesktopCloudAccessMethodCard
              key={surface.id}
              scope={scope}
              surface={surface}
              expanded={expandedSurfaceId === surface.id}
              creatingMcp={creatingMcp}
              mcpError={mcpError}
              configPending={surfaceConfigBusyId === surface.id}
              configError={expandedSurfaceId === surface.id ? surfaceConfigError : null}
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
