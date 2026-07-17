import { FileSearch, FolderSearch, ListTree, Search } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  agentActivitySummary,
  agentActivityToolId,
  formatAgentActivityLabel,
  formatAgentToolName,
  outputForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

const MAX_VISIBLE_RESULT_LINES = 80;

export function AgentFileQueryActivity({ activity, onOpenFile }: { activity: AgentActivity; onOpenFile?: (path: string) => void }) {
  const { t } = useLocalization();
  const tool = agentActivityToolId(activity);
  const output = outputForActivity(activity);
  const lines = output ? output.split(/\r?\n/u).filter((line) => line.trim()).slice(0, 1_000) : [];
  const searchable = ["grep", "glob", "search", "list"].includes(tool);
  return (
    <AgentActivityShell
      title={formatAgentToolName(tool, t)}
      summary={agentActivitySummary(activity) || formatAgentActivityLabel(activity, t)}
      status={activity.status}
      icon={iconFor(tool)}
      className={`desktop-agent-file-query is-${tool}`}
    >
      {output && (searchable
        ? <SearchResults lines={lines} onOpenFile={onOpenFile} />
        : <pre className="desktop-agent-tool-output" dir="ltr">{output}</pre>)}
    </AgentActivityShell>
  );
}

function SearchResults({ lines, onOpenFile }: { lines: string[]; onOpenFile?: (path: string) => void }) {
  const { t, formatNumber } = useLocalization();
  const visible = lines.slice(0, MAX_VISIBLE_RESULT_LINES);
  return (
    <div className="desktop-agent-search-results" dir="ltr">
      {visible.length === 0 && <span className="desktop-agent-tool-empty">{t("agent.activity.noResults")}</span>}
      {visible.map((line, index) => {
        const path = resultPath(line);
        return path && onOpenFile
          ? <button type="button" key={`${index}:${line}`} title={line} onClick={() => onOpenFile(path)}>{line}</button>
          : <span key={`${index}:${line}`} title={line}>{line}</span>;
      })}
      {lines.length > visible.length && <small>{t("agent.activity.moreResults", { count: lines.length - visible.length, value: formatNumber(lines.length - visible.length) })}</small>}
    </div>
  );
}

function resultPath(line: string) {
  const numbered = line.match(/^(.+?):\d+(?::\d+)?:/u)?.[1];
  if (numbered) return numbered;
  const plain = line.trim();
  return plain && !plain.includes("\0") && !/^https?:\/\//iu.test(plain) ? plain : "";
}

function iconFor(tool: string) {
  if (tool === "read") return <FileSearch size={13} />;
  if (tool === "grep" || tool === "search") return <Search size={13} />;
  if (tool === "list") return <ListTree size={13} />;
  return <FolderSearch size={13} />;
}
