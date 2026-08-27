import { useEffect, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  deleteCloudScope,
  updateCloudScope,
  type DesktopCloudRepositoryView,
  type DesktopCloudSession,
} from "../../../../lib/cloudApi";
import { CloudSectionLabel } from "../../components/shared";
import {
  cloudMessage,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../../cloudPresentation";
import { getScopeDisplayName } from "../../utils";

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
  const dirty = !isProjectRoot && (
    name.trim() !== scope.name
    || mode !== scope.max_mode
    || !sameStringArray(parsedExclude, scope.exclude)
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
      <CloudSectionLabel right={dirty ? <span>{t("cloud.common.unsaved")}</span> : undefined}>
        {t("cloud.common.settings")}
      </CloudSectionLabel>

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

        {!isProjectRoot && (
          <div className="desktop-cloud-scope-settings-card danger wide">
            <div className="desktop-cloud-scope-settings-field">
              <span>{t("cloud.common.dangerZone")}</span>
              <p>{t("cloud.scope.deleteHelp")}</p>
            </div>
            <button type="button" disabled={busy} onClick={handleDelete}>
              {t(deleting ? "cloud.common.deleting" : confirmDelete ? "cloud.common.confirmDelete" : "cloud.scope.deleteAccess")}
            </button>
          </div>
        )}
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
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
