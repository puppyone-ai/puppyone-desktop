import { ArrowUpRight, Cloud, Github } from "lucide-react";
import type { ReactNode } from "react";
import { useLocalization } from "@puppyone/localization";
import type { GitSidebarLayout } from "../../../preferences";
import type { GitStatusSnapshot } from "../../../types/electron";
import { openExternalUrl } from "../../../lib/localFiles";
import { SourceControlSectionHeader } from "../components";
import type {
  GitHostingIdentity,
  GitScmSyncSection,
} from "../types";
import { GitOperationButton } from "./GitSidebarPrimitives";

export function PuppyoneCloudProviderSection({
  status,
  mergeCount,
  disabled,
  operationLoading,
  primaryAction,
  onPull,
}: {
  status: GitStatusSnapshot | null;
  mergeCount: number;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onPull: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const remote = status?.sourceControl.remote ?? null;
  const cloudUpdateCount = remote?.behind ?? 0;
  const downloadBlockedByConflicts = mergeCount > 0;
  const canDownload = Boolean(remote?.canPull) && !downloadBlockedByConflicts;
  const downloadTitle = downloadBlockedByConflicts
    ? t("source-control.cloud.resolveBeforeDownload")
    : canDownload
      ? t("source-control.cloud.downloadTitle")
      : t("source-control.cloud.upToDate");

  return (
    <section className="desktop-git-cloud-provider-section">
      <SourceControlSectionHeader
        title="PuppyOne Cloud"
        count={cloudUpdateCount}
        highlightCount={cloudUpdateCount > 0}
        leadingIcon={<Cloud size={14} strokeWidth={2} />}
        action={(
          <GitOperationButton
            className="desktop-git-commit-push-action"
            title={downloadTitle}
            disabled={disabled || !canDownload}
            icon="download"
            label={t("source-control.action.download")}
            loadingKey="pull"
            loadingLabel={t("source-control.action.downloading")}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => void onPull()}
          />
        )}
      />
    </section>
  );
}

export function GitHubProviderSection({
  identity,
  section,
  layout,
  mergeCount,
  disabled,
  operationLoading,
  primaryAction,
  onPull,
}: {
  identity: GitHostingIdentity;
  section: GitScmSyncSection;
  layout: GitSidebarLayout;
  mergeCount: number;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onPull: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const pullAction = section.action?.kind === "pull" ? section.action : null;
  const pullBlockedByConflicts = mergeCount > 0;

  return (
    <section className={`desktop-git-cloud-provider-section desktop-git-github-provider-section${layout === "dividers" ? " is-divider-layout" : ""}`}>
      {layout === "dividers" && (
        <div className="desktop-git-card-divider">
          <GitHubRepositoryLink identity={identity} />
        </div>
      )}
      <GitHubChangesCard
        identity={identity}
        layout={layout}
        hasIncomingChanges={section.copy.count > 0}
        incomingLabel={section.copy.title}
        action={pullAction ? (
          <GitOperationButton
            className="desktop-git-remote-action desktop-git-github-card-action"
            disabled={disabled || pullBlockedByConflicts || pullAction.disabled}
            title={pullBlockedByConflicts
              ? t("source-control.cloud.resolveBeforeDownload")
              : pullAction.title}
            icon={pullAction.icon}
            label={t("source-control.sync.pull")}
            loadingKey={pullAction.kind}
            loadingLabel={pullAction.loadingLabel}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => void onPull()}
          />
        ) : null}
      />
    </section>
  );
}

function GitHubRepositoryLink({ identity }: { identity: GitHostingIdentity }) {
  const { t } = useLocalization();
  const { label, href } = identity;
  const repositoryName = getGitHubRepositoryName(label);
  const content = (
    <>
      <span className="desktop-git-identity-icon-slot" aria-hidden="true">
        <Github size={14} strokeWidth={2} />
      </span>
      <span>{repositoryName}</span>
      {href && <ArrowUpRight size={12} aria-hidden="true" />}
    </>
  );
  if (!href) return <div className="desktop-git-github-identity">{content}</div>;

  return (
    <a
      className="desktop-git-github-identity desktop-git-hosting-identity-link"
      href={href}
      aria-label={`${t("source-control.hosting.repository")}: ${label}`}
      onClick={(event) => {
        event.preventDefault();
        void openExternalUrl(href).catch((error) => console.warn("Unable to open GitHub repository:", error));
      }}
    >
      {content}
    </a>
  );
}

function getGitHubRepositoryName(label: string) {
  const normalized = label.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  return normalized.split("/").filter(Boolean).at(-1) || label;
}

function GitHubChangesCard({
  identity,
  layout,
  hasIncomingChanges,
  incomingLabel,
  action,
}: {
  identity: GitHostingIdentity;
  layout: GitSidebarLayout;
  hasIncomingChanges: boolean;
  incomingLabel: string;
  action: ReactNode;
}) {
  const { t } = useLocalization();

  return (
    <div
      className={`desktop-git-github-change-card${layout === "dividers" ? " is-divider-layout" : ""}${hasIncomingChanges ? "" : " is-up-to-date"}`}
    >
      {layout === "cards" && <GitHubRepositoryLink identity={identity} />}
      <span className="desktop-git-github-summary">
        {hasIncomingChanges ? incomingLabel : t("source-control.sync.upToDate")}
      </span>
      {action}
    </div>
  );
}
