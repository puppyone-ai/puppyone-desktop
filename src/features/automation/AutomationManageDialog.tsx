import {
  ArrowRight,
  Check,
  ExternalLink,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DesktopCloudAutomationProviderSpec,
  DesktopCloudAutomationRun,
  DesktopCloudSession,
} from "../../lib/cloudApi";
import {
  deleteCloudAutomationConnection,
  listCloudAutomationConnectionRuns,
  pauseCloudAutomationConnection,
  refreshCloudAutomationConnection,
  resumeCloudAutomationConnection,
  updateCloudAutomationConnection,
  updateCloudAutomationTrigger,
} from "../../lib/cloudApi";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../components/DesktopDialog";
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
  CloudAutomationDestinationEditor,
  CloudAutomationSourceEditor,
  CloudAutomationTriggerEditor,
} from "./AutomationControls";
import {
  automationConfigValuesFromConnection,
  automationSourceFromConfig,
  automationTriggerDraftFromConnection,
  buildAutomationConfig,
  buildAutomationTriggerUpdateRequest,
  formatAutomationTriggerSummary,
  formatNextAutomationRun,
  getAutomationTargetPathValidationError,
  getAutomationTriggerValidationError,
  getCloudAutomationUserConfigFields,
  normalizeAutomationTargetPath,
  type AutomationSourceSelection,
} from "./automationRequest";

export function CloudManageAutomationDialog({
  projectId,
  row,
  providerSpec,
  cloudSession,
  apiBaseUrl,
  onCloudSessionChange,
  onRefresh,
  onOpenAutomation,
  onClose,
}: {
  projectId: string;
  row: CloudAutomationRow;
  providerSpec: DesktopCloudAutomationProviderSpec | null;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAutomation: () => void;
  onClose: () => void;
}) {
  const connector = row.connector;
  const provider = useMemo(
    () => providerSpec ?? fallbackProviderSpec(connector.provider),
    [connector.provider, providerSpec],
  );
  const [busy, setBusy] = useState<"refresh" | "pause" | "resume" | "delete" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [configValues, setConfigValues] = useState(() => automationConfigValuesFromConnection(provider, connector.config));
  const [source, setSource] = useState<AutomationSourceSelection | null>(() => automationSourceFromConfig(connector.config));
  const [targetPath, setTargetPath] = useState(() => getConnectionTargetPath(row));
  const [trigger, setTrigger] = useState(() => automationTriggerDraftFromConnection(provider, connector.trigger));
  const [runs, setRuns] = useState<DesktopCloudAutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const runsRequestRef = useRef(0);
  const providerLabel = formatProviderLabel(connector.provider);
  const targetTitle = getScopePathLabel(row.scope) === "/" ? "Project root" : getScopePathLabel(row.scope);
  const paused = connector.status === "paused";
  const title = `${connector.name || providerLabel} to ${targetTitle}`;
  const nextRun = useMemo(() => formatNextAutomationRun(trigger), [trigger]);
  const scheduledTrigger = ["hourly", "daily", "weekly", "custom"].includes(trigger.preset);

  const loadRuns = useCallback(async () => {
    const requestId = runsRequestRef.current + 1;
    runsRequestRef.current = requestId;
    setRunsLoading(true);
    setRunsError(null);
    try {
      const result = await listCloudAutomationConnectionRuns(
        cloudSession,
        connector.id,
        10,
        onCloudSessionChange,
        apiBaseUrl,
      );
      if (runsRequestRef.current !== requestId) return;
      setRuns(result);
    } catch (loadError) {
      if (runsRequestRef.current !== requestId) return;
      setRunsError(loadError instanceof Error ? loadError.message : "Unable to load run history.");
    } finally {
      if (runsRequestRef.current === requestId) setRunsLoading(false);
    }
  }, [apiBaseUrl, cloudSession, connector.id, onCloudSessionChange]);

  useEffect(() => {
    void loadRuns();
    return () => {
      runsRequestRef.current += 1;
    };
  }, [loadRuns]);

  const runAction = async (action: "refresh" | "pause" | "resume" | "delete") => {
    if (busy) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "refresh") {
        await refreshCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else if (action === "pause") {
        await pauseCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else if (action === "resume") {
        await resumeCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
      } else {
        await deleteCloudAutomationConnection(cloudSession, connector.id, onCloudSessionChange, apiBaseUrl);
        await onRefresh();
        onClose();
        return;
      }
      await onRefresh();
      if (action === "refresh") await loadRuns();
      setNotice(action === "refresh" ? "A new run was queued." : `Automation ${action === "pause" ? "paused" : "resumed"}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${action}.`);
    } finally {
      setBusy(null);
    }
  };

  const fields = getCloudAutomationUserConfigFields(provider);
  const missingRequired = fields.some((field) => field.required && !configValues[field.key]?.trim());
  const sourceMissing = provider.provider !== "url" && providerNeedsOauth(provider) && !source?.resourceId.trim();
  const targetPathError = getAutomationTargetPathValidationError(targetPath);
  const triggerError = getAutomationTriggerValidationError(trigger);
  const canSave = !missingRequired && !sourceMissing && !targetPathError && !triggerError && !busy;

  const saveChanges = async () => {
    if (!canSave) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      await updateCloudAutomationConnection(
        cloudSession,
        connector.id,
        {
          config: buildAutomationConfig({ provider, configValues, source, baseConfig: connector.config }),
          target_path: normalizeAutomationTargetPath(targetPath),
          direction: "inbound",
        },
        onCloudSessionChange,
        apiBaseUrl,
      );
      await updateCloudAutomationTrigger(
        cloudSession,
        connector.id,
        buildAutomationTriggerUpdateRequest(trigger),
        onCloudSessionChange,
        apiBaseUrl,
      );
      await onRefresh();
      setEditing(false);
      setNotice("Automation settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Automation settings.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DesktopDialogRoot onClose={busy ? undefined : onClose}>
      <DesktopDialogSurface width={920} className="desktop-cloud-automation-dialog" ariaLabel={title}>
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
            <button
              className="desktop-dialog-button desktop-cloud-automation-icon-action"
              type="button"
              aria-label="Open Automation in Cloud"
              title="Open Automation in Cloud"
              onClick={onOpenAutomation}
            >
              <ExternalLink size={14} />
            </button>
            <button
              className="desktop-dialog-button desktop-cloud-automation-icon-action"
              type="button"
              disabled={busy !== null}
              aria-label="Delete Automation"
              title="Delete Automation"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={14} />
            </button>
            <DesktopDialogCloseButton disabled={busy !== null} onClick={onClose} />
          </div>
        </header>
        <div className="desktop-dialog-body desktop-cloud-automation-dialog-body">
          {error && <div className="desktop-dialog-error" role="alert">{error}</div>}
          {notice && <div className="desktop-cloud-automation-success" role="status">{notice}</div>}
          {deleteConfirm && (
            <section className="desktop-cloud-automation-delete-confirm" role="alert" aria-label="Confirm Automation deletion">
              <div>
                <strong>Delete this Automation?</strong>
                <span>Scheduling and future imports will stop. Files already imported into the project will stay in place.</span>
              </div>
              <div className="desktop-cloud-automation-actions">
                <button className="desktop-dialog-button" type="button" autoFocus disabled={busy !== null} onClick={() => setDeleteConfirm(false)}>Keep Automation</button>
                <button className="desktop-dialog-button danger" type="button" disabled={busy !== null} onClick={() => runAction("delete")}>
                  {busy === "delete" ? "Deleting" : "Delete Automation"}
                </button>
              </div>
            </section>
          )}
          <div className="desktop-cloud-automation-map">
            <section className="desktop-cloud-automation-node">
              <div className="desktop-cloud-automation-node-header">
                <span className="desktop-cloud-automation-node-icon"><CloudAutomationProviderMark provider={connector.provider} /></span>
                <span>{connector.name || providerLabel}</span>
              </div>
              <div className="desktop-cloud-automation-node-body">
                <DetailValue label="Provider" value={providerLabel} />
                <DetailValue label="Direction" value="Inbound" />
              </div>
            </section>
            <div className="desktop-cloud-automation-connector" aria-label="Automation trigger">
              <span />
              <button type="button" aria-label="Edit Automation trigger" onClick={() => setEditing(true)}>
                {formatStatusLabel(trigger.preset)}
              </button>
              <span />
              <ArrowRight size={16} />
            </div>
            <section className="desktop-cloud-automation-node">
              <div className="desktop-cloud-automation-node-header">
                <span className="desktop-cloud-automation-node-icon"><img src="/icons/folder.svg" alt="" /></span>
                <span>{targetTitle}</span>
              </div>
              <div className="desktop-cloud-automation-node-body">
                <DetailValue label="Cloud path" value={getScopePathLabel(row.scope)} mono />
                <DetailValue
                  label="Status"
                  value={formatStatusLabel(connector.status)}
                  tone={isConnectorActiveStatus(connector.status) ? "ready" : "warning"}
                />
              </div>
            </section>
          </div>

          <section className="desktop-cloud-automation-schedule-overview">
            <div>
              <strong>Schedule</strong>
              <span>{formatAutomationTriggerSummary(trigger)}</span>
              {scheduledTrigger && (
                <small>{nextRun ? `Next run: ${nextRun}` : "Next run follows this custom schedule."}</small>
              )}
            </div>
            <button className="desktop-dialog-button" type="button" onClick={() => setEditing((current) => !current)}>
              {editing ? "Hide editor" : "Edit source, trigger, and folder"}
            </button>
          </section>

          {editing && (
            <section className="desktop-cloud-automation-manage-editor" aria-label="Edit Automation settings">
              <div>
                <h3>Source</h3>
                <CloudAutomationSourceEditor
                  provider={provider}
                  cloudSession={cloudSession}
                  apiBaseUrl={apiBaseUrl}
                  configValues={configValues}
                  source={source}
                  onCloudSessionChange={onCloudSessionChange}
                  onConfigValueChange={(key, value) => setConfigValues((current) => ({ ...current, [key]: value }))}
                  onSourceChange={setSource}
                />
              </div>
              <div>
                <h3>Trigger</h3>
                <CloudAutomationTriggerEditor provider={provider} draft={trigger} onChange={setTrigger} showNextRun />
              </div>
              <div>
                <h3>Destination</h3>
                <CloudAutomationDestinationEditor
                  projectId={projectId}
                  cloudSession={cloudSession}
                  apiBaseUrl={apiBaseUrl}
                  targetPath={targetPath}
                  onCloudSessionChange={onCloudSessionChange}
                  onChange={setTargetPath}
                />
              </div>
              <div className="desktop-cloud-automation-manage-editor-actions">
                <span>{missingRequired ? "Fill the required source fields." : sourceMissing ? "Choose or enter a source resource." : targetPathError || triggerError}</span>
                <button className="desktop-dialog-button primary" type="button" disabled={!canSave} onClick={saveChanges}>
                  <Check size={14} />
                  {busy === "save" ? "Saving" : "Save changes"}
                </button>
              </div>
            </section>
          )}

          <RunHistory runs={runs} loading={runsLoading} error={runsError} onRetry={loadRuns} />
        </div>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}

function RunHistory({
  runs,
  loading,
  error,
  onRetry,
}: {
  runs: DesktopCloudAutomationRun[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  return (
    <section className="desktop-cloud-automation-run-history" aria-label="Automation run history">
      <header><h3>Recent runs</h3><span>{runs.length > 0 ? `${runs.length} shown` : null}</span></header>
      {loading ? (
        <div className="desktop-cloud-automation-run-state" role="status">Loading run history…</div>
      ) : error ? (
        <div className="desktop-cloud-automation-run-state error">
          <span>{error}</span>
          <button className="desktop-cloud-automation-link-button" type="button" onClick={() => void onRetry()}>Retry</button>
        </div>
      ) : runs.length === 0 ? (
        <div className="desktop-cloud-automation-run-state">No runs yet.</div>
      ) : (
        <div className="desktop-cloud-automation-run-list">
          {runs.map((run) => (
            <article key={run.id}>
              <span className={`desktop-cloud-automation-run-status ${getStatusTone(run.status)}`}>{formatStatusLabel(run.status)}</span>
              <div>
                <strong>{run.result_summary || formatStatusLabel(run.trigger_type || "Automation run")}</strong>
                <small>{formatRunTimestamp(run.started_at || run.finished_at)}</small>
                {run.error && <p>{run.error}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailValue({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "ready" | "warning";
}) {
  return (
    <div className="desktop-cloud-automation-detail-value">
      <span>{label}</span>
      <strong className={`${mono ? "mono" : ""} ${tone ?? ""}`.trim()}>{value}</strong>
    </div>
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

function providerNeedsOauth(provider: DesktopCloudAutomationProviderSpec) {
  return provider.auth !== "none";
}

function fallbackProviderSpec(provider: string): DesktopCloudAutomationProviderSpec {
  return {
    provider,
    display_name: formatProviderLabel(provider),
    description: null,
    auth: "none",
    creation_mode: "direct",
    category: "datasource",
    icon: null,
    supported_sync_modes: ["manual", "scheduled"],
    default_sync_mode: "manual",
    config_fields: [],
  };
}

function getConnectionTargetPath(row: CloudAutomationRow) {
  const configPath = typeof row.connector.config?.target_path === "string" ? row.connector.config.target_path : "";
  return normalizeAutomationTargetPath(configPath || row.scope.path || "");
}

function formatRunTimestamp(value: string | null | undefined) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["success", "completed", "active"].includes(normalized)) return "success";
  if (["failed", "error", "blocked"].includes(normalized)) return "danger";
  if (["queued", "pending"].includes(normalized)) return "warning";
  return "accent";
}
