import { FolderPlus, Github } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocalization } from "@puppyone/localization";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
} from "./DesktopDialog";

export type OnboardingProjectEntryKind = "create" | "clone";

export function OnboardingProjectEntryDialog({
  kind,
  onClose,
  onSubmit,
}: {
  kind: OnboardingProjectEntryKind;
  onClose: () => void;
  onSubmit: (value: string) => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = kind === "create";
  const title = t(create
    ? "onboarding.entry.create.title"
    : "onboarding.entry.clone.title");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const opened = await onSubmit(normalizedValue);
      if (opened) {
        onClose();
        return;
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
    setSubmitting(false);
  };

  return (
    <DesktopDialogRoot
      onClose={submitting ? undefined : onClose}
      dismissOnBackdrop={!submitting}
      className="onboarding-entry-dialog-root"
    >
      <form
        className="desktop-dialog-surface desktop-file-dialog onboarding-entry-dialog"
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
                : <Github size={16} strokeWidth={1.8} />}
            </span>
            <div><h2>{title}</h2></div>
          </div>
          <DesktopDialogCloseButton
            title={t("common.action.close")}
            disabled={submitting}
            onClick={onClose}
          />
        </header>

        <div className="desktop-dialog-body desktop-file-dialog-body onboarding-entry-dialog-body">
          <label className="desktop-dialog-field">
            <span>{t(create
              ? "onboarding.entry.create.nameLabel"
              : "onboarding.entry.clone.urlLabel")}</span>
            <input
              value={value}
              type="text"
              inputMode={create ? "text" : "url"}
              maxLength={create ? 120 : undefined}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              data-desktop-dialog-initial-focus="true"
              placeholder={t(create
                ? "onboarding.entry.create.namePlaceholder"
                : "onboarding.entry.clone.urlPlaceholder")}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
          </label>
          <p className="desktop-dialog-note onboarding-entry-dialog-note">
            {t("onboarding.entry.chooseLocationHint")}
          </p>
          {error && <p className="desktop-dialog-error" role="alert">{error}</p>}
        </div>

        <footer className="desktop-dialog-footer">
          <button
            className="desktop-dialog-button"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            {t("common.action.cancel")}
          </button>
          <button
            className="desktop-dialog-button primary file"
            type="submit"
            disabled={submitting || !value.trim()}
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
