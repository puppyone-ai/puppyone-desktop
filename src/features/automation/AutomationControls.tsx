import { ChevronDown, ChevronRight, Folder, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  DesktopCloudAutomationConfigField,
  DesktopCloudAutomationProviderResource,
  DesktopCloudAutomationProviderSpec,
  DesktopCloudSession,
} from "../../lib/cloudApi";
import {
  listCloudAutomationProviderResources,
  listCloudDirectory,
  supportsCloudAutomationOauth,
} from "../../lib/cloudApi";
import {
  automationSourceFromProviderResource,
  formatAutomationTriggerSummary,
  formatNextAutomationRun,
  getAutomationTimezones,
  getAutomationTargetPathValidationError,
  getAutomationTriggerPresets,
  getAutomationTriggerValidationError,
  getCloudAutomationUserConfigFields,
  normalizeAutomationTargetPath,
  type AutomationSourceSelection,
  type AutomationTriggerDraft,
  type AutomationTriggerPreset,
} from "./automationRequest";

type SessionChangeHandler = (session: DesktopCloudSession | null) => void;

export function CloudAutomationSourceEditor({
  provider,
  cloudSession,
  apiBaseUrl,
  configValues,
  source,
  onCloudSessionChange,
  onConfigValueChange,
  onSourceChange,
}: {
  provider: DesktopCloudAutomationProviderSpec;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  configValues: Record<string, string>;
  source: AutomationSourceSelection | null;
  onCloudSessionChange: SessionChangeHandler;
  onConfigValueChange: (key: string, value: string) => void;
  onSourceChange: (source: AutomationSourceSelection | null) => void;
}) {
  const fields = getCloudAutomationUserConfigFields(provider);
  const canEnumerate = provider.auth !== "none" && supportsCloudAutomationOauth(provider.provider);
  const [manualMode, setManualMode] = useState(!canEnumerate);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const handleManualFallback = useCallback((message: string) => {
    setFallbackNotice(message);
    setManualMode(true);
  }, []);

  useEffect(() => {
    setManualMode(!canEnumerate);
    setFallbackNotice(null);
  }, [canEnumerate, provider.provider]);

  return (
    <div className="desktop-cloud-automation-source-editor">
      {canEnumerate && !manualMode ? (
        <CloudAutomationResourcePicker
          provider={provider}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          value={source}
          onCloudSessionChange={onCloudSessionChange}
          onChange={onSourceChange}
          onManualFallback={handleManualFallback}
        />
      ) : provider.provider !== "url" ? (
        <CloudAutomationManualSourceFields source={source} onChange={onSourceChange} />
      ) : null}

      {fallbackNotice && <div className="desktop-cloud-automation-inline-note">{fallbackNotice}</div>}

      {canEnumerate && manualMode && (
        <button
          className="desktop-cloud-automation-link-button"
          type="button"
          onClick={() => {
            setFallbackNotice(null);
            setManualMode(false);
          }}
        >
          Browse connected resources
        </button>
      )}

      {fields.map((field) => (
        <label className="desktop-cloud-automation-field" key={field.key}>
          <span>{field.label}{field.required ? " *" : ""}</span>
          <CloudAutomationConfigInput
            field={field}
            value={configValues[field.key] ?? ""}
            onChange={(value) => onConfigValueChange(field.key, value)}
          />
          {field.hint && <small>{field.hint}</small>}
        </label>
      ))}

      {provider.provider === "url" && fields.length === 0 && (
        <div className="desktop-cloud-automation-field-empty">No source settings are required.</div>
      )}
    </div>
  );
}

function CloudAutomationResourcePicker({
  provider,
  cloudSession,
  apiBaseUrl,
  value,
  onCloudSessionChange,
  onChange,
  onManualFallback,
}: {
  provider: DesktopCloudAutomationProviderSpec;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  value: AutomationSourceSelection | null;
  onCloudSessionChange: SessionChangeHandler;
  onChange: (source: AutomationSourceSelection | null) => void;
  onManualFallback: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<DesktopCloudAutomationProviderResource[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listCloudAutomationProviderResources(
        cloudSession,
        provider.provider,
        { q: query },
        onCloudSessionChange,
        apiBaseUrl,
      )
        .then((result) => {
          if (cancelled) return;
          setResources(result.resources);
          setNextCursor(result.next_cursor);
          if (!query.trim() && result.resources.length === 0) {
            onManualFallback("This source does not expose browsable resources. Enter its resource details instead.");
          }
        })
        .catch((loadError) => {
          if (cancelled) return;
          if (isResourceFallbackError(loadError)) {
            onManualFallback("Resource browsing is unavailable for this source. You can still enter its resource details.");
            return;
          }
          setResources([]);
          setNextCursor(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load source resources.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiBaseUrl, cloudSession, onCloudSessionChange, onManualFallback, provider.provider, query]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await listCloudAutomationProviderResources(
        cloudSession,
        provider.provider,
        { q: query, cursor: nextCursor },
        onCloudSessionChange,
        apiBaseUrl,
      );
      setResources((current) => mergeResources(current, result.resources));
      setNextCursor(result.next_cursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more resources.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="desktop-cloud-automation-resource-picker" aria-label={`${provider.display_name} resources`}>
      <label className="desktop-cloud-automation-resource-search">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          aria-label={`Search ${provider.display_name} resources`}
          placeholder="Search connected resources"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {value && (
        <div className="desktop-cloud-automation-selected-resource">
          <span>Selected</span>
          <strong>{value.resourceName}</strong>
          <button type="button" onClick={() => onChange(null)}>Clear</button>
        </div>
      )}
      {loading ? (
        <div className="desktop-cloud-automation-resource-state" role="status">Loading resources…</div>
      ) : error ? (
        <div className="desktop-cloud-automation-resource-state error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => onManualFallback("Enter the source resource details manually.")}>Enter manually</button>
        </div>
      ) : resources.length === 0 ? (
        <div className="desktop-cloud-automation-resource-state">No matching resources.</div>
      ) : (
        <div className="desktop-cloud-automation-resource-list">
          {resources.map((resource) => {
            const selected = value?.resourceId === resource.id;
            return (
              <button
                className={selected ? "selected" : undefined}
                type="button"
                key={`${resource.type}:${resource.id}`}
                disabled={!resource.authorized}
                aria-pressed={selected}
                title={resource.authorized ? resource.name : `${resource.name} is not authorized`}
                onClick={() => onChange(automationSourceFromProviderResource(resource))}
              >
                <span>
                  <strong>{resource.name}</strong>
                  {(resource.subtitle || resource.type) && <small>{resource.subtitle || resource.type}</small>}
                </span>
                <span>{resource.authorized ? selected ? "Selected" : "Select" : "No access"}</span>
              </button>
            );
          })}
        </div>
      )}
      {nextCursor && (
        <button className="desktop-cloud-automation-link-button" type="button" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
      <button
        className="desktop-cloud-automation-link-button"
        type="button"
        onClick={() => onManualFallback("Enter the source resource details manually.")}
      >
        Enter a resource ID instead
      </button>
    </section>
  );
}

function CloudAutomationManualSourceFields({
  source,
  onChange,
}: {
  source: AutomationSourceSelection | null;
  onChange: (source: AutomationSourceSelection | null) => void;
}) {
  const update = (patch: Partial<AutomationSourceSelection>) => {
    const next = {
      resourceId: source?.resourceId ?? "",
      resourceName: source?.resourceName ?? "",
      resourceUrl: source?.resourceUrl ?? "",
      resourceType: source?.resourceType ?? "manual",
      metadata: source?.metadata ?? {},
      ...patch,
    };
    onChange(next.resourceId || next.resourceName || next.resourceUrl ? next : null);
  };
  return (
    <div className="desktop-cloud-automation-manual-source" aria-label="Manual source details">
      <label className="desktop-cloud-automation-field">
        <span>Resource ID *</span>
        <input
          value={source?.resourceId ?? ""}
          required
          placeholder="Provider resource ID"
          onChange={(event) => update({ resourceId: event.target.value })}
        />
      </label>
      <label className="desktop-cloud-automation-field">
        <span>Resource name</span>
        <input
          value={source?.resourceName ?? ""}
          placeholder="Display name"
          onChange={(event) => update({ resourceName: event.target.value })}
        />
      </label>
      <label className="desktop-cloud-automation-field">
        <span>Resource URL</span>
        <input
          value={source?.resourceUrl ?? ""}
          type="url"
          placeholder="https://…"
          onChange={(event) => update({ resourceUrl: event.target.value })}
        />
      </label>
    </div>
  );
}

export function CloudAutomationTriggerEditor({
  provider,
  draft,
  onChange,
  showNextRun = false,
}: {
  provider: DesktopCloudAutomationProviderSpec | null;
  draft: AutomationTriggerDraft;
  onChange: (draft: AutomationTriggerDraft) => void;
  showNextRun?: boolean;
}) {
  const presets = getAutomationTriggerPresets(provider);
  const validationError = getAutomationTriggerValidationError(draft);
  const nextRun = showNextRun ? formatNextAutomationRun(draft) : null;
  const timezones = useMemo(() => getAutomationTimezones(), []);
  const scheduled = ["hourly", "daily", "weekly", "custom"].includes(draft.preset);

  return (
    <section className="desktop-cloud-automation-trigger-editor" aria-label="Automation trigger settings">
      <label className="desktop-cloud-automation-field">
        <span>Trigger</span>
        <select
          aria-label="Run trigger"
          value={draft.preset}
          onChange={(event) => onChange({ ...draft, preset: event.target.value as AutomationTriggerPreset })}
        >
          {presets.map((preset) => <option key={preset} value={preset}>{formatTriggerPreset(preset)}</option>)}
        </select>
      </label>
      {(draft.preset === "daily" || draft.preset === "weekly") && (
        <label className="desktop-cloud-automation-field">
          <span>Time</span>
          <input type="time" value={draft.time} onChange={(event) => onChange({ ...draft, time: event.target.value })} />
        </label>
      )}
      {draft.preset === "weekly" && (
        <label className="desktop-cloud-automation-field">
          <span>Day</span>
          <select value={draft.weekday} onChange={(event) => onChange({ ...draft, weekday: event.target.value })}>
            {WEEKDAY_OPTIONS.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}
          </select>
        </label>
      )}
      {draft.preset === "custom" && (
        <label className="desktop-cloud-automation-field desktop-cloud-automation-custom-cron">
          <span>Cron expression</span>
          <input
            value={draft.customCron}
            aria-invalid={Boolean(validationError)}
            placeholder="0 9 * * 1-5"
            onChange={(event) => onChange({ ...draft, customCron: event.target.value })}
          />
          <small>Minute, hour, day of month, month, day of week.</small>
        </label>
      )}
      {scheduled && (
        <label className="desktop-cloud-automation-field">
          <span>Timezone</span>
          <select value={draft.timezone} onChange={(event) => onChange({ ...draft, timezone: event.target.value })}>
            {timezones.map((timezone) => <option value={timezone} key={timezone}>{timezone}</option>)}
          </select>
        </label>
      )}
      <div className="desktop-cloud-automation-trigger-summary">
        <span>{formatAutomationTriggerSummary(draft)}</span>
        {nextRun && <small>Next run: {nextRun}</small>}
      </div>
      {validationError && <div className="desktop-cloud-automation-inline-error" role="alert">{validationError}</div>}
    </section>
  );
}

export function CloudAutomationDestinationEditor({
  projectId,
  cloudSession,
  apiBaseUrl,
  targetPath,
  onCloudSessionChange,
  onChange,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  targetPath: string;
  onCloudSessionChange: SessionChangeHandler;
  onChange: (path: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const normalizedPath = normalizeAutomationTargetPath(targetPath);
  const pathError = getAutomationTargetPathValidationError(targetPath);
  return (
    <section className="desktop-cloud-automation-destination-editor">
      <label className="desktop-cloud-automation-field">
        <span>Project folder</span>
        <input
          value={targetPath}
          aria-invalid={Boolean(pathError)}
          placeholder="New or existing folder"
          onChange={(event) => onChange(event.target.value)}
        />
        <small className={pathError ? "error" : undefined}>{pathError ? pathError : `Final path: /${normalizedPath}`}</small>
      </label>
      <button
        className="desktop-cloud-automation-folder-toggle"
        type="button"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen((current) => !current)}
      >
        <Folder size={14} />
        {pickerOpen ? "Hide project folders" : "Choose from project folders"}
        {pickerOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {pickerOpen && (
        <CloudAutomationFolderBranch
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          path=""
          depth={0}
          selectedPath={normalizedPath}
          onCloudSessionChange={onCloudSessionChange}
          onSelect={onChange}
        />
      )}
    </section>
  );
}

function CloudAutomationFolderBranch({
  projectId,
  cloudSession,
  apiBaseUrl,
  path,
  depth,
  selectedPath,
  onCloudSessionChange,
  onSelect,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  path: string;
  depth: number;
  selectedPath: string;
  onCloudSessionChange: SessionChangeHandler;
  onSelect: (path: string) => void;
}) {
  const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void listCloudDirectory(cloudSession, projectId, path, onCloudSessionChange, apiBaseUrl)
      .then((tree) => {
        if (cancelled) return;
        setFolders(
          tree.entries
            .filter((entry) => entry.type === "folder")
            .map((entry) => ({ name: entry.name, path: normalizeAutomationTargetPath(entry.path) }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cloudSession, onCloudSessionChange, path, projectId]);

  if (loading) return <div className="desktop-cloud-automation-folder-state" role="status">Loading folders…</div>;
  if (error) return <div className="desktop-cloud-automation-folder-state error">Folders could not be loaded. You can still type a path.</div>;
  if (folders.length === 0) return <div className="desktop-cloud-automation-folder-state">No subfolders here.</div>;

  return (
    <div className="desktop-cloud-automation-folder-tree" style={{ "--automation-folder-depth": depth } as CSSProperties}>
      {folders.map((folder) => {
        const isExpanded = expanded.has(folder.path);
        const selected = selectedPath === folder.path;
        return (
          <div key={folder.path}>
            <div className={`desktop-cloud-automation-folder-row ${selected ? "selected" : ""}`}>
              <button
                type="button"
                title={`${isExpanded ? "Collapse" : "Expand"} ${folder.name}`}
                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${folder.name}`}
                aria-expanded={isExpanded}
                onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(folder.path)) next.delete(folder.path);
                  else next.add(folder.path);
                  return next;
                })}
              >
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button type="button" aria-pressed={selected} onClick={() => onSelect(folder.path)}>
                <Folder size={14} />
                <span>{folder.name}</span>
              </button>
            </div>
            {isExpanded && (
              <CloudAutomationFolderBranch
                projectId={projectId}
                cloudSession={cloudSession}
                apiBaseUrl={apiBaseUrl}
                path={folder.path}
                depth={depth + 1}
                selectedPath={selectedPath}
                onCloudSessionChange={onCloudSessionChange}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
    </div>
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
      <select required={field.required} value={value} onChange={(event) => onChange(event.target.value)}>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  return (
    <input
      value={value}
      required={field.required}
      type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
      placeholder={field.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function formatTriggerPreset(preset: AutomationTriggerPreset) {
  if (preset === "hourly") return "Hourly";
  if (preset === "daily") return "Daily";
  if (preset === "weekly") return "Weekly";
  if (preset === "custom") return "Custom cron";
  if (preset === "realtime") return "Realtime";
  return "Manual";
}

function isResourceFallbackError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  const message = error instanceof Error ? error.message : String(error);
  return status === 401 || status === 404 || /(?:401|404|not authorize|unknown .*provider|not supported)/i.test(message);
}

function mergeResources(
  current: DesktopCloudAutomationProviderResource[],
  next: DesktopCloudAutomationProviderResource[],
) {
  const resources = new Map(current.map((resource) => [`${resource.type}:${resource.id}`, resource]));
  for (const resource of next) resources.set(`${resource.type}:${resource.id}`, resource);
  return [...resources.values()];
}

const WEEKDAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];
