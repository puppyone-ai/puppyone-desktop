import { ChevronRight, Link, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  deleteCloudScope,
  updateCloudScope,
  type DesktopCloudConnector,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudRepoIdentity,
  type DesktopCloudRepositoryView,
  type DesktopCloudSession,
} from "../../../../lib/cloudApi";
import {
  CloudAuthorityCell,
  CloudCommandBlock,
  CloudPromptBlock,
  CloudSectionLabel,
  CloudWebEmpty,
} from "../../components/shared";
import type { CloudAccessSurface } from "../../model";
import { buildCloudAccessSurfaces, getCloudAccessAggregate } from "../../model";
import {
  cloudMessage,
  formatCloudAccessAggregate,
  formatCloudAccessCommandLabel,
  formatCloudAccessSurfacePrompt,
  formatCloudAccessSurfaceSubtitle,
  formatCloudAccessSurfaceTitle,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../../cloudPresentation";
import {
  formatProviderLabel,
  formatStatusLabel,
  getApiBaseFromGitUrl,
  getCanonicalGitUrlForView,
  getScopeDisplayName,
  getScopeIdentifierName,
  getScopePathLabel,
  isConnectorActiveStatus,
  profileSlug,
  providerIcon,
} from "../../utils";

export function CloudScopeDetail({
  projectId,
  cloudSession,
  onCloudSessionChange,
  apiBaseUrl,
  scope,
  identity,
  connectors,
  mcpEndpoints,
  onRefresh,
  onOpenAccess,
}: {
  projectId: string;
  cloudSession?: DesktopCloudSession;
  onCloudSessionChange?: (session: DesktopCloudSession | null) => void;
  apiBaseUrl?: string | null;
  scope: DesktopCloudRepositoryView;
  identity: DesktopCloudRepoIdentity | null;
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  onRefresh?: () => Promise<void>;
  onOpenAccess: () => void;
}) {
  const { t } = useLocalization();
  const apiBase = identity?.url ? getApiBaseFromGitUrl(identity.url) : "";
  const gitUrl = getCanonicalGitUrlForView(identity, scope, apiBase);
  const scopeName = getScopeDisplayName(scope, t);
  const profileName = profileSlug(getScopeIdentifierName(scope));
  const cliCommand = "";
  const surfaces = useMemo(() => buildCloudAccessSurfaces({
    scope,
    connectors,
    mcpEndpoints,
    apiBase,
    gitUrl,
    cliCommand,
    profileName,
  }), [apiBase, cliCommand, connectors, gitUrl, mcpEndpoints, profileName, scope]);
  const [collapsedSurfaceIds, setCollapsedSurfaceIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsedSurfaceIds((current) => {
      const next = new Set<string>();
      const surfaceIds = new Set(surfaces.map((surface) => surface.id));
      for (const id of current) {
        if (surfaceIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [surfaces]);

  const aggregate = getCloudAccessAggregate(surfaces);
  const modeLabel = t(scope.max_mode === "rw" ? "cloud.scope.readWrite" : "cloud.scope.readOnly");
  const collapsedCount = collapsedSurfaceIds.size;
  const expandedCount = surfaces.length - collapsedCount;
  const allCollapsed = surfaces.length > 0 && expandedCount === 0;
  const toggleSurfaceCollapsed = (surfaceId: string) => {
    setCollapsedSurfaceIds((current) => {
      const next = new Set(current);
      if (next.has(surfaceId)) {
        next.delete(surfaceId);
      } else {
        next.add(surfaceId);
      }
      return next;
    });
  };
  const setAllSurfacesCollapsed = (collapsed: boolean) => {
    setCollapsedSurfaceIds(collapsed ? new Set(surfaces.map((surface) => surface.id)) : new Set());
  };

  return (
    <div className="desktop-cloud-access-detail-panel">
      <div className="desktop-cloud-access-scope-header">
        <div>
          <h1 title={scopeName}>{scopeName}</h1>
          {surfaces.length > 0 && (
            <div className="desktop-cloud-access-aggregate">
              <span className={`desktop-cloud-web-status-dot ${aggregate.tone}`} aria-hidden="true" />
              <strong>{formatCloudAccessAggregate(aggregate.code, t)}</strong>
              <em>·</em>
              <span>{t("cloud.access.connectorCount", { count: surfaces.length })}</span>
            </div>
          )}
          <div className="desktop-cloud-access-scope-meta">
            <span>{t("cloud.common.scope")}</span>
            <code title={getScopePathLabel(scope)}>{getScopePathLabel(scope)}</code>
            <em>·</em>
            <span>{modeLabel}</span>
          </div>
        </div>
        <button className="desktop-cloud-row-action" type="button" onClick={onOpenAccess}>
          <Settings size={13} />
          <span>{t("cloud.common.open")}</span>
        </button>
      </div>

      <div className="desktop-cloud-method-warning">
        {t("cloud.access.noKeyWarning")}
      </div>

      <CloudSectionLabel
        right={(
          <span className="desktop-cloud-access-section-actions">
            <span>{t("cloud.access.wayCount", { count: surfaces.length })}</span>
            {surfaces.length > 0 && (
              <button type="button" onClick={() => setAllSurfacesCollapsed(!allCollapsed)}>
                {t(allCollapsed ? "cloud.common.expandAll" : "cloud.common.collapseAll")}
              </button>
            )}
          </span>
        )}
      >
        {t("cloud.access.surfaces")}
      </CloudSectionLabel>
      {surfaces.length === 0 ? (
        <CloudWebEmpty icon={Link} title={t("cloud.access.noConnectors")} detail={t("cloud.access.noConnectorsDetail")} />
      ) : (
        <div className="desktop-cloud-access-surface-grid">
          {surfaces.map((surface) => (
            <CloudAccessSurfaceTile
              key={surface.id}
              surface={surface}
              expanded={!collapsedSurfaceIds.has(surface.id)}
              onToggle={() => toggleSurfaceCollapsed(surface.id)}
              onOpenAccess={onOpenAccess}
            />
          ))}
        </div>
      )}

      {cloudSession && onCloudSessionChange && onRefresh && (
        <CloudScopeSettingsBlock
          projectId={projectId}
          session={cloudSession}
          scope={scope}
          apiBaseUrl={apiBaseUrl ?? null}
          onSessionChange={onCloudSessionChange}
          onMutated={onRefresh}
        />
      )}
    </div>
  );
}

export function CloudScopeSettingsBlock({
  projectId,
  session,
  scope,
  apiBaseUrl,
  onSessionChange,
  onMutated,
}: {
  projectId: string;
  session: DesktopCloudSession;
  scope: DesktopCloudRepositoryView;
  apiBaseUrl: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onMutated: () => Promise<void>;
}) {
  const { t } = useLocalization();
  const isProjectRoot = scope.target.kind === "project_root";
  const [name, setName] = useState(scope.name);
  const [mode, setMode] = useState<"r" | "rw">(scope.max_mode);
  const [excludeText, setExcludeText] = useState(formatScopeExclude(scope.exclude));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<CloudMessageDescriptor | null>(null);

  useEffect(() => {
    setName(scope.name);
    setMode(scope.max_mode);
    setExcludeText(formatScopeExclude(scope.exclude));
    setConfirmDelete(false);
    setError(null);
  }, [scope.id, scope.name, scope.max_mode, scope.exclude]);

  const parsedExclude = parseScopeExclude(excludeText);
  const dirty = (
    !isProjectRoot && (
      name.trim() !== scope.name
      || mode !== scope.max_mode
      || !sameStringArray(parsedExclude, scope.exclude)
    )
  );
  const busy = saving || deleting;

  const handleSave = async () => {
    if (!dirty || busy || scope.target.kind !== "scope") return;
    setSaving(true);
    setError(null);
    try {
      await updateCloudScope(
        session,
        projectId,
        scope.id,
        {
          name: name.trim() || scope.name,
          max_mode: mode,
          exclude: parsedExclude,
        },
        onSessionChange,
        apiBaseUrl,
      );
      await onMutated();
    } catch (saveError) {
      setError(cloudMessage("save-scope-failed", undefined, saveError instanceof Error ? saveError.message : undefined));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setName(scope.name);
    setMode(scope.max_mode);
    setExcludeText(formatScopeExclude(scope.exclude));
    setError(null);
  };

  const handleDelete = async () => {
    if (scope.target.kind !== "scope" || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteCloudScope(session, projectId, scope.id, onSessionChange, apiBaseUrl);
      await onMutated();
    } catch (deleteError) {
      setError(cloudMessage("delete-access-failed", undefined, deleteError instanceof Error ? deleteError.message : undefined));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <section className="desktop-cloud-scope-settings">
      <CloudSectionLabel right={dirty ? <span>{t("cloud.common.unsaved")}</span> : undefined}>{t("cloud.common.settings")}</CloudSectionLabel>

      <div className="desktop-cloud-scope-settings-grid">
        <div className="desktop-cloud-scope-settings-card">
          <label className="desktop-cloud-scope-settings-field">
            <span>{t("cloud.common.name")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isProjectRoot || busy}
              placeholder={getScopeDisplayName(scope, t)}
            />
          </label>
          {isProjectRoot && <p>{t("cloud.scope.projectRootKeepsProjectName")}</p>}
        </div>

        <div className="desktop-cloud-scope-settings-card">
          <div className="desktop-cloud-scope-settings-field">
            <span>{t("cloud.common.permission")}</span>
            <div className="desktop-cloud-scope-mode-control" role="group" aria-label={t("cloud.scope.permissionAria")}>
              <button type="button" className={mode === "r" ? "active" : ""} disabled={isProjectRoot || busy} onClick={() => setMode("r")}>
                {t("cloud.scope.readOnly")}
              </button>
              <button type="button" className={mode === "rw" ? "active" : ""} disabled={isProjectRoot || busy} onClick={() => setMode("rw")}>
                {t("cloud.scope.readWrite")}
              </button>
            </div>
          </div>
        </div>

        <div className="desktop-cloud-scope-settings-card wide">
          <label className="desktop-cloud-scope-settings-field">
            <span>{t("cloud.scope.exclude")}</span>
            <textarea
              value={excludeText}
              onChange={(event) => setExcludeText(event.target.value)}
              disabled={isProjectRoot || busy}
              placeholder={"dist\n.cache\n*.tmp"}
              spellCheck={false}
            />
          </label>
          <p>{t("cloud.scope.excludeHelp")}</p>
        </div>

        {!isProjectRoot && <div className="desktop-cloud-scope-settings-card danger wide">
          <div className="desktop-cloud-scope-settings-field">
            <span>{t("cloud.common.dangerZone")}</span>
            <p>{t("cloud.scope.deleteHelp")}</p>
          </div>
          <button type="button" disabled={busy} onClick={handleDelete}>
            {t(deleting ? "cloud.common.deleting" : confirmDelete ? "cloud.common.confirmDelete" : "cloud.scope.deleteAccess")}
          </button>
        </div>}
      </div>

      {error && <div className="desktop-cloud-scope-settings-error">{formatCloudMessage(error, t)}</div>}

      {dirty && (
        <div className="desktop-cloud-scope-settings-footer">
          <span>{t("cloud.common.unsavedChanges")}</span>
          <button type="button" disabled={busy} onClick={handleDiscard}>{t("cloud.common.discard")}</button>
          <button type="button" className="primary" disabled={busy} onClick={handleSave}>
            {t(saving ? "cloud.common.saving" : "cloud.common.saveChanges")}
          </button>
        </div>
      )}
    </section>
  );
}

export function formatScopeExclude(exclude: string[]) {
  return exclude.join("\n");
}

export function parseScopeExclude(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function CloudAccessSurfaceTile({
  surface,
  expanded,
  onToggle,
  onOpenAccess,
}: {
  surface: CloudAccessSurface;
  expanded: boolean;
  onToggle: () => void;
  onOpenAccess: () => void;
}) {
  const { t } = useLocalization();
  const Icon = providerIcon(surface.provider);
  const active = isConnectorActiveStatus(surface.status);

  return (
    <article className={`desktop-cloud-access-surface-tile ${expanded ? "expanded" : "collapsed"}`}>
      <div className="desktop-cloud-access-surface-head">
        <button className="desktop-cloud-access-surface-main" type="button" onClick={onToggle}>
          <span className={`desktop-cloud-access-provider-tile ${surface.provider}`}>
            <Icon size={surface.provider === "cli" ? 15 : 14} />
          </span>
          <span>
            <strong dir="auto">{formatCloudAccessSurfaceTitle(surface, t)}</strong>
            <small dir="auto">{formatCloudAccessSurfaceSubtitle(surface, t)}</small>
          </span>
        </button>
        <span className="desktop-cloud-access-status-cell">
          <span className={`desktop-cloud-web-status-dot ${active ? "ready" : surface.status === "error" ? "warning" : ""}`} aria-hidden="true" />
          <span>{formatStatusLabel(surface.status, t)}</span>
        </span>
        <button className="desktop-cloud-access-open-button" type="button" onClick={onOpenAccess}>
          {t("cloud.common.open")}
        </button>
        <button className="desktop-cloud-access-surface-toggle" type="button" onClick={onToggle} aria-label={t(expanded ? "cloud.access.collapseDetails" : "cloud.access.expandDetails")}>
          <ChevronRight className="desktop-cloud-directional-icon" size={14} />
        </button>
      </div>
      {expanded && (
        <div className="desktop-cloud-access-surface-details">
          <CloudPromptBlock value={formatCloudAccessSurfacePrompt(surface, t("cloud.scope.workspaceRoot"), t)} />
          {surface.commands?.map((command) => (
            <CloudCommandBlock key={command.id} label={formatCloudAccessCommandLabel(command, t)} value={command.value} disabled={command.disabled} />
          ))}
          {surface.endpoint && !surface.commands?.length && (
            <div className="desktop-cloud-mcp-key-hint">
              <span>{t("cloud.common.apiKey")}</span>
              <strong>{surface.endpoint.api_key_hint || t("cloud.common.hidden")}</strong>
            </div>
          )}
          {surface.connector && (
            <div className="desktop-cloud-access-connector-summary">
              <CloudAuthorityCell label={t("cloud.common.provider")} value={formatProviderLabel(surface.connector.provider, t)} />
              <CloudAuthorityCell label={t("cloud.common.direction")} value={formatStatusLabel(surface.connector.direction || "manual", t)} />
              <CloudAuthorityCell label={t("cloud.common.status")} value={formatStatusLabel(surface.connector.status, t)} tone={isConnectorActiveStatus(surface.connector.status) ? "ready" : "warning"} />
            </div>
          )}
          {surface.endpoint?.description && <p className="desktop-cloud-access-expanded-note">{surface.endpoint.description}</p>}
        </div>
      )}
    </article>
  );
}
