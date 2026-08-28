import { FolderOpen, FolderPlus, GitFork } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocalization } from "@puppyone/localization";
import type { WorkspaceProjectLocationGrant } from "../types/electron";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
} from "./DesktopDialog";

export type OnboardingProjectEntryKind = "create" | "clone";

type RepositorySource = "github" | "gitlab";

const REPOSITORY_PROVIDER_MARKS = {
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  gitlab: "m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z",
} as const;

function RepositoryProviderMark({ provider }: { provider: RepositorySource }) {
  return (
    <svg
      className={`is-${provider}`}
      data-repository-provider={provider}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
    >
      <path d={REPOSITORY_PROVIDER_MARKS[provider]} />
    </svg>
  );
}

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
              <label className="onboarding-entry-create-field">
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
              <div className="onboarding-entry-create-field">
                <span className="onboarding-entry-create-label">
                  {t("onboarding.entry.create.locationLabel")}
                </span>
                <button
                  className="onboarding-entry-location-picker onboarding-entry-browse-button"
                  type="button"
                  disabled={busy || !onChooseLocation}
                  aria-label={t("onboarding.entry.create.locationLabel")}
                  onClick={() => void chooseLocation()}
                >
                  <FolderOpen aria-hidden="true" />
                  <bdi
                    className={`onboarding-entry-location-path ${location ? "is-selected" : ""}`}
                    dir="ltr"
                    title={location?.path}
                    aria-live="polite"
                  >
                    {location?.path ?? t("onboarding.entry.create.locationPlaceholder")}
                  </bdi>
                  <span className="onboarding-entry-location-action">
                    {t(choosingLocation
                      ? "onboarding.entry.create.browsing"
                      : "onboarding.entry.create.browse")}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="onboarding-clone-workflow">
              <label className="desktop-dialog-field onboarding-clone-url-field">
                <span className="onboarding-clone-url-label-row">
                  <span>{t("onboarding.entry.clone.urlLabel")}</span>
                  <span className="onboarding-clone-provider-marks" aria-hidden="true">
                    <RepositoryProviderMark provider="github" />
                    <RepositoryProviderMark provider="gitlab" />
                  </span>
                </span>
                <input
                  value={value}
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  aria-invalid={value.trim() && !repositorySource ? "true" : undefined}
                  data-desktop-dialog-initial-focus="true"
                  placeholder={t("onboarding.entry.clone.urlPlaceholder")}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                />
              </label>
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
