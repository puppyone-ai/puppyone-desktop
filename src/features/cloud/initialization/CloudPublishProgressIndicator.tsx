import type { MessageFormatter } from "@puppyone/localization/core";
import type { CloudPublishProgressStage } from "../../../types/electron";

const CLOUD_PUBLISH_PROGRESS_STEPS = [
  "project",
  "access",
  "remote",
  "upload",
  "finish",
] as const;

export function CloudPublishProgressIndicator({
  stage,
  t,
}: {
  stage: CloudPublishProgressStage;
  t: MessageFormatter;
}) {
  const activeIndex = getCloudPublishProgressStepIndex(stage);
  const completed = stage === "completed";
  return (
    <div className="desktop-cloud-publish-progress" data-stage={stage}>
      <div
        className="desktop-cloud-publish-progress-current"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="desktop-cloud-publish-progress-pulse" aria-hidden="true" />
        <strong>{getCloudPublishProgressLabel(stage, t)}</strong>
      </div>
      <ol aria-label={t("cloud.initialize.progress.stepsLabel")}>
        {CLOUD_PUBLISH_PROGRESS_STEPS.map((step, index) => {
          const isDone = completed || index < activeIndex;
          const isCurrent = !completed && index === activeIndex;
          return (
            <li
              className={isDone ? "done" : isCurrent ? "current" : undefined}
              aria-current={isCurrent ? "step" : undefined}
              key={step}
            >
              <span className="desktop-cloud-publish-progress-marker" aria-hidden="true" />
              <span>{t(`cloud.initialize.progress.step.${step}`)}</span>
            </li>
          );
        })}
      </ol>
      <p>{t("cloud.initialize.progress.keepOpen")}</p>
    </div>
  );
}

export function getCloudPublishProgressLabel(
  stage: CloudPublishProgressStage,
  t: MessageFormatter,
): string {
  return t(`cloud.initialize.progress.${stage}`);
}

function getCloudPublishProgressStepIndex(stage: CloudPublishProgressStage): number {
  if (
    stage === "enabling-version-control"
    || stage === "creating-snapshot"
    || stage === "creating-branch"
    || stage === "validating"
    || stage === "creating-project"
  ) return 0;
  if (stage === "securing-credential") return 1;
  if (stage === "configuring-remote" || stage === "checking-remote") return 2;
  if (stage === "uploading" || stage === "confirming") return 3;
  return 4;
}
