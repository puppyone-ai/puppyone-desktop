import { Bot, Copy, GitBranch, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type {
  DesktopCloudProjectReadiness,
  DesktopCloudRepoIdentity,
} from "../../../lib/cloudApi";
import { copyText } from "../utils";
import { CloudMainMetric, CloudMainSection } from "../components/shared";

export function CloudClaudeSection({
  readiness,
  identity,
  bindingKind,
  scopePath,
  loading,
  onCreateGit,
  onOpenGitSync,
  onOpenClaude,
}: {
  readiness: DesktopCloudProjectReadiness | null;
  identity: DesktopCloudRepoIdentity | null;
  bindingKind: "full" | "scoped" | null;
  scopePath: string | null;
  loading: boolean;
  onCreateGit: () => void;
  onOpenGitSync: () => void;
  onOpenClaude: () => void;
}) {
  if (loading || !readiness) {
    return (
      <CloudMainSection title="Claude" count="Checking Git">
        <ClaudeEmpty
          title="Checking project readiness"
          detail="Claude opens only after Cloud confirms both the canonical root Git remote and its first accepted root commit."
        />
      </CloudMainSection>
    );
  }

  if (bindingKind === "scoped") {
    return (
      <CloudMainSection title="Claude" count="Root checkout required">
        <ClaudeEmpty
          title="This is a scoped checkout"
          detail={`This workspace syncs only ${scopePath || "a non-root path"}. Scoped Git access never represents the full Project and cannot unlock Claude. Open or attach the canonical root repository first.`}
          action={(
            <button className="desktop-cloud-row-action" type="button" onClick={onOpenGitSync}>
              <GitBranch size={13} />
              <span>Git sync details</span>
            </button>
          )}
        />
      </CloudMainSection>
    );
  }

  if (!readiness.git.root_surface_exists) {
    return (
      <CloudMainSection title="Claude" count="Git not created">
        <ClaudeEmpty
          title="Create the Project’s root Git remote"
          detail="Claude stays off until an active Git surface exists on the canonical root scope. Creating a non-root access point will not satisfy this requirement."
          action={(
            <button className="desktop-cloud-row-action primary" type="button" onClick={onCreateGit}>
              <Plus size={13} />
              <span>Create Git</span>
            </button>
          )}
        />
      </CloudMainSection>
    );
  }

  if (
    !readiness.git.root_head_exists
    || readiness.git.root_git_push_accepted !== true
    || !readiness.claude.ready
  ) {
    return (
      <CloudMainSection
        title="Claude"
        count="Waiting for first push"
        action={identity?.url ? (
          <button className="desktop-cloud-row-action" type="button" onClick={() => void copyText(identity.url)}>
            <Copy size={13} />
            <span>Copy remote</span>
          </button>
        ) : undefined}
      >
        <ClaudeEmpty
          title="Push the first root commit"
          detail={`The root Git remote exists, but Cloud has not accepted the first root Git push on ${readiness.git.default_branch}. Product edits, rejected pushes, and commits on non-root scopes do not unlock Claude.`}
          action={(
            <button className="desktop-cloud-row-action primary" type="button" onClick={onOpenGitSync}>
              <GitBranch size={13} />
              <span>Push your first commit</span>
            </button>
          )}
        />
      </CloudMainSection>
    );
  }

  return (
    <CloudMainSection
      title="Claude"
      count="Ready"
      action={(
        <button className="desktop-cloud-row-action primary" type="button" onClick={onOpenClaude}>
          <Bot size={13} />
          <span>Open Claude</span>
        </button>
      )}
    >
      <div className="desktop-cloud-project-overview">
        <div>
          <span>Project runtime</span>
          <strong>Ready for Claude</strong>
          <p>Cloud has an active canonical root Git surface and an accepted root commit. Agent runtime can now be opened for this Project.</p>
        </div>
        <div className="desktop-cloud-sync-summary">
          <CloudMainMetric label="Root Git" value="Active" tone="ready" />
          <CloudMainMetric label="Root head" value="Accepted" tone="ready" />
          <CloudMainMetric label="First Git push" value="Accepted" tone="ready" />
          <CloudMainMetric label="Default branch" value={readiness.git.default_branch} />
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
