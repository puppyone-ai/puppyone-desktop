import { GitBranch, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { CloudPublishReadiness } from "../workspace/cloudPublishReadiness";

export function CloudGitPrerequisite({
  readiness,
  onOpenSourceControl,
  onRefresh,
}: {
  readiness: Exclude<CloudPublishReadiness, "ready">;
  onOpenSourceControl?: () => void;
  onRefresh?: () => void;
}) {
  const { t } = useLocalization();
  const title = readiness === "repository-required"
    ? t("cloud.initialize.repositorySetupTitle")
    : readiness === "commit-required"
      ? t("cloud.initialize.commitSetupTitle")
      : t("cloud.initialize.branchSetupTitle");
  const description = readiness === "repository-required"
    ? t("cloud.initialize.repositorySetupDescription")
    : readiness === "commit-required"
      ? t("cloud.initialize.commitSetupDescription")
      : t("cloud.initialize.branchSetupDescription");
  const steps: Array<{
    id: string;
    label: string;
    state: "complete" | "current" | "upcoming";
  }> = readiness === "repository-required"
    ? [
        { id: "repository", label: t("cloud.initialize.stepVersionControl"), state: "current" },
        { id: "commit", label: t("cloud.initialize.stepFirstCommit"), state: "upcoming" },
        { id: "publish", label: t("cloud.initialize.stepPublish"), state: "upcoming" },
      ]
    : readiness === "commit-required"
      ? [
          { id: "repository", label: t("cloud.initialize.stepVersionControl"), state: "complete" },
          { id: "commit", label: t("cloud.initialize.stepFirstCommit"), state: "current" },
          { id: "publish", label: t("cloud.initialize.stepPublish"), state: "upcoming" },
        ]
      : [
          { id: "repository", label: t("cloud.initialize.stepVersionControl"), state: "complete" },
          { id: "commit", label: t("cloud.initialize.stepFirstCommit"), state: "complete" },
          { id: "branch", label: t("cloud.initialize.stepBranch"), state: "current" },
        ];

  return (
    <div className="desktop-cloud-publish-container">
      <section
        className="desktop-cloud-git-prerequisite"
        aria-labelledby="desktop-cloud-git-prerequisite-title"
      >
        <div className="desktop-cloud-git-prerequisite-mark" aria-hidden="true">
          <GitBranch size={38} strokeWidth={1.45} />
        </div>
        <header className="desktop-cloud-git-prerequisite-header">
          <h1 id="desktop-cloud-git-prerequisite-title">{title}</h1>
          <p>{description}</p>
        </header>
        <ol
          className="desktop-cloud-git-prerequisite-steps"
          aria-label={t("cloud.initialize.prerequisiteStepsLabel")}
        >
          {steps.map((step, index) => (
            <li className={step.state} key={step.id} aria-current={step.state === "current" ? "step" : undefined}>
              <span className="desktop-cloud-git-prerequisite-step-marker" aria-hidden="true">
                {index + 1}
              </span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
        <div className="desktop-cloud-publish-actions desktop-cloud-git-prerequisite-actions">
          {onOpenSourceControl && (
            <button
              className="desktop-cloud-row-action primary desktop-cloud-publish-primary"
              type="button"
              onClick={onOpenSourceControl}
            >
              {t("cloud.initialize.openSourceControl")}
            </button>
          )}
          {onRefresh && (
            <button className="desktop-cloud-row-action" type="button" onClick={onRefresh}>
              <RefreshCw size={13} aria-hidden="true" />
              <span>{t("cloud.initialize.checkAgain")}</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
