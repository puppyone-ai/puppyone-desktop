import { AlertTriangle, GitBranch, RefreshCw, UserRound } from "lucide-react";
import { CloudMainSection } from "../components/shared";

export function CloudProjectRecoveryState({
  title = "Cloud project unavailable",
  message,
  remoteLabel = null,
  loading = false,
  onRetry,
  onUseAnotherAccount,
  onOpenGitDetails,
}: {
  title?: string;
  message: string;
  remoteLabel?: string | null;
  loading?: boolean;
  onRetry: () => void;
  onUseAnotherAccount: () => void;
  onOpenGitDetails: () => void;
}) {
  return (
    <CloudMainSection
      title={title}
      count={loading ? "Retrying" : "Action needed"}
      action={(
        <>
          <button className="desktop-cloud-row-action" type="button" disabled={loading} onClick={onRetry}>
            <RefreshCw size={13} className={loading ? "spin" : undefined} />
            <span>Retry</span>
          </button>
          <button className="desktop-cloud-row-action" type="button" onClick={onUseAnotherAccount}>
            <UserRound size={13} />
            <span>Use another account</span>
          </button>
          <button className="desktop-cloud-row-action" type="button" onClick={onOpenGitDetails}>
            <GitBranch size={13} />
            <span>Git sync details</span>
          </button>
        </>
      )}
    >
      <div className="desktop-cloud-empty-state">
        <span><AlertTriangle size={22} /></span>
        <div>
          <strong>{title}</strong>
          <p>
            {message}
            {remoteLabel ? ` Remote: ${remoteLabel}.` : ""}
            {" "}
            This folder stays connected to its PuppyOne Cloud Git remote; Connectors, MCP, and CLI remain under Access after the project is available again.
          </p>
        </div>
      </div>
    </CloudMainSection>
  );
}
