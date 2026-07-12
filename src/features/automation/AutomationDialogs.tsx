import {
  ArrowRight,
  Check,
  ExternalLink,
  LoaderCircle,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DesktopCloudAutomationOauthStatus,
  DesktopCloudAutomationProviderSpec,
  DesktopCloudAutomationRun,
  DesktopCloudCreateAutomationResult,
  DesktopCloudSession,
} from "../../lib/cloudApi";
import {
  createCloudAutomation,
  deleteCloudAutomationConnection,
  getCloudAutomationOauthAuthorizeUrl,
  getCloudAutomationOauthStatus,
  listCloudAutomationConnectionRuns,
  openCloudAutomationAuthorizationUrl,
  pauseCloudAutomationConnection,
  refreshCloudAutomationConnection,
  resumeCloudAutomationConnection,
  supportsCloudAutomationOauth,
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
import { AutomationTemplateCard } from "./AutomationTemplateCard";
import {
  automationConfigValuesFromConnection,
  automationSourceFromConfig,
  automationTriggerDraftFromConnection,
  buildAutomationConfig,
  buildAutomationTriggerUpdateRequest,
  buildDesktopCreateAutomationRequest,
  defaultAutomationConfigValues,
  defaultAutomationTargetPath,
  formatAutomationTriggerSummary,
  formatNextAutomationRun,
  getAutomationTargetPathValidationError,
  getAutomationTriggerValidationError,
  getCloudAutomationUserConfigFields,
  getDefaultAutomationTriggerDraft,
  normalizeAutomationTargetPath,
  type AutomationSourceSelection,
} from "./automationRequest";
import { buildAutomationTemplates, type AutomationTemplate } from "./automationTemplates";

type WizardStep = "choose" | "resolving" | "connect" | "configure";
type OauthLookup = {
  state: "loading" | "connected" | "disconnected" | "error";
  status?: DesktopCloudAutomationOauthStatus;
  error?: string;
};

export type CloudAutomationCreationEcho = {
  connectionId: string;
  runId: string | null;
  provider: string;
  targetPath: string;
  status: string;
  summary: string;
  error: string | null;
};

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
  onCreated,
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
  onCreated: (echo: CloudAutomationCreationEcho) => void;
  onClose: () => void;
}) {
  const datasourceProviders = useMemo(
    () => providers.filter((provider) => provider.category === "datasource"),
    [providers],
  );
  const templates = useMemo(() => buildAutomationTemplates(datasourceProviders), [datasourceProviders]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(template?.provider ?? null);
  const [step, setStep] = useState<WizardStep>(template ? "resolving" : "choose");
  const [oauthLookups, setOauthLookups] = useState<Record<string, OauthLookup>>({});
  const [oauthReloadVersion, setOauthReloadVersion] = useState(0);
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [connectPhase, setConnectPhase] = useState<"starting" | "waiting" | "error">("starting");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState<AutomationSourceSelection | null>(null);
  const [trigger, setTrigger] = useState(() => getDefaultAutomationTriggerDraft(null));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const provider = datasourceProviders.find((item) => item.provider === selectedProviderId) ?? null;
  const activeTemplate = template?.provider === provider?.provider ? template : null;

  useEffect(() => {
    let cancelled = false;
    const oauthProviders = datasourceProviders.filter(
      (item) => item.auth !== "none" && supportsCloudAutomationOauth(item.provider),
    );
    setOauthLookups((current) => {
      const next = { ...current };
      for (const item of oauthProviders) next[item.provider] = { state: "loading" };
      return next;
    });
    for (const item of oauthProviders) {
      void getCloudAutomationOauthStatus(cloudSession, item.provider, onCloudSessionChange, apiBaseUrl)
        .then((status) => {
          if (cancelled) return;
          setOauthLookups((current) => ({
            ...current,
            [item.provider]: { state: status.connected ? "connected" : "disconnected", status },
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setOauthLookups((current) => ({
            ...current,
            [item.provider]: {
              state: "error",
              error: error instanceof Error ? error.message : "Unable to check connection status.",
            },
          }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cloudSession, datasourceProviders, oauthReloadVersion, onCloudSessionChange]);

  useEffect(() => {
    if (!provider) return;
    setConfigValues(defaultAutomationConfigValues(provider));
    setTargetPath(defaultAutomationTargetPath(provider));
    setSource(null);
    setTrigger(getDefaultAutomationTriggerDraft(provider));
    setFeedback(null);
  }, [provider]);

  useEffect(() => {
    if (step !== "resolving" || !provider) return;
    if (!providerNeedsOauth(provider) || !supportsCloudAutomationOauth(provider.provider)) {
      setStep("configure");
      return;
    }
    const lookup = oauthLookups[provider.provider];
    if (lookup?.state === "connected") setStep("configure");
    else if (lookup?.state === "disconnected") setStep("connect");
  }, [oauthLookups, provider, step]);

  useEffect(() => {
    if (step !== "connect" || !provider) return undefined;
    let cancelled = false;
    let pollTimer: number | null = null;
    const startTimer = window.setTimeout(() => {
      setConnectPhase("starting");
      setConnectError(null);
      void getCloudAutomationOauthAuthorizeUrl(
        cloudSession,
        provider.provider,
        onCloudSessionChange,
        apiBaseUrl,
      )
        .then((authorizationUrl) => openCloudAutomationAuthorizationUrl(authorizationUrl))
        .then(() => {
          if (cancelled) return;
          setConnectPhase("waiting");
          const poll = async () => {
            try {
              const status = await getCloudAutomationOauthStatus(
                cloudSession,
                provider.provider,
                onCloudSessionChange,
                apiBaseUrl,
              );
              if (cancelled) return;
              setOauthLookups((current) => ({
                ...current,
                [provider.provider]: { state: status.connected ? "connected" : "disconnected", status },
              }));
              if (status.connected) {
                setStep("configure");
                return;
              }
              pollTimer = window.setTimeout(poll, 3_000);
            } catch (error) {
              if (cancelled) return;
              setConnectPhase("error");
              setConnectError(error instanceof Error ? error.message : "Unable to verify the connection.");
            }
          };
          pollTimer = window.setTimeout(poll, 1_000);
        })
        .catch((error) => {
          if (cancelled) return;
          setConnectPhase("error");
          setConnectError(error instanceof Error ? error.message : "Unable to start authorization.");
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [apiBaseUrl, cloudSession, connectAttempt, onCloudSessionChange, provider, step]);

  const fields = getCloudAutomationUserConfigFields(provider);
  const missingRequired = fields.some((field) => field.required && !configValues[field.key]?.trim());
  const sourceMissing = Boolean(provider && provider.provider !== "url" && providerNeedsOauth(provider) && !source?.resourceId.trim());
  const normalizedTargetPath = normalizeAutomationTargetPath(targetPath);
  const targetPathError = getAutomationTargetPathValidationError(targetPath);
  const triggerError = getAutomationTriggerValidationError(trigger);
  const canCreate = Boolean(provider && !missingRequired && !sourceMissing && !targetPathError && !triggerError && !saving);

  const continueWithProvider = () => {
    if (!provider) return;
    if (!providerNeedsOauth(provider) || !supportsCloudAutomationOauth(provider.provider)) {
      setStep("configure");
      return;
    }
    const lookup = oauthLookups[provider.provider];
    if (lookup?.state === "connected") setStep("configure");
    else if (lookup?.state === "disconnected") setStep("connect");
    else setStep("resolving");
  };

  const handleCreate = async () => {
    if (!provider || !canCreate) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await createCloudAutomation(
        cloudSession,
        buildDesktopCreateAutomationRequest({
          projectId,
          provider,
          configValues,
          source,
          targetPath: normalizedTargetPath,
          trigger,
        }),
        onCloudSessionChange,
        apiBaseUrl,
      );
      onCreated(createAutomationEcho(result, provider.provider, normalizedTargetPath));
      onClose();
      void Promise.resolve().then(onRefresh).catch(() => undefined);
    } catch (error) {
      setFeedback(formatAutomationCreateError(error, provider.display_name));
      setSaving(false);
    }
  };

  const title = step === "choose"
    ? "Choose an Automation source"
    : step === "connect"
      ? `Connect ${provider?.display_name ?? "source"}`
      : activeTemplate?.title ?? `Configure ${provider?.display_name ?? "Automation"}`;

  return (
    <DesktopDialogRoot onClose={saving ? undefined : onClose}>
      <DesktopDialogSurface width={920} className="desktop-cloud-automation-dialog" ariaLabel={title}>
        <header className="desktop-dialog-header desktop-cloud-automation-dialog-header">
          <div className="desktop-dialog-title-row">
            <div>
              <h2>{title}</h2>
              <p>{getWizardDescription(step, provider, activeTemplate)}</p>
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
          ) : step === "choose" ? (
            <>
              <div className="desktop-cloud-automation-chooser-grid">
                {templates.map((item) => {
                  const itemProvider = datasourceProviders.find((candidate) => candidate.provider === item.provider);
                  const status = getProviderConnectionBadge(itemProvider, oauthLookups[item.provider]);
                  return (
                    <AutomationTemplateCard
                      key={item.id}
                      template={item}
                      selected={selectedProviderId === item.provider}
                      actionLabel="Choose"
                      status={status.label}
                      statusTone={status.tone}
                      onAdd={() => setSelectedProviderId(item.provider)}
                    />
                  );
                })}
              </div>
              <div className="desktop-cloud-automation-dialog-footer-row">
                <span className="muted">Choose the external source this Automation will watch.</span>
                <div className="desktop-cloud-automation-actions">
                  <button className="desktop-dialog-button" type="button" onClick={onClose}>Cancel</button>
                  <button className="desktop-dialog-button primary" type="button" disabled={!provider} onClick={continueWithProvider}>
                    Continue
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </>
          ) : !provider ? (
            <div className="desktop-cloud-automation-state">
              <span>This Automation source is no longer available.</span>
              <button className="desktop-dialog-button" type="button" onClick={() => setStep("choose")}>Choose another source</button>
            </div>
          ) : step === "resolving" ? (
            <ConnectionResolvingState
              provider={provider}
              lookup={provider ? oauthLookups[provider.provider] : undefined}
              onBack={() => setStep("choose")}
              onRetry={() => setOauthReloadVersion((current) => current + 1)}
            />
          ) : step === "connect" ? (
            <ConnectionWaitingState
              provider={provider}
              phase={connectPhase}
              error={connectError}
              onCancel={() => {
                setStep("choose");
                setOauthReloadVersion((current) => current + 1);
              }}
              onRetry={() => setConnectAttempt((current) => current + 1)}
            />
          ) : (
            <>
              <div className="desktop-cloud-automation-builder">
                <section className="desktop-cloud-automation-node">
                  <div className="desktop-cloud-automation-node-header">
                    <span className="desktop-cloud-automation-node-icon">
                      <CloudAutomationProviderMark provider={provider.provider} iconUrl={provider.icon_url} />
                    </span>
                    <span>{provider.display_name}</span>
                  </div>
                  <div className="desktop-cloud-automation-node-body">
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
                </section>
                <div className="desktop-cloud-automation-trigger-bridge">
                  <CloudAutomationTriggerEditor provider={provider} draft={trigger} onChange={setTrigger} />
                  <ArrowRight size={16} aria-hidden="true" />
                </div>
                <section className="desktop-cloud-automation-node">
                  <div className="desktop-cloud-automation-node-header">
                    <span className="desktop-cloud-automation-node-icon"><img src="/icons/folder.svg" alt="" /></span>
                    <span>/{normalizedTargetPath}</span>
                  </div>
                  <div className="desktop-cloud-automation-node-body">
                    <CloudAutomationDestinationEditor
                      projectId={projectId}
                      cloudSession={cloudSession}
                      apiBaseUrl={apiBaseUrl}
                      targetPath={targetPath}
                      onCloudSessionChange={onCloudSessionChange}
                      onChange={setTargetPath}
                    />
                  </div>
                </section>
              </div>
              {feedback && <div className="desktop-dialog-error desktop-cloud-automation-action-error" role="alert">{feedback}</div>}
              <div className="desktop-cloud-automation-dialog-footer-row">
                <span className={canCreate ? "ready" : "muted"}>
                  {missingRequired
                    ? "Fill the required source fields."
                    : sourceMissing
                      ? "Choose a source resource or enter its ID."
                      : targetPathError
                        ? targetPathError
                        : triggerError
                        ? triggerError
                        : "Ready to create Automation and queue its first sync."}
                </span>
                <div className="desktop-cloud-automation-actions">
                  <button className="desktop-dialog-button" type="button" disabled={saving} onClick={() => setStep("choose")}>Back</button>
                  <button className="desktop-dialog-button primary" type="button" disabled={!canCreate} onClick={handleCreate}>
                    <Check size={14} />
                    {saving ? "Creating" : "Create Automation"}
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

function ConnectionResolvingState({
  provider,
  lookup,
  onBack,
  onRetry,
}: {
  provider: DesktopCloudAutomationProviderSpec | null;
  lookup?: OauthLookup;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="desktop-cloud-automation-connect-state">
      {lookup?.state === "error" ? <ShieldCheck size={28} /> : <LoaderCircle className="desktop-dialog-spinner" size={28} />}
      <h3>{lookup?.state === "error" ? "Connection status unavailable" : `Checking ${provider?.display_name ?? "source"}…`}</h3>
      <p>{lookup?.error ?? "Reading the connection for this signed-in Cloud account."}</p>
      <div className="desktop-cloud-automation-actions">
        <button className="desktop-dialog-button" type="button" onClick={onBack}>Back</button>
        {lookup?.state === "error" && <button className="desktop-dialog-button primary" type="button" onClick={onRetry}>Retry</button>}
      </div>
    </div>
  );
}

function ConnectionWaitingState({
  provider,
  phase,
  error,
  onCancel,
  onRetry,
}: {
  provider: DesktopCloudAutomationProviderSpec;
  phase: "starting" | "waiting" | "error";
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="desktop-cloud-automation-connect-state">
      {phase === "error" ? <ExternalLink size={28} /> : <LoaderCircle className="desktop-dialog-spinner" size={28} />}
      <h3>{phase === "starting" ? "Opening secure authorization…" : phase === "waiting" ? "Waiting for connection" : "Authorization needs attention"}</h3>
      <p>
        {phase === "error"
          ? error
          : `Finish connecting ${provider.display_name} in your browser. This window will continue automatically.`}
      </p>
      <div className="desktop-cloud-automation-actions">
        <button className="desktop-dialog-button" type="button" onClick={onCancel}>Cancel</button>
        {phase === "error" && <button className="desktop-dialog-button primary" type="button" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

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

function getProviderConnectionBadge(
  provider: DesktopCloudAutomationProviderSpec | undefined,
  lookup: OauthLookup | undefined,
): { label: string; tone: "neutral" | "ready" | "required" | "error" } {
  if (!provider || !providerNeedsOauth(provider)) {
    return { label: "Ready", tone: "ready" };
  }
  if (!supportsCloudAutomationOauth(provider.provider)) {
    return { label: "Configuration required", tone: "required" };
  }
  if (!lookup || lookup.state === "loading") return { label: "Checking…", tone: "neutral" };
  if (lookup.state === "connected") {
    return { label: lookup.status?.workspace_name || "Connected", tone: "ready" };
  }
  if (lookup.state === "error") return { label: "Status unavailable", tone: "error" };
  return { label: "Connection required", tone: "required" };
}

function getWizardDescription(
  step: WizardStep,
  provider: DesktopCloudAutomationProviderSpec | null,
  template: AutomationTemplate | null,
) {
  if (step === "choose") return "Choose one external source; you can return here from any configuration.";
  if (step === "connect") return "Authorization happens in your browser; no Automation is created until configuration is complete.";
  if (step === "resolving") return "Checking the signed-in account before configuration.";
  return template?.description ?? `Choose the ${provider?.display_name ?? "source"} data, project folder, and trigger.`;
}

function createAutomationEcho(
  result: DesktopCloudCreateAutomationResult,
  provider: string,
  targetPath: string,
): CloudAutomationCreationEcho {
  const execution = isRecord(result.execution_result) ? result.execution_result : {};
  const status = readString(execution.status) || result.sync.status || "queued";
  const error = readString(execution.error) || result.sync.error_message || null;
  return {
    connectionId: result.sync.id,
    runId: readString(execution.run_id) || null,
    provider,
    targetPath,
    status,
    summary: readString(execution.summary) || (error ? "Initial sync failed" : "Initial sync queued"),
    error,
  };
}

function formatAutomationCreateError(error: unknown, providerLabel: string) {
  const message = error instanceof Error ? error.message : "Cloud request failed.";
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  if (status === 503 || /503|worker.*unavailable|enqueue|queue/i.test(message)) {
    return "The Automation was not created because its first sync could not be queued. Check the Cloud worker and try again.";
  }
  if (/oauth|authoriz|credential|token|connect.*account/i.test(message)) {
    return `${providerLabel} authorization failed. Go back, reconnect the account, then try again. ${message}`;
  }
  return `The Automation could not be created. Review the source and folder settings, then try again. ${message}`;
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
