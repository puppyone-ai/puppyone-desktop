import { Bot, Copy, GitBranch, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudProjectReadiness,
  DesktopCloudRepoIdentity,
} from "../../../lib/cloudApi";
import type { RepositoryTarget } from "../repositoryTarget";
import { copyText } from "../utils";
import { CloudMainMetric, CloudMainSection } from "../components/shared";

export function CloudClaudeSection({
  readiness,
  identity,
  repositoryTarget,
  scopePath,
  loading,
  onCreateGit,
  onOpenGitSync,
  onOpenClaude,
}: {
  readiness: DesktopCloudProjectReadiness | null;
  identity: DesktopCloudRepoIdentity | null;
  repositoryTarget: RepositoryTarget | null;
  scopePath: string | null;
  loading: boolean;
  onCreateGit: () => void;
  onOpenGitSync: () => void;
  onOpenClaude: () => void;
}) {
  const { t } = useLocalization();
  if (loading || !readiness) {
    return (
      <CloudMainSection title="Claude" count={t("cloud.claude.checkingGit")}>
        <ClaudeEmpty
          title={t("cloud.claude.checkingReadiness")}
          detail={t("cloud.claude.checkingReadinessDetail")}
        />
      </CloudMainSection>
    );
  }

  if (repositoryTarget?.kind === "scope") {
    return (
      <CloudMainSection title="Claude" count={t("cloud.claude.rootCheckoutRequired")}>
        <ClaudeEmpty
          title={t("cloud.claude.scopedCheckout")}
          detail={t("cloud.claude.scopedCheckoutDetail", {
            path: bidiIsolate(scopePath || t("cloud.claude.nonRootPath")),
          })}
          action={(
            <button className="desktop-cloud-row-action" type="button" onClick={onOpenGitSync}>
              <GitBranch size={13} />
              <span>{t("cloud.auth.gitSyncDetails")}</span>
            </button>
          )}
        />
      </CloudMainSection>
    );
  }

  if (!readiness.git.surface_exists) {
    return (
      <CloudMainSection title="Claude" count={t("cloud.claude.gitNotCreated")}>
        <ClaudeEmpty
          title={t("cloud.claude.createRootGit")}
          detail={t("cloud.claude.createProjectRootGitDetail")}
          action={(
            <button className="desktop-cloud-row-action primary" type="button" onClick={onCreateGit}>
              <Plus size={13} />
              <span>{t("cloud.claude.createGit")}</span>
            </button>
          )}
        />
      </CloudMainSection>
    );
  }

  if (
    !readiness.git.head_exists
    || readiness.git.push_accepted !== true
    || !readiness.claude.ready
  ) {
    return (
      <CloudMainSection
        title="Claude"
        count={t("cloud.claude.waitingFirstPush")}
        action={identity?.url ? (
          <button className="desktop-cloud-row-action" type="button" onClick={() => void copyText(identity.url)}>
            <Copy size={13} />
            <span>{t("cloud.claude.copyRemote")}</span>
          </button>
        ) : undefined}
      >
        <ClaudeEmpty
          title={t("cloud.claude.pushFirstCommit")}
          detail={t("cloud.claude.pushFirstProjectRootCommitDetail", { branch: bidiIsolate(readiness.git.default_branch) })}
          action={(
            <button className="desktop-cloud-row-action primary" type="button" onClick={onOpenGitSync}>
              <GitBranch size={13} />
              <span>{t("cloud.claude.pushFirstAction")}</span>
            </button>
          )}
        />
      </CloudMainSection>
    );
  }

  return (
    <CloudMainSection
      title="Claude"
      count={t("cloud.status.ready")}
      action={(
        <button className="desktop-cloud-row-action primary" type="button" onClick={onOpenClaude}>
          <Bot size={13} />
          <span>{t("cloud.claude.open")}</span>
        </button>
      )}
    >
      <div className="desktop-cloud-project-overview">
        <div>
          <span>{t("cloud.claude.projectRuntime")}</span>
          <strong>{t("cloud.claude.ready")}</strong>
          <p>{t("cloud.claude.readyDetail")}</p>
        </div>
        <div className="desktop-cloud-sync-summary">
          <CloudMainMetric label={t("cloud.claude.rootGit")} value={t("cloud.status.active")} tone="ready" />
          <CloudMainMetric label={t("cloud.claude.rootHead")} value={t("cloud.status.accepted")} tone="ready" />
          <CloudMainMetric label={t("cloud.claude.firstGitPush")} value={t("cloud.status.accepted")} tone="ready" />
          <CloudMainMetric label={t("cloud.claude.defaultBranch")} value={readiness.git.default_branch} />
        </div>
      </div>
    </CloudMainSection>
  );
}

function ClaudeEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="desktop-cloud-empty-state">
      <span><Bot size={22} /></span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {action && <div className="desktop-cloud-empty-actions">{action}</div>}
      </div>
    </div>
  );
}
