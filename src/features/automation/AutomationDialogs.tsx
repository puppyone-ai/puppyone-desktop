import { ArrowRight, Check, ChevronRight, ExternalLink, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DesktopCloudSession,
  DesktopCloudAutomationConfigField,
  DesktopCloudAutomationProviderSpec,
} from "../../lib/cloudApi";
import {
  createCloudAutomation,
  deleteCloudAutomationConnection,
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
import {
  buildDesktopCreateAutomationRequest,
  defaultAutomationConfigValues,
  defaultAutomationTargetPath,
  getCloudAutomationUserConfigFields,
  getDefaultAutomationRunMode,
  getSupportedAutomationRunModes,
  normalizeAutomationTargetPath,
  type AutomationRunMode,
} from "./automationRequest";
import type { AutomationTemplate } from "./automationTemplates";

export function CloudNewAutomationDialog({
  projectId,
  cloudSession,
  apiBaseUrl,
  providers,
  providersLoading,
  providersError,
  template,
  onCloudSessionChange,
  onRefresh,
  onOpenAutomation,
  onClose,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  providers: DesktopCloudAutomationProviderSpec[];
  providersLoading: boolean;
  providersError: string | null;
  template: AutomationTemplate | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAutomation: () => void;
  onClose: () => void;
}) {
  const datasourceProviders = providers.filter((provider) => provider.category === "datasource");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(template?.provider ?? null);
  const [step, setStep] = useState<"source" | "configure">(template ? "configure" : "source");
  const [targetPath, setTargetPath] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [runMode, setRunMode] = useState<AutomationRunMode>("manual");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProviderId || datasourceProviders.length === 0) return;
    setSelectedProviderId(datasourceProviders[0].provider);
  }, [datasourceProviders, selectedProviderId]);

  const provider = datasourceProviders.find((item) => item.provider === selectedProviderId) ?? null;
  const fields = getCloudAutomationUserConfigFields(provider);
  const supportedRunModes = getSupportedAutomationRunModes(provider);
  const requiresCloudConnection = Boolean(
    provider
    && provider.creation_mode === "bootstrap"
    && provider.auth !== "none",
  );
  const missingRequired = fields.some((field) => field.required && !configValues[field.key]?.trim());
  const normalizedTargetPath = normalizeAutomationTargetPath(targetPath || defaultAutomationTargetPath(provider));
  const scheduleMissing = runMode === "scheduled" && !schedule.trim();
  const canCreate = Boolean(
    provider
    && normalizedTargetPath
    && !missingRequired
    && !scheduleMissing
    && !saving
    && !requiresCloudConnection,
  );

  useEffect(() => {
    if (!provider) return;
    setConfigValues(defaultAutomationConfigValues(provider));
    setTargetPath(defaultAutomationTargetPath(provider));
    setRunMode(getDefaultAutomationRunMode(provider));
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
          runMode,
          schedule,
          timezone,
        }),
        onCloudSessionChange,
        apiBaseUrl,
      );
      await onRefresh();
      onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to create automation.");
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
              <h2>{step === "source" ? "New automation" : template?.title ?? `Configure ${provider?.display_name ?? "automation"}`}</h2>
              <p>
                {step === "source"
                  ? "Choose the source this Automation watches or imports from."
                  : template?.description ?? "Choose the source data, project destination, and trigger."}
              </p>
            </div>
          </div>
          <DesktopDialogCloseButton disabled={saving} onClick={onClose} />
        </header>
        <div className="desktop-dialog-body desktop-cloud-automation-dialog-body">
          {providersLoading ? (
            <div className="desktop-cloud-automation-state">Loading Automation sources…</div>
          ) : providersError ? (
            <div className="desktop-dialog-error">{providersError}</div>
          ) : datasourceProviders.length === 0 ? (
            <div className="desktop-cloud-automation-state">No Automation sources are available.</div>
          ) : step === "source" ? (
            <>
              <div className="desktop-cloud-automation-source-grid">
                {datasourceProviders.map((item) => {
                  const Icon = providerIcon(item.provider);
                  const iconUrl = item.icon_url || getCloudProviderIconUrl(item.provider);
                  const selected = item.provider === provider?.provider;
                  const needsConnection = item.creation_mode === "bootstrap" && item.auth !== "none";
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
                        <small>{item.description || "Use this source in an Automation."}</small>
                      </span>
                      <span className={`desktop-cloud-automation-source-auth ${needsConnection ? "connection-required" : "ready"}`}>
                        {needsConnection ? "Connection required" : "Ready"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="desktop-cloud-automation-dialog-footer-row">
                <span className="muted">Select a source, then configure its destination and trigger.</span>
                <div className="desktop-cloud-automation-actions">
                  <button className="desktop-dialog-button" type="button" onClick={onClose}>Cancel</button>
                  <button className="desktop-dialog-button primary" type="button" disabled={!provider} onClick={() => setStep("configure")}>
                    Continue
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : !provider ? (
            <div className="desktop-cloud-automation-state">
              <span>This Automation source is no longer available.</span>
              <button className="desktop-dialog-button" type="button" onClick={() => setStep("source")}>Choose another source</button>
            </div>
          ) : (
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
                <div className="desktop-cloud-automation-connector" aria-label="Automation trigger">
                  <span />
                  <select
                    className="desktop-cloud-automation-trigger-select"
                    aria-label="Run trigger"
                    value={runMode}
                    onChange={(event) => setRunMode(event.target.value as AutomationRunMode)}
                  >
                    {supportedRunModes.map((mode) => (
                      <option key={mode} value={mode}>{formatAutomationRunMode(mode)}</option>
                    ))}
                  </select>
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
              {runMode === "scheduled" && (
                <section className="desktop-cloud-automation-schedule-settings" aria-label="Schedule settings">
                  <label className="desktop-cloud-automation-field">
                    <span>Schedule</span>
                    <input
                      value={schedule}
                      onChange={(event) => setSchedule(event.target.value)}
                      placeholder="0 * * * *"
                    />
                    <small>Use a five-part cron expression.</small>
                  </label>
                  <label className="desktop-cloud-automation-field">
                    <span>Timezone</span>
                    <input
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      placeholder="UTC"
                    />
                  </label>
                </section>
              )}
              {feedback && <div className="desktop-dialog-error">{feedback}</div>}
              <div className="desktop-cloud-automation-dialog-footer-row">
                <span className={canCreate ? "ready" : "muted"}>
                  {requiresCloudConnection
                    ? `Connect ${provider.display_name} before activating this Automation.`
                    : missingRequired
                      ? "Fill the required source fields."
                      : scheduleMissing
                        ? "Add a schedule before creating this Automation."
                        : "Ready to create Automation."}
                </span>
                <div className="desktop-cloud-automation-actions">
                  {!template && (
                    <button className="desktop-dialog-button" type="button" disabled={saving} onClick={() => setStep("source")}>Back</button>
                  )}
                  {requiresCloudConnection && (
                    <button className="desktop-dialog-button" type="button" onClick={onOpenAutomation}>
                      <ExternalLink size={14} />
                      Connect source
                    </button>
                  )}
                  <button className="desktop-dialog-button primary" type="button" disabled={!canCreate} onClick={handleCreate}>
                    <Check size={14} />
                    {saving ? "Creating" : "Create automation"}
                  </button>
                </div>
              </div>
            </>
          )}
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

export function CloudManageAutomationDialog({
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
              <p>{providerLabel} Automation writes into {targetTitle}</p>
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
            <div className="desktop-cloud-automation-connector" aria-label="Automation trigger">
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

function formatAutomationRunMode(mode: AutomationRunMode) {
  if (mode === "scheduled") return "Scheduled";
  if (mode === "realtime") return "Realtime";
  return "Manual";
}
