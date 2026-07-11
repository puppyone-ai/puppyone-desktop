import { Check, Copy, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import {
  agentActivitySummary,
  commandForActivity,
  commandMetadata,
  outputForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentCommandActivity({ activity, onOpenTerminal }: { activity: AgentActivity; onOpenTerminal?: () => void }) {
  const command = commandForActivity(activity);
  const output = outputForActivity(activity);
  const metadata = commandMetadata(activity);
  const meta = [metadata.exitCode === null ? null : `Exit ${metadata.exitCode}`, metadata.duration].filter(Boolean).join(" · ");
  return (
    <AgentActivityShell
      title="Bash"
      summary={command || agentActivitySummary(activity)}
      meta={activity.status === "completed" ? meta || null : null}
      status={activity.status}
      icon={<TerminalSquare size={13} />}
      className="desktop-agent-command"
      actions={(command || output || onOpenTerminal) && <CommandActions value={output || command} onOpenTerminal={onOpenTerminal} />}
    >
      {(command || output || meta) && <div className="desktop-agent-command-surface">
        {command && <div className="desktop-agent-command-line"><span>$</span><code>{command}</code></div>}
        {output && <pre className="desktop-agent-command-output">{output}</pre>}
        {meta && <div className="desktop-agent-command-meta">{meta}</div>}
      </div>}
    </AgentActivityShell>
  );
}

function CommandActions({ value, onOpenTerminal }: { value: string; onOpenTerminal?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    if (!value || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is optional in hardened renderer contexts.
    }
  };
  return <>
    {value && <button type="button" className="desktop-agent-tool-action" aria-label={copied ? "Command output copied" : "Copy command output"} onClick={() => void copy()}>{copied ? <Check size={12} /> : <Copy size={12} />}<span className="desktop-agent-visually-hidden">{copied ? "Copied" : "Copy"}</span></button>}
    {onOpenTerminal && <button type="button" className="desktop-agent-tool-action" aria-label="Open command in terminal" onClick={onOpenTerminal}>Open terminal</button>}
  </>;
}
