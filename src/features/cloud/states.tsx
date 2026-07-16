import { Cloud } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { getPuppyoneRemote } from "../source-control/remotes";
import {
  CloudMainMetric,
  CloudMainSection,
  CloudWebEmpty,
  CloudWebPage,
} from "./components/shared";

export { CloudProjectRecoveryState } from "./states/CloudProjectRecoveryState";

export function CloudLocalOnlyWorkspace({
  workspace,
  accountEmail,
  branchName,
  localChangeCount,
  publishLoading,
  publishPending = false,
  publishError = null,
  cloudRemote,
  onPublishWorkspace,
}: {
  workspace: Workspace;
  accountEmail: string | null;
  branchName: string;
  localChangeCount: number;
  publishLoading: boolean;
  publishPending?: boolean;
  publishError?: string | null;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  onPublishWorkspace: () => void;
}) {
  const { formatNumber, t } = useLocalization();
  const publishBusy = publishLoading || publishPending;
  const waitingForSignIn = publishPending && !accountEmail && !publishLoading;
  const publishing = publishLoading || (publishPending && Boolean(accountEmail));
  return (
    <>
      {waitingForSignIn && (
        <div className="desktop-cloud-main-alert info" role="status">
          {t("cloud.state.publishSignInPending")}
        </div>
      )}
      {publishError && (
        <div className="desktop-cloud-main-alert" role="alert">
          {publishError}
        </div>
      )}
      <CloudMainSection
        title={t("cloud.state.localWorkspace")}
        count={t(cloudRemote ? "cloud.state.remoteNotMatched" : "cloud.state.localOnly")}
        action={(
          <button
            className="desktop-cloud-row-action primary"
            type="button"
            aria-busy={publishBusy || undefined}
            disabled={publishBusy}
            onClick={onPublishWorkspace}
          >
            {t(
              publishing
                ? "cloud.state.publishing"
                : waitingForSignIn
                  ? "cloud.state.waitingForSignIn"
                  : "cloud.state.publishToCloud",
            )}
          </button>
        )}
      >
        <div className="desktop-cloud-project-overview">
          <div>
            <span>{t("cloud.state.localWorkingCopy")}</span>
            <strong title={workspace.path} dir="auto">{workspace.name}</strong>
            <p>{t("cloud.state.localOnlyDescription")}</p>
          </div>
          <div className="desktop-cloud-sync-summary">
            <CloudMainMetric
              label={t("cloud.common.account")}
              value={accountEmail ?? t("cloud.state.signInToPublish")}
              tone={accountEmail ? "ready" : undefined}
            />
            <CloudMainMetric label={t("cloud.git.branch")} value={branchName} />
            <CloudMainMetric label={t("cloud.git.localChanges")} value={formatNumber(localChangeCount)} tone={localChangeCount > 0 ? "warning" : undefined} />
          </div>
        </div>
      </CloudMainSection>
    </>
  );
}

export function CloudProjectWebSection({
  icon: Icon,
  title,
  description,
  primaryLabel,
  onOpen,
}: {
  projectId: string;
  icon: typeof Cloud;
  title: string;
  description: string;
  primaryLabel: string;
  onOpen: () => void;
}) {
  const { t } = useLocalization();
  return (
    <CloudWebPage
      title={title}
      count={t("cloud.common.web")}
      action={<button className="desktop-cloud-row-action primary" type="button" onClick={onOpen}>{primaryLabel}</button>}
    >
      <CloudWebEmpty icon={Icon} title={title} detail={description} />
    </CloudWebPage>
  );
}
