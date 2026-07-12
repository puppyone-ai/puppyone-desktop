import { FilePenLine } from "lucide-react";
import {
  agentActivityToolName,
  diffLinesForActivity,
  fileChangesForActivity,
  pathForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentFileChangeActivity({ activity, onViewChanges, onOpenFile }: { activity: AgentActivity; onViewChanges?: () => void; onOpenFile?: (path: string) => void }) {
  const changes = fileChangesForActivity(activity);
  const diffLines = diffLinesForActivity(activity);
  const additions = changes.reduce((sum, change) => sum + change.additions, 0);
  const deletions = changes.reduce((sum, change) => sum + change.deletions, 0);
  const path = pathForActivity(activity);
  const stats = additions || deletions ? `+${additions} −${deletions}` : null;
  const reviewable = changes.length > 0 || diffLines.length > 0 || Boolean(path);
  if (!reviewable) return null;
  const defaultTitle = agentActivityToolName(activity);
  const title = defaultTitle === "File Change"
    ? changes.length > 1 ? "File changes" : "Edited"
    : defaultTitle;
  const summary = changes.length > 1 ? `${changes.length} files` : path || activity.label;
  return (
    <AgentActivityShell
      title={title}
      summary={summary}
      meta={stats}
      status={activity.status}
      icon={<FilePenLine size={13} />}
      className="desktop-agent-file-change"
      actions={<>
        {onOpenFile && path && <button type="button" className="desktop-agent-tool-action" aria-label={`Open ${path}`} onClick={() => onOpenFile(path)}>Open file</button>}
        {onViewChanges && reviewable && <button type="button" className="desktop-agent-tool-action" aria-label="Review file changes" onClick={onViewChanges}>Review</button>}
      </>}
    >
      {(changes.length > 0 || diffLines.length > 0) && <div className="desktop-agent-file-change-detail">
        {changes.length > 0 && (
          <ul className="desktop-agent-file-list">
            {changes.map((change) => (
              <li key={change.path}>
                {onOpenFile
                  ? <button type="button" title={change.path} onClick={() => onOpenFile(change.path)}>{change.path}</button>
                  : <span>{change.path}</span>}
                <small><b>+{change.additions}</b><i>−{change.deletions}</i></small>
              </li>
            ))}
          </ul>
        )}
        {diffLines.length > 0 && (
          <pre className="desktop-agent-inline-diff" aria-label="Inline file diff">
            {diffLines.map((line, index) => <span className={`desktop-agent-diff-line is-${line.kind}`} key={`${index}:${line.text}`}>{line.text || " "}</span>)}
          </pre>
        )}
      </div>}
    </AgentActivityShell>
  );
}
