import { FilePenLine } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  agentActivityToolId,
  formatAgentActivityLabel,
  formatAgentToolName,
  diffLinesForActivity,
  fileChangesForActivity,
  pathForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentFileChangeActivity({ activity, onOpenFile }: { activity: AgentActivity; onOpenFile?: (path: string) => void }) {
  const { t } = useLocalization();
  const changes = fileChangesForActivity(activity);
  const diffLines = diffLinesForActivity(activity);
  const path = pathForActivity(activity);
  const reviewable = changes.length > 0 || diffLines.length > 0 || Boolean(path);
  if (!reviewable) return null;
  const tool = agentActivityToolId(activity);
  const title = formatAgentToolName(tool, t);
  const summary = changes.length > 1
    ? t("agent.activity.fileCount", { count: changes.length })
    : path || formatAgentActivityLabel(activity, t);
  return (
    <AgentActivityShell
      title={title}
      summary={summary}
      status={activity.status}
      icon={<FilePenLine size={13} />}
      className="desktop-agent-file-change"
    >
      {(changes.length > 0 || diffLines.length > 0) && <div className="desktop-agent-file-change-detail">
        {changes.length > 0 && (
          <ul className="desktop-agent-file-list" dir="ltr">
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
          <pre className="desktop-agent-inline-diff" aria-label={t("agent.activity.inlineDiff")} dir="ltr">
            {diffLines.map((line, index) => <span className={`desktop-agent-diff-line is-${line.kind}`} key={`${index}:${line.text}`}>{line.text || " "}</span>)}
          </pre>
        )}
      </div>}
    </AgentActivityShell>
  );
}
