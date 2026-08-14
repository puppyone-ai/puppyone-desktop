import { useState } from "react";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import { TerminalLauncher } from "./TerminalLauncher";
import "./desktop-terminal.css";

export function TerminalLauncherVisualSmokeHarness() {
  const query = new URLSearchParams(window.location.search);
  const width = clamp(Number(query.get("width")) || 420, 280, 760);
  const theme = query.get("theme") === "light" ? "light" : "dark";
  const [selection, setSelection] = useState<DesktopTerminalLauncherId | null>(null);

  return (
    <main
      className={`desktop-terminal-launcher-smoke ${theme === "dark" ? "dark" : ""}`}
      data-smoke-theme={theme}
    >
      <section
        className="desktop-terminal-launcher-smoke-panel desktop-terminal-panel"
        style={{ width }}
      >
        <div className="desktop-terminal-body is-empty">
          <TerminalLauncher
            discoveryPhase="ready"
            availableAgentIds={["codex", "claude", "cursor", "opencode", "pi", "hermes"]}
            onLaunch={setSelection}
            onRefresh={() => undefined}
          />
        </div>
      </section>
      <output className="desktop-terminal-launcher-smoke-output">
        {selection ?? "idle"}
      </output>
    </main>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
