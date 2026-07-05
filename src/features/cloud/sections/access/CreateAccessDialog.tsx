import { Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { DesktopDialogCloseButton, DesktopDialogRoot, DesktopDialogSurface } from "../../../../components/DesktopDialog";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../../../lib/cloudApi";
import { scopeMatchesMcpEndpoint } from "../../utils";
import { CreateAccessFolderTree, TreeDisclosureMarker } from "./CreateAccessFolderTree";
import { CreateAccessIntentPicker } from "./CreateAccessIntentPicker";
import { CreateAccessMethodRow } from "./CreateAccessMethodRow";
import { createDesktopCloudAccess } from "./createAccessFlow";
import {
  defaultScopeName,
  formatAccessPath,
  normalizeAccessPath,
  normalizeAccessProviderKey,
  OPTIONAL_ACCESS_METHODS,
  type CreateAccessIntent,
  type OptionalAccessProvider,
} from "./createAccessModel";

export type DesktopCloudCreateAccessCreated = {
  scope: DesktopCloudScope;
  preferredRowId: string;
};

export function DesktopCloudCreateAccessDialog({
  projectId,
  cloudSession,
  apiBaseUrl,
  scopes,
  connectorsByScope,
  mcpEndpointsByScope,
  initialPath,
  onCloudSessionChange,
  onClose,
  onCreated,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  scopes: DesktopCloudScope[];
  connectorsByScope: Map<string, DesktopCloudConnector[]>;
  mcpEndpointsByScope: Map<string, DesktopCloudMcpEndpoint[]>;
  initialPath?: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onClose: () => void;
  onCreated: (created: DesktopCloudCreateAccessCreated) => Promise<void> | void;
}) {
  const normalizedInitialPath = normalizeAccessPath(initialPath ?? "");
  const initialSelectedPath = normalizedInitialPath === "" ? null : normalizedInitialPath;
  const [selectedPath, setSelectedPath] = useState<string | null>(initialSelectedPath);
  const [name, setName] = useState(initialSelectedPath ? defaultScopeName(initialSelectedPath) : "");
  const [nameTouched, setNameTouched] = useState(Boolean(initialSelectedPath));
  const [optionalProviders, setOptionalProviders] = useState<ReadonlySet<OptionalAccessProvider>>(() => new Set());
  const [intent, setIntent] = useState<CreateAccessIntent>("remote_workspace");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingPathSet = useMemo(
    () => new Set(scopes.map((scope) => normalizeAccessPath(scope.path))),
    [scopes],
  );
  const normalizedSelected = selectedPath === null ? null : normalizeAccessPath(selectedPath);
  const selectedExistingScope = useMemo(() => (
    normalizedSelected === null
      ? null
      : scopes.find((scope) => normalizeAccessPath(scope.path) === normalizedSelected) ?? null
  ), [normalizedSelected, scopes]);
  const selectedMcpEndpoints = useMemo(
    () => (selectedExistingScope ? mcpEndpointsByScope.get(selectedExistingScope.id) ?? [] : []),
    [mcpEndpointsByScope, selectedExistingScope],
  );
  const existingProviders = useMemo(() => {
    if (!selectedExistingScope) return new Set<string>();
    const providers = new Set(
      (connectorsByScope.get(selectedExistingScope.id) ?? []).map((connector) => normalizeAccessProviderKey(connector.provider)),
    );
    if (selectedMcpEndpoints.some((endpoint) => scopeMatchesMcpEndpoint(selectedExistingScope, endpoint))) {
      providers.add("mcp");
    }
    return providers;
  }, [connectorsByScope, selectedExistingScope, selectedMcpEndpoints]);
  const optionalProvidersToCreate = useMemo(
    () => Array.from(optionalProviders).filter((provider) => {
      const method = OPTIONAL_ACCESS_METHODS.find((item) => item.provider === provider);
      return method?.supported === true && !existingProviders.has(provider);
    }),
    [existingProviders, optionalProviders],
  );
  const trimmedName = name.trim();
  const canCreate = !saving
    && normalizedSelected !== null
    && normalizedSelected !== ""
    && (selectedExistingScope !== null || trimmedName.length > 0);
  const actionLabel = saving
    ? "Saving..."
    : selectedExistingScope
      ? optionalProvidersToCreate.length > 0
        ? "Update access"
        : "Open access"
      : "Create access";
  const selectedLabel = normalizedSelected === null ? "Choose a path" : formatAccessPath(normalizedSelected);

  const selectPath = (path: string) => {
    const normalized = normalizeAccessPath(path);
    if (!normalized) return;
    setSelectedPath(normalized);
    setError(null);
    if (!nameTouched) setName(defaultScopeName(normalized));
  };

  const toggleOptionalProvider = (provider: OptionalAccessProvider, checked: boolean) => {
    setOptionalProviders((current) => {
      const next = new Set(current);
      if (checked) next.add(provider);
      else next.delete(provider);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!canCreate || normalizedSelected === null) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createDesktopCloudAccess({
        projectId,
        cloudSession,
        apiBaseUrl,
        path: normalizedSelected,
        name: (trimmedName || defaultScopeName(normalizedSelected)).slice(0, 100),
        mode: "rw",
        existingScope: selectedExistingScope,
        optionalProvidersToCreate,
        intent,
        existingMcpEndpoints: selectedMcpEndpoints,
        onCloudSessionChange,
      });

      await onCreated(created);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create access. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DesktopDialogRoot
      className="desktop-cloud-create-access-backdrop"
      dismissOnBackdrop={!saving}
      onClose={saving ? undefined : onClose}
    >
      <DesktopDialogSurface className="desktop-cloud-create-access-dialog" width={760}>
        <header className="desktop-dialog-header desktop-cloud-create-access-header">
          <div className="desktop-dialog-title-row">
            <div>
              <h2>New folder access</h2>
              <p>Choose the job first, then bind it to a folder. Git Remote and Puppyone CLI are always included for the folder.</p>
            </div>
          </div>
          <DesktopDialogCloseButton disabled={saving} onClick={onClose} />
        </header>
        <div className="desktop-dialog-body desktop-cloud-create-access-body">
          <CreateAccessIntentPicker value={intent} onChange={setIntent} />
          <div className="desktop-cloud-create-access-grid">
            <CreateAccessFolderTree
              projectId={projectId}
              cloudSession={cloudSession}
              apiBaseUrl={apiBaseUrl}
              selectedPath={normalizedSelected}
              existingPathSet={existingPathSet}
              initialExpandedPath={initialSelectedPath}
              onCloudSessionChange={onCloudSessionChange}
              onSelect={selectPath}
            />

            <div className="desktop-cloud-create-access-form">
              <FieldLabel label="Access name" required>
                <input
                  className="desktop-cloud-create-access-input"
                  value={name}
                  disabled={saving}
                  placeholder={normalizedSelected === null ? "Choose a path first" : defaultScopeName(normalizedSelected)}
                  onChange={(event) => {
                    setNameTouched(true);
                    setName(event.target.value);
                  }}
                />
              </FieldLabel>

              <FieldLabel label="Path" required>
                <div
                  className={`desktop-cloud-create-access-path-box ${selectedExistingScope ? "existing" : ""} ${normalizedSelected === null ? "empty" : ""}`}
                  title={selectedLabel}
                >
                  <TreeDisclosureMarker expanded={normalizedSelected !== null} />
                  <span>{selectedLabel}</span>
                </div>
                {selectedExistingScope ? (
                  <div className="desktop-cloud-create-access-field-note">
                    This path already has access. You can add share methods or open it.
                  </div>
                ) : null}
              </FieldLabel>

              <div>
                <SectionHeading>Always included</SectionHeading>
                <div className="desktop-cloud-create-access-method-stack">
                  <CreateAccessMethodRow provider="git_remote" description="Native Git clone, pull, and push for this folder." locked />
                  <CreateAccessMethodRow provider="cli" description="Scoped FS CLI commands for this folder." locked />
                </div>
              </div>

              <div>
                <SectionHeading>Optional methods</SectionHeading>
                <div className="desktop-cloud-create-access-method-stack">
                  {OPTIONAL_ACCESS_METHODS.map((method) => (
                    <CreateAccessMethodRow
                      key={method.provider}
                      provider={method.provider}
                      description={method.description}
                      checked={method.supported && (optionalProviders.has(method.provider) || existingProviders.has(method.provider))}
                      disabled={!method.supported}
                      locked={existingProviders.has(method.provider)}
                      onCheckedChange={(checked) => toggleOptionalProvider(method.provider, checked)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="desktop-cloud-create-access-error">{error}</div> : null}
        </div>
        <footer className="desktop-dialog-footer desktop-cloud-create-access-footer">
          <button className="desktop-dialog-button" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="desktop-dialog-button primary" type="button" disabled={!canCreate} onClick={handleCreate}>
            <Plus size={14} />
            <span>{actionLabel}</span>
          </button>
        </footer>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}

function FieldLabel({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="desktop-cloud-create-access-field">
      <span className="desktop-cloud-create-access-label">
        {label}
        {required ? <i aria-hidden="true" /> : null}
      </span>
      {children}
    </label>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <div className="desktop-cloud-create-access-label">{children}</div>;
}
