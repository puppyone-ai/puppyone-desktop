import { Button } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import { FilePlus2, FolderOpen, GitFork } from "lucide-react";
import { InlineLoading } from "../loading";
import type { OnboardingHomeState } from "./types";

type OnboardingEntryActionsProps = {
  state: OnboardingHomeState;
  busy: boolean;
  openingFolder: boolean;
  draggingFolder: boolean;
  canCreateProject: boolean;
  canCloneRepository: boolean;
  onOpenFolder: () => void;
  onCreateProject: () => void;
  onCloneRepository: () => void;
};

export function OnboardingEntryActions({
  state,
  busy,
  openingFolder,
  draggingFolder,
  canCreateProject,
  canCloneRepository,
  onOpenFolder,
  onCreateProject,
  onCloneRepository,
}: OnboardingEntryActionsProps) {
  const { t } = useLocalization();
  const firstRun = state === "empty";

  return (
    <div className="onboarding-primary-area">
      <div className="onboarding-entry-actions" role="group" aria-label={t("onboarding.projects.title")}>
        <div className="onboarding-entry-action-primary">
          <Button
            className={`onboarding-entry-action ${firstRun ? "onboarding-entry-action-cta" : ""} ${draggingFolder ? "is-dragging" : ""}`}
            data-onboarding-action="open"
            tone={firstRun ? "primary" : "neutral"}
            disabled={busy}
            aria-busy={openingFolder || undefined}
            leadingIcon={openingFolder
              ? <InlineLoading label={null} size="sm" tone="neutral" />
              : <FolderOpen aria-hidden="true" />}
            onClick={onOpenFolder}
          >
            {t(firstRun
              ? "onboarding.action.startWithLocalFolder"
              : "onboarding.action.openFolder")}
          </Button>
        </div>

        <div className="onboarding-entry-action-secondary">
          <Button
            className="onboarding-entry-action"
            data-onboarding-action="create"
            tone="neutral"
            disabled={busy || !canCreateProject}
            leadingIcon={<FilePlus2 className="onboarding-entry-create-icon" aria-hidden="true" />}
            onClick={onCreateProject}
          >
            {t("onboarding.action.createLocalProject")}
          </Button>

          <Button
            className="onboarding-entry-action"
            data-onboarding-action="clone"
            tone="neutral"
            disabled={busy || !canCloneRepository}
            leadingIcon={<GitFork aria-hidden="true" />}
            onClick={onCloneRepository}
          >
            {t("onboarding.action.cloneRepository")}
          </Button>
        </div>
      </div>
    </div>
  );
}
