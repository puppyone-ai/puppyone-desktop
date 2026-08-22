import { FolderPlus, GitFork } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocalization } from "@puppyone/localization";
import type { WorkspaceProjectLocationGrant } from "../types/electron";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
} from "./DesktopDialog";

export type OnboardingProjectEntryKind = "create" | "clone";

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
  const busy = submitting || choosingLocation;
  const title = t(create
    ? "onboarding.entry.create.title"
    : "onboarding.entry.clone.title");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue || busy || (create && !location)) return;
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
            <span className="desktop-dialog-leading file" aria-hidden="true">
              {create
                ? <FolderPlus size={16} strokeWidth={1.8} />
                : <GitFork size={16} strokeWidth={1.8} />}
            </span>
            <div><h2>{title}</h2></div>
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
            <>
              <label className="desktop-dialog-field">
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
              <p className="desktop-dialog-note onboarding-entry-dialog-note">
                {t("onboarding.entry.chooseLocationHint")}
              </p>
            </>
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
            disabled={busy || !value.trim() || (create && !location)}
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
