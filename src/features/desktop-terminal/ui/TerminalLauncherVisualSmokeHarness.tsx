import { useState } from "react";
import { AGENT_CHAT_CREATION_RECIPES } from "../../app-shell/auxiliary-workbench/agentChatCreationRecipes";
import { TerminalLauncher } from "./TerminalLauncher";
import "./desktop-terminal.css";

export function TerminalLauncherVisualSmokeHarness() {
  const query = new URLSearchParams(window.location.search);
  const width = clamp(Number(query.get("width")) || 420, 280, 760);
  const theme = query.get("theme") === "light" ? "light" : "dark";
  const agentMode = query.get("agentMode") === "chat" ? "chat" : "terminal";
  const [selection, setSelection] = useState<string | null>(null);

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
            agentMode={agentMode}
            discoveryPhase="ready"
            availableAgentIds={["codex", "claude", "cursor", "opencode", "pi", "hermes"]}
            chatRecipes={AGENT_CHAT_CREATION_RECIPES}
            onCreateChat={(recipe) => setSelection(`chat:${recipe.id}`)}
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
