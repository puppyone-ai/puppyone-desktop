import { ArrowRight, Check, ChevronRight, ExternalLink, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DesktopCloudCreateWorkflowRequest,
  DesktopCloudSession,
  DesktopCloudWorkflowConfigField,
  DesktopCloudWorkflowProviderSpec,
} from "../../../../lib/cloudApi";
import {
  createCloudWorkflow,
  deleteCloudWorkflowConnection,
  listCloudWorkflowProviderSpecs,
  pauseCloudWorkflowConnection,
  refreshCloudWorkflowConnection,
  resumeCloudWorkflowConnection,
} from "../../../../lib/cloudApi";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../../components/DesktopDialog";
import { CloudAuthorityCell } from "../../components/shared";
import {
  formatProviderLabel,
  formatStatusLabel,
  getCloudProviderIconUrl,
  getScopePathLabel,
  isConnectorActiveStatus,
  providerIcon,
} from "../../utils";
import type { CloudAccessSurfaceRow } from "./accessRows";

export function CloudNewSyncDialog({
  projectId,
  cloudSession,
  apiBaseUrl,
  onCloudSessionChange,
  onRefresh,
  onOpenIntegrations,
  onClose,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenIntegrations: () => void;
  onClose: () => void;
}) {
  const [providers, setProviders] = useState<DesktopCloudWorkflowProviderSpec[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [step, setStep] = useState<"source" | "configure">("source");
  const [targetPath, setTargetPath] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProvidersLoading(true);
    setProvidersError(null);
    void listCloudWorkflowProviderSpecs(cloudSession, onCloudSessionChange, apiBaseUrl)
      .then((items) => {
        if (cancelled) return;
        const visible = items.filter((provider) => provider.category === "datasource");
        setProviders(visible);
        setSelectedProviderId((current) => current ?? visible[0]?.provider ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        setProvidersError(error instanceof Error ? error.message : "Unable to load sync providers.");
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cloudSession, onCloudSessionChange]);

  const provider = providers.find((item) => item.provider === selectedProviderId) ?? providers[0] ?? null;
  const fields = getCloudWorkflowUserConfigFields(provider);
  const requiresCloudOAuth = provider ? provider.auth === "oauth" || provider.auth === "optional_oauth" : false;
  const missingRequired = fields.some((field) => field.required && !configValues[field.key]?.trim());
  const normalizedTargetPath = normalizeWorkflowTargetPath(targetPath || defaultWorkflowTargetPath(provider));
  const canCreate = Boolean(provider && normalizedTargetPath && !missingRequired && !saving && !requiresCloudOAuth);

  useEffect(() => {
    if (!provider) return;
    setConfigValues(defaultWorkflowConfigValues(provider));
    setTargetPath(defaultWorkflowTargetPath(provider));
    setFeedback(null);
  }, [provider?.provider]);

  const handleCreate = async () => {
    if (!provider || !canCreate) return;
    setSaving(true);
    setFeedback(null);
    try {
      await createCloudWorkflow(
        cloudSession,
        buildDesktopCreateWorkflowRequest({
          projectId,
          provider,
          configValues,
          targetPath: normalizedTargetPath,
        }),
        onCloudSessionChange,
        apiBaseUrl,
      );
      await onRefresh();
      onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to create sync.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DesktopDialogRoot onClose={saving ? undefined : onClose}>
      <DesktopDialogSurface width={step === "configure" ? 860 : 820} className="desktop-cloud-workflow-dialog">
        <header className="desktop-dialog-header desktop-cloud-workflow-dialog-header">
          <div className="desktop-dialog-title-row">
            <div>
              <h2>{step === "source" ? "Add sync" : `Configure ${provider?.display_name ?? "sync"}`}</h2>
              <p>
                {step === "source"
                  ? "Choose an information source and confirm its authorization status."
                  : "Choose what to import, where it lands, and how it runs."}
              </p>
            </div>
          </div>
          <DesktopDialogCloseButton disabled={saving} onClick={onClose} />
        </header>
        <div className="desktop-dialog-body desktop-cloud-workflow-dialog-body">
          {providersLoading ? (
            <div className="desktop-cloud-workflow-state">Loading providers</div>
          ) : providersError ? (
            <div className="desktop-dialog-error">{providersError}</div>
          ) : providers.length === 0 ? (
            <div className="desktop-cloud-workflow-state">No sync providers available.</div>
          ) : step === "source" ? (
            <>
              <div className="desktop-cloud-workflow-source-grid">
                {providers.map((item) => {
                  const Icon = providerIcon(item.provider);
                  const iconUrl = item.icon_url || getCloudProviderIconUrl(item.provider);
                  const selected = item.provider === provider?.provider;
                  const needsOAuth = item.auth === "oauth" || item.auth === "optional_oauth";
                  return (
                    <button
                      key={item.provider}
                      className={`desktop-cloud-workflow-source-card ${selected ? "selected" : ""}`}
                      type="button"
                      onClick={() => setSelectedProviderId(item.provider)}
                    >
                      <span className="desktop-cloud-workflow-source-icon">
                        {iconUrl ? <img src={iconUrl} alt="" /> : <Icon size={20} />}
                      </span>
                      <span className="desktop-cloud-workflow-source-content">
                        <span>{item.display_name}</span>
                        <small>{needsOAuth ? "Authorize in Cloud" : "Authorized"}</small>
                      </span>
                      {needsOAuth && (
                        <span
                          className="desktop-cloud-workflow-source-auth"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenIntegrations();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onOpenIntegrations();
                            }
                          }}
                        >
                          Authorize
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="desktop-cloud-workflow-dialog-footer-row">
                <span className={requiresCloudOAuth ? "muted" : "ready"}>
                  {requiresCloudOAuth ? "Cloud authorization is required before creating this sync." : "Ready to configure"}
                </span>
                <div className="desktop-cloud-workflow-actions">
                  <button className="desktop-dialog-button" type="button" onClick={onClose}>Cancel</button>
                  <button className="desktop-dialog-button primary" type="button" disabled={!provider} onClick={() => setStep("configure")}>
                    Continue
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : provider ? (
            <>
              <div className="desktop-cloud-workflow-map">
                <section className="desktop-cloud-workflow-node">
                  <div className="desktop-cloud-workflow-node-header">
                    <span className="desktop-cloud-workflow-node-icon">
                      <CloudWorkflowProviderMark provider={provider.provider} iconUrl={provider.icon_url} />
                    </span>
                    <span>{provider.display_name}</span>
                  </div>
                  <div className="desktop-cloud-workflow-node-body">
                    {fields.length === 0 ? (
                      <div className="desktop-cloud-workflow-field-empty">No source settings required.</div>
                    ) : fields.map((field) => (
                      <label className="desktop-cloud-workflow-field" key={field.key}>
                        <span>{field.label}{field.required ? " *" : ""}</span>
                        <CloudWorkflowConfigInput
                          field={field}
                          value={configValues[field.key] ?? ""}
                          onChange={(value) => setConfigValues((current) => ({ ...current, [field.key]: value }))}
                        />
                        {field.hint && <small>{field.hint}</small>}
                      </label>
                    ))}
                  </div>
                </section>
                <div className="desktop-cloud-workflow-connector" aria-label="Sync trigger">
                  <span />
                  <button type="button">Manual</button>
                  <span />
                  <ArrowRight size={16} />
                </div>
                <section className="desktop-cloud-workflow-node">
                  <div className="desktop-cloud-workflow-node-header">
                    <span className="desktop-cloud-workflow-node-icon">
                      <img src="/icons/folder.svg" alt="" />
                    </span>
                    <span>{normalizedTargetPath ? `/${normalizedTargetPath}` : "Project folder"}</span>
                  </div>
                  <div className="desktop-cloud-workflow-node-body">
                    <label className="desktop-cloud-workflow-field">
                      <span>Project path</span>
                      <input
                        value={targetPath}
                        onChange={(event) => setTargetPath(event.target.value)}
                        placeholder="folder-name"
                      />
                    </label>
                  </div>
                </section>
              </div>
              {feedback && <div className="desktop-dialog-error">{feedback}</div>}
              <div className="desktop-cloud-workflow-dialog-footer-row">
                <span className={canCreate ? "ready" : "muted"}>
                  {requiresCloudOAuth ? "Authorize this provider in Cloud." : missingRequired ? "Fill required fields" : "Ready to create"}
                </span>
                <div className="desktop-cloud-workflow-actions">
                  <button className="desktop-dialog-button" type="button" disabled={saving} onClick={() => setStep("source")}>Back</button>
                  {requiresCloudOAuth && (
                    <button className="desktop-dialog-button" type="button" onClick={onOpenIntegrations}>
                      <ExternalLink size={14} />
                      Authorize
                    </button>
                  )}
                  <button className="desktop-dialog-button primary" type="button" disabled={!canCreate} onClick={handleCreate}>
                    <Check size={14} />
                    {saving ? "Creating" : "Create sync"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}

function CloudWorkflowConfigInput({
  field,
  value,
  onChange,
}: {
  field: DesktopCloudWorkflowConfigField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "select" && field.options?.length) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value}
      type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
      placeholder={field.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function CloudManageSyncDialog({
  row,
  cloudSession,
  apiBaseUrl,
  onCloudSessionChange,
  onRefresh,
  onOpenAccess,
  onClose,
}: {
  row: CloudAccessSurfaceRow;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAccess: () => void;
  onClose: () => void;
}) {
  const connector = row.surface.connector;
  const [busy, setBusy] = useState<"refresh" | "pause" | "resume" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!connector) return null;

  const providerLabel = formatProviderLabel(connector.provider);
  const targetTitle = getScopePathLabel(row.scope) === "/" ? "Project root" : getScopePathLabel(row.scope);
  const paused = connector.status === "paused";
  const title = `${connector.name || providerLabel} to ${targetTitle}`;

  const runAction = async (action: "refresh" | "pause" | "resume" | "delete") => {
    if (busy) return;
    if (action === "delete") {
      const confirmed = window.confirm("Delete this integration? Existing project files stay in place.");
      if (!confirmed) return;
    }
    setBusy(action);
    setError(null);
    try {
      if (action === "refresh") {
        await refreshCloudWorkflowConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else if (action === "pause") {
        await pauseCloudWorkflowConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else if (action === "resume") {
        await resumeCloudWorkflowConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else {
        await deleteCloudWorkflowConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
        onClose();
      }
      await onRefresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${action}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DesktopDialogRoot onClose={busy ? undefined : onClose}>
      <DesktopDialogSurface width={860} className="desktop-cloud-workflow-dialog">
        <header className="desktop-dialog-header desktop-cloud-workflow-dialog-header">
          <div className="desktop-dialog-title-row">
            <div>
              <h2>{title}</h2>
              <p>{providerLabel} syncs into {targetTitle}</p>
            </div>
          </div>
          <div className="desktop-cloud-workflow-header-actions">
            <button className="desktop-dialog-button" type="button" disabled={busy !== null} onClick={() => runAction("refresh")}>
              <Play size={14} />
              {busy === "refresh" ? "Running" : "Run now"}
            </button>
            <button className="desktop-dialog-button" type="button" disabled={busy !== null} onClick={() => runAction(paused ? "resume" : "pause")}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
              {busy === "pause" || busy === "resume" ? "Saving" : paused ? "Resume" : "Pause"}
            </button>
            <button className="desktop-dialog-button" type="button" onClick={onOpenAccess}>
              <ExternalLink size={14} />
            </button>
            <button className="desktop-dialog-button" type="button" disabled={busy !== null} onClick={() => runAction("delete")}>
              <Trash2 size={14} />
            </button>
            <DesktopDialogCloseButton disabled={busy !== null} onClick={onClose} />
          </div>
        </header>
        <div className="desktop-dialog-body desktop-cloud-workflow-dialog-body">
          {error && <div className="desktop-dialog-error">{error}</div>}
          <div className="desktop-cloud-workflow-map">
            <section className="desktop-cloud-workflow-node">
              <div className="desktop-cloud-workflow-node-header">
                <span className="desktop-cloud-workflow-node-icon">
                  <CloudWorkflowProviderMark provider={connector.provider} />
                </span>
                <span>{connector.name || providerLabel}</span>
              </div>
              <div className="desktop-cloud-workflow-node-body">
                <CloudAuthorityCell label="Provider" value={providerLabel} />
                <CloudAuthorityCell label="Direction" value={connector.direction || "manual"} />
              </div>
            </section>
            <div className="desktop-cloud-workflow-connector" aria-label="Sync trigger">
              <span />
              <button type="button">{connector.trigger?.type ? formatStatusLabel(String(connector.trigger.type)) : "Manual"}</button>
              <span />
              <ArrowRight size={16} />
            </div>
            <section className="desktop-cloud-workflow-node">
              <div className="desktop-cloud-workflow-node-header">
                <span className="desktop-cloud-workflow-node-icon">
                  <img src="/icons/folder.svg" alt="" />
                </span>
                <span>{targetTitle}</span>
              </div>
              <div className="desktop-cloud-workflow-node-body">
                <CloudAuthorityCell label="Cloud path" value={getScopePathLabel(row.scope)} mono />
                <CloudAuthorityCell
                  label="Status"
                  value={formatStatusLabel(connector.status)}
                  tone={isConnectorActiveStatus(connector.status) ? "ready" : "warning"}
                />
              </div>
            </section>
          </div>
        </div>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}

function CloudWorkflowProviderMark({
  provider,
  iconUrl,
}: {
  provider: string;
  iconUrl?: string | null;
}) {
  const Icon = providerIcon(provider);
  const resolvedIconUrl = iconUrl || getCloudProviderIconUrl(provider);
  return resolvedIconUrl ? <img src={resolvedIconUrl} alt="" /> : <Icon size={18} />;
}

const CLOUD_WORKFLOW_INTERNAL_CONFIG_KEYS = new Set([
  "access_key",
  "authority",
  "connection_id",
  "credentials_ref",
  "credential_ref",
  "direction",
  "external_resource_id",
  "external_resource",
  "last_sync_commit_id",
  "name",
  "oauth_user_id",
  "provider",
  "resource_id",
  "status",
  "sync_behavior",
  "target_folder_path",
  "target_output",
  "target_path",
  "user_id",
  "write_behavior",
]);

function getCloudWorkflowUserConfigFields(
  provider: DesktopCloudWorkflowProviderSpec | null,
): DesktopCloudWorkflowConfigField[] {
  return (provider?.config_fields ?? []).filter((field) => !CLOUD_WORKFLOW_INTERNAL_CONFIG_KEYS.has(field.key));
}

function defaultWorkflowConfigValues(provider: DesktopCloudWorkflowProviderSpec): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of getCloudWorkflowUserConfigFields(provider)) {
    values[field.key] = field.default === null || field.default === undefined ? "" : String(field.default);
  }
  return values;
}

function defaultWorkflowTargetPath(provider: DesktopCloudWorkflowProviderSpec | null) {
  const label = provider?.display_name || provider?.provider || "Sync";
  return normalizeWorkflowTargetPath(label.replace(/[<>:"|?*]/g, "-"));
}

function normalizeWorkflowTargetPath(path: string) {
  return path.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function buildDesktopCreateWorkflowRequest({
  projectId,
  provider,
  configValues,
  targetPath,
}: {
  projectId: string;
  provider: DesktopCloudWorkflowProviderSpec;
  configValues: Record<string, string>;
  targetPath: string;
}): DesktopCloudCreateWorkflowRequest {
  const fieldsByKey = new Map(getCloudWorkflowUserConfigFields(provider).map((field) => [field.key, field]));
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(configValues)) {
    const trimmed = value.trim();
    if (!trimmed || key === "resource_url") continue;
    const field = fieldsByKey.get(key);
    options[key] = field?.type === "number" ? Number(trimmed) : value;
  }

  const resourceUrl = (configValues.resource_url ?? "").trim();
  const source = provider.provider === "url"
    ? {
        provider: provider.provider,
        resource_type: "web_page",
        resource_id: resourceUrl,
        resource_name: resourceUrl,
        resource_url: resourceUrl,
      }
    : {
        provider: provider.provider,
        resource_type: "manual",
        resource_id: provider.provider,
        resource_name: provider.display_name,
      };

  return {
    project_id: projectId,
    provider: provider.provider,
    config: {
      source,
      options,
    },
    target_folder_path: targetPath,
    target_path: targetPath,
    direction: "inbound",
    sync_mode: "manual",
    trigger: { type: "manual" },
  };
}
