import { ArrowRight, Check, ChevronRight, ExternalLink, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DesktopCloudCreateAutomationRequest,
  DesktopCloudSession,
  DesktopCloudAutomationConfigField,
  DesktopCloudAutomationProviderSpec,
} from "../../lib/cloudApi";
import {
  createCloudAutomation,
  deleteCloudAutomationConnection,
  listCloudAutomationProviderSpecs,
  pauseCloudAutomationConnection,
  refreshCloudAutomationConnection,
  resumeCloudAutomationConnection,
} from "../../lib/cloudApi";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../components/DesktopDialog";
import { CloudAuthorityCell } from "../cloud/components/shared";
import {
  formatProviderLabel,
  formatStatusLabel,
  getCloudProviderIconUrl,
  getScopePathLabel,
  isConnectorActiveStatus,
  providerIcon,
} from "../cloud/utils";
import type { CloudAutomationRow } from "./automationDomain";

export function CloudNewSyncDialog({
  projectId,
  cloudSession,
  apiBaseUrl,
  onCloudSessionChange,
  onRefresh,
  onOpenAutomation,
  onClose,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAutomation: () => void;
  onClose: () => void;
}) {
  const [providers, setProviders] = useState<DesktopCloudAutomationProviderSpec[]>([]);
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
    void listCloudAutomationProviderSpecs(cloudSession, onCloudSessionChange, apiBaseUrl)
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
  const fields = getCloudAutomationUserConfigFields(provider);
  const requiresCloudOAuth = provider ? provider.auth === "oauth" || provider.auth === "optional_oauth" : false;
  const missingRequired = fields.some((field) => field.required && !configValues[field.key]?.trim());
  const normalizedTargetPath = normalizeAutomationTargetPath(targetPath || defaultAutomationTargetPath(provider));
  const canCreate = Boolean(provider && normalizedTargetPath && !missingRequired && !saving && !requiresCloudOAuth);

  useEffect(() => {
    if (!provider) return;
    setConfigValues(defaultAutomationConfigValues(provider));
    setTargetPath(defaultAutomationTargetPath(provider));
    setFeedback(null);
  }, [provider]);

  const handleCreate = async () => {
    if (!provider || !canCreate) return;
    setSaving(true);
    setFeedback(null);
    try {
      await createCloudAutomation(
        cloudSession,
        buildDesktopCreateAutomationRequest({
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
      <DesktopDialogSurface width={step === "configure" ? 860 : 820} className="desktop-cloud-automation-dialog">
        <header className="desktop-dialog-header desktop-cloud-automation-dialog-header">
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
        <div className="desktop-dialog-body desktop-cloud-automation-dialog-body">
          {providersLoading ? (
            <div className="desktop-cloud-automation-state">Loading providers</div>
          ) : providersError ? (
            <div className="desktop-dialog-error">{providersError}</div>
          ) : providers.length === 0 ? (
            <div className="desktop-cloud-automation-state">No sync providers available.</div>
          ) : step === "source" ? (
            <>
              <div className="desktop-cloud-automation-source-grid">
                {providers.map((item) => {
                  const Icon = providerIcon(item.provider);
                  const iconUrl = item.icon_url || getCloudProviderIconUrl(item.provider);
                  const selected = item.provider === provider?.provider;
                  const needsOAuth = item.auth === "oauth" || item.auth === "optional_oauth";
                  return (
                    <button
                      key={item.provider}
                      className={`desktop-cloud-automation-source-card ${selected ? "selected" : ""}`}
                      type="button"
                      onClick={() => setSelectedProviderId(item.provider)}
                    >
                      <span className="desktop-cloud-automation-source-icon">
                        {iconUrl ? <img src={iconUrl} alt="" /> : <Icon size={20} />}
                      </span>
                      <span className="desktop-cloud-automation-source-content">
                        <span>{item.display_name}</span>
                        <small>{needsOAuth ? "Authorize in Cloud" : "Authorized"}</small>
                      </span>
                      {needsOAuth && (
                        <span
                          className="desktop-cloud-automation-source-auth"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenAutomation();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onOpenAutomation();
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
              <div className="desktop-cloud-automation-dialog-footer-row">
                <span className={requiresCloudOAuth ? "muted" : "ready"}>
                  {requiresCloudOAuth ? "Cloud authorization is required before creating this sync." : "Ready to configure"}
                </span>
                <div className="desktop-cloud-automation-actions">
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
              <div className="desktop-cloud-automation-map">
                <section className="desktop-cloud-automation-node">
                  <div className="desktop-cloud-automation-node-header">
                    <span className="desktop-cloud-automation-node-icon">
                      <CloudAutomationProviderMark provider={provider.provider} iconUrl={provider.icon_url} />
                    </span>
                    <span>{provider.display_name}</span>
                  </div>
                  <div className="desktop-cloud-automation-node-body">
                    {fields.length === 0 ? (
                      <div className="desktop-cloud-automation-field-empty">No source settings required.</div>
                    ) : fields.map((field) => (
                      <label className="desktop-cloud-automation-field" key={field.key}>
                        <span>{field.label}{field.required ? " *" : ""}</span>
                        <CloudAutomationConfigInput
                          field={field}
                          value={configValues[field.key] ?? ""}
                          onChange={(value) => setConfigValues((current) => ({ ...current, [field.key]: value }))}
                        />
                        {field.hint && <small>{field.hint}</small>}
                      </label>
                    ))}
                  </div>
                </section>
                <div className="desktop-cloud-automation-connector" aria-label="Sync trigger">
                  <span />
                  <button type="button">Manual</button>
                  <span />
                  <ArrowRight size={16} />
                </div>
                <section className="desktop-cloud-automation-node">
                  <div className="desktop-cloud-automation-node-header">
                    <span className="desktop-cloud-automation-node-icon">
                      <img src="/icons/folder.svg" alt="" />
                    </span>
                    <span>{normalizedTargetPath ? `/${normalizedTargetPath}` : "Project folder"}</span>
                  </div>
                  <div className="desktop-cloud-automation-node-body">
                    <label className="desktop-cloud-automation-field">
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
              <div className="desktop-cloud-automation-dialog-footer-row">
                <span className={canCreate ? "ready" : "muted"}>
                  {requiresCloudOAuth ? "Authorize this provider in Cloud." : missingRequired ? "Fill required fields" : "Ready to create"}
                </span>
                <div className="desktop-cloud-automation-actions">
                  <button className="desktop-dialog-button" type="button" disabled={saving} onClick={() => setStep("source")}>Back</button>
                  {requiresCloudOAuth && (
                    <button className="desktop-dialog-button" type="button" onClick={onOpenAutomation}>
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

function CloudAutomationConfigInput({
  field,
  value,
  onChange,
}: {
  field: DesktopCloudAutomationConfigField;
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
  row: CloudAutomationRow;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAccess: () => void;
  onClose: () => void;
}) {
  const connector = row.connector;
  const [busy, setBusy] = useState<"refresh" | "pause" | "resume" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providerLabel = formatProviderLabel(connector.provider);
  const targetTitle = getScopePathLabel(row.scope) === "/" ? "Project root" : getScopePathLabel(row.scope);
  const paused = connector.status === "paused";
  const title = `${connector.name || providerLabel} to ${targetTitle}`;

  const runAction = async (action: "refresh" | "pause" | "resume" | "delete") => {
    if (busy) return;
    if (action === "delete") {
      const confirmed = window.confirm("Delete this automation? Existing project files stay in place.");
      if (!confirmed) return;
    }
    setBusy(action);
    setError(null);
    try {
      if (action === "refresh") {
        await refreshCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else if (action === "pause") {
        await pauseCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else if (action === "resume") {
        await resumeCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else {
        await deleteCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
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
      <DesktopDialogSurface width={860} className="desktop-cloud-automation-dialog">
        <header className="desktop-dialog-header desktop-cloud-automation-dialog-header">
          <div className="desktop-dialog-title-row">
            <div>
              <h2>{title}</h2>
              <p>{providerLabel} syncs into {targetTitle}</p>
            </div>
          </div>
          <div className="desktop-cloud-automation-header-actions">
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
        <div className="desktop-dialog-body desktop-cloud-automation-dialog-body">
          {error && <div className="desktop-dialog-error">{error}</div>}
          <div className="desktop-cloud-automation-map">
            <section className="desktop-cloud-automation-node">
              <div className="desktop-cloud-automation-node-header">
                <span className="desktop-cloud-automation-node-icon">
                  <CloudAutomationProviderMark provider={connector.provider} />
                </span>
                <span>{connector.name || providerLabel}</span>
              </div>
              <div className="desktop-cloud-automation-node-body">
                <CloudAuthorityCell label="Provider" value={providerLabel} />
                <CloudAuthorityCell label="Direction" value={connector.direction || "manual"} />
              </div>
            </section>
            <div className="desktop-cloud-automation-connector" aria-label="Sync trigger">
              <span />
              <button type="button">{connector.trigger?.type ? formatStatusLabel(String(connector.trigger.type)) : "Manual"}</button>
              <span />
              <ArrowRight size={16} />
            </div>
            <section className="desktop-cloud-automation-node">
              <div className="desktop-cloud-automation-node-header">
                <span className="desktop-cloud-automation-node-icon">
                  <img src="/icons/folder.svg" alt="" />
                </span>
                <span>{targetTitle}</span>
              </div>
              <div className="desktop-cloud-automation-node-body">
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

function CloudAutomationProviderMark({
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

function getCloudAutomationUserConfigFields(
  provider: DesktopCloudAutomationProviderSpec | null,
): DesktopCloudAutomationConfigField[] {
  return (provider?.config_fields ?? []).filter((field) => !CLOUD_WORKFLOW_INTERNAL_CONFIG_KEYS.has(field.key));
}

function defaultAutomationConfigValues(provider: DesktopCloudAutomationProviderSpec): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of getCloudAutomationUserConfigFields(provider)) {
    values[field.key] = field.default === null || field.default === undefined ? "" : String(field.default);
  }
  return values;
}

function defaultAutomationTargetPath(provider: DesktopCloudAutomationProviderSpec | null) {
  const label = provider?.display_name || provider?.provider || "Sync";
  return normalizeAutomationTargetPath(label.replace(/[<>:"|?*]/g, "-"));
}

function normalizeAutomationTargetPath(path: string) {
  return path.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function buildDesktopCreateAutomationRequest({
  projectId,
  provider,
  configValues,
  targetPath,
}: {
  projectId: string;
  provider: DesktopCloudAutomationProviderSpec;
  configValues: Record<string, string>;
  targetPath: string;
}): DesktopCloudCreateAutomationRequest {
  const fieldsByKey = new Map(getCloudAutomationUserConfigFields(provider).map((field) => [field.key, field]));
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
