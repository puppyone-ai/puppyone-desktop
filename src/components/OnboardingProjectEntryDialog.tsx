import { CircleCheck, FolderPlus, GitFork, Github, Gitlab, ScanSearch } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocalization } from "@puppyone/localization";
import type { WorkspaceProjectLocationGrant } from "../types/electron";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
} from "./DesktopDialog";

export type OnboardingProjectEntryKind = "create" | "clone";

type RepositorySource = "github" | "gitlab";

function detectRepositorySource(value: string): RepositorySource | null {
  const repositoryUrl = value.trim().toLowerCase();
  if (!repositoryUrl) return null;
  if (/^(?:(?:https?|ssh|git):\/\/(?:git@)?|git@)?github\.com[/:]/.test(repositoryUrl)) {
    return "github";
  }
  if (/^(?:(?:https?|ssh|git):\/\/(?:git@)?|git@)?gitlab\.com[/:]/.test(repositoryUrl)) {
    return "gitlab";
  }
  return null;
}

export function OnboardingProjectEntryDialog({
  kind,
  onClose,
  onChooseLocation,
  onSubmit,
}: {
  kind: OnboardingProjectEntryKind;
  onClose: () => void;
  onChooseLocation?: () => Promise<WorkspaceProjectLocationGrant | null>;
  onSubmit: (value: string, locationGrantId: string | null) => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [choosingLocation, setChoosingLocation] = useState(false);
  const [location, setLocation] = useState<WorkspaceProjectLocationGrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = kind === "create";
  const repositorySource = create ? null : detectRepositorySource(value);
  const busy = submitting || choosingLocation;
  const title = t(create
    ? "onboarding.entry.create.title"
    : "onboarding.entry.clone.title");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue || busy || (create && !location) || (!create && !repositorySource)) return;
    setError(null);
    setSubmitting(true);
    try {
      const opened = await onSubmit(normalizedValue, location?.grantId ?? null);
      if (opened) {
        onClose();
        return;
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
    setSubmitting(false);
  };

  const chooseLocation = async () => {
    if (!onChooseLocation || busy) return;
    setError(null);
    setChoosingLocation(true);
    try {
      const nextLocation = await onChooseLocation();
      if (nextLocation) setLocation(nextLocation);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setChoosingLocation(false);
    }
  };

  return (
    <DesktopDialogRoot
      onClose={busy ? undefined : onClose}
      dismissOnBackdrop={!busy}
      className="onboarding-entry-dialog-root"
    >
      <form
        className={`desktop-dialog-surface desktop-file-dialog onboarding-entry-dialog ${create ? "is-create" : "is-import"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className={`desktop-dialog-leading ${create ? "file" : "repository"}`} aria-hidden="true">
              {create
                ? <FolderPlus size={16} strokeWidth={1.8} />
                : <GitFork size={16} strokeWidth={1.8} />}
            </span>
            <h2>{title}</h2>
          </div>
          <DesktopDialogCloseButton
            title={t("common.action.close")}
            disabled={busy}
            onClick={onClose}
          />
        </header>

        <div className="desktop-dialog-body desktop-file-dialog-body onboarding-entry-dialog-body">
          {create ? (
            <div className="onboarding-entry-create-fields">
              <label className="onboarding-entry-create-row">
                <span className="onboarding-entry-create-label">
                  {t("onboarding.entry.create.nameLabel")}
                </span>
                <input
                  className="onboarding-entry-create-input"
                  value={value}
                  type="text"
                  inputMode="text"
                  maxLength={120}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  data-desktop-dialog-initial-focus="true"
                  placeholder={t("onboarding.entry.create.namePlaceholder")}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              <div className="onboarding-entry-create-row">
                <span className="onboarding-entry-create-label">
                  {t("onboarding.entry.create.locationLabel")}
                </span>
                <div className="onboarding-entry-location-controls">
                  {location && (
                    <bdi
                      className="onboarding-entry-location-path"
                      dir="ltr"
                      title={location.path}
                      aria-live="polite"
                    >
                      {location.path}
                    </bdi>
                  )}
                  <button
                    className="desktop-dialog-button onboarding-entry-browse-button"
                    type="button"
                    disabled={busy || !onChooseLocation}
                    onClick={() => void chooseLocation()}
                  >
                    {t(choosingLocation
                      ? "onboarding.entry.create.browsing"
                      : "onboarding.entry.create.browse")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="onboarding-clone-layout">
              <section
                className="onboarding-clone-sources"
                aria-label={t("onboarding.entry.clone.sourceLabel")}
              >
                <div className="onboarding-clone-section-label">
                  {t("onboarding.entry.clone.sourceLabel")}
                </div>
                <div className="onboarding-clone-provider-list">
                  <div
                    className={`onboarding-clone-provider is-github ${repositorySource === "github" ? "is-detected" : ""}`}
                    data-repository-source="github"
                  >
                    <Github aria-hidden="true" />
                    <span>{t("onboarding.entry.clone.provider.github")}</span>
                  </div>
                  <div
                    className={`onboarding-clone-provider is-gitlab ${repositorySource === "gitlab" ? "is-detected" : ""}`}
                    data-repository-source="gitlab"
                  >
                    <Gitlab aria-hidden="true" />
                    <span>{t("onboarding.entry.clone.provider.gitlab")}</span>
                  </div>
                </div>
              </section>

              <div className="onboarding-clone-workflow">
                <label className="desktop-dialog-field onboarding-clone-url-field">
                  <span>{t("onboarding.entry.clone.urlLabel")}</span>
                  <input
                    value={value}
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    data-desktop-dialog-initial-focus="true"
                    placeholder={t("onboarding.entry.clone.urlPlaceholder")}
                    onChange={(event) => {
                      setValue(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <p className="desktop-dialog-note onboarding-entry-dialog-note onboarding-clone-supported-hint">
                  {t("onboarding.entry.clone.supportedHint")}
                </p>
                <div
                  className={`onboarding-clone-source-status ${repositorySource ? "is-detected" : value.trim() ? "is-unsupported" : ""}`}
                  aria-live="polite"
                >
                  {repositorySource
                    ? <CircleCheck aria-hidden="true" />
                    : <ScanSearch aria-hidden="true" />}
                  <span>
                    {t(repositorySource === "github"
                      ? "onboarding.entry.clone.sourceGithubDetected"
                      : repositorySource === "gitlab"
                        ? "onboarding.entry.clone.sourceGitlabDetected"
                        : value.trim()
                          ? "onboarding.entry.clone.sourceUnsupported"
                          : "onboarding.entry.clone.sourceAuto")}
                  </span>
                </div>
              </div>
            </div>
          )}
          {error && <p className="desktop-dialog-error" role="alert">{error}</p>}
        </div>

        <footer className="desktop-dialog-footer">
          <button
            className="desktop-dialog-button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t("common.action.cancel")}
          </button>
          <button
            className="desktop-dialog-button primary file"
            type="submit"
            disabled={busy || !value.trim() || (create && !location) || (!create && !repositorySource)}
          >
            {t(submitting
              ? create
                ? "onboarding.entry.create.submitting"
                : "onboarding.entry.clone.submitting"
              : create
                ? "onboarding.entry.create.submit"
                : "onboarding.entry.clone.submit")}
          </button>
        </footer>
      </form>
    </DesktopDialogRoot>
  );
}
