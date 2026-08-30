import type { Workspace } from "@puppyone/shared-ui";
import { RightTerminalPanel } from "./RightTerminalPanel";

/** Production Terminal surface used only by the real Electron P0 smoke. */
export function TerminalP0SmokeHarness() {
  const workspacePath = new URLSearchParams(window.location.search).get("workspacePath");
  if (!workspacePath) throw new Error("Terminal P0 smoke requires workspacePath.");
  const workspace: Workspace = {
    id: workspacePath,
    name: "Terminal P0 Smoke",
    path: workspacePath,
    status: "recording",
  };

  return (
    <main
      className="desktop-terminal-split-smoke"
      data-terminal-p0-smoke-ready="true"
    >
      <section className="desktop-terminal-split-smoke-panel">
        <RightTerminalPanel
          active
          hiddenAgentIds={[]}
          workspace={workspace}
        />
      </section>
    </main>
  );
}
