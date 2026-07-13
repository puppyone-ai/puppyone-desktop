import { useMemo, useState } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopOverlayPortal } from "../../app-shell/DesktopOverlayPortal";
import { AgentComposer } from "./AgentComposer";
import { AgentChangesPill } from "./AgentChangesPill";
import { AgentPanelLayout } from "./AgentPanelLayout";
import { AgentProviderPicker } from "./AgentProviderPicker";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { createAgentProjection } from "../domain/agent-projection";
import type { AgentModel, AgentRuntimeCatalogEntry } from "../domain/agent-contract";
import "./desktop-agent.css";

const agentProviders: AgentRuntimeCatalogEntry[] = [
  provider("codex", "Codex", "codex"),
  provider("claude", "Claude Code", "claude"),
  provider("opencode-native", "OpenCode", "opencode"),
  detectedProvider("cursor", "Cursor Agent", "cursor"),
];

const modelsByProvider: Record<string, AgentModel[]> = {
  codex: [model("gpt-5.4", "GPT-5.4", true), model("gpt-5.4-mini", "GPT-5.4 Mini")],
  claude: [model("claude-sonnet-4.5", "Claude Sonnet 4.5", true), model("claude-opus-4.1", "Claude Opus 4.1")],
  "opencode-native": [model("google/gemini-3-pro", "Gemini 3 Pro", true), model("openai/gpt-5.4", "GPT-5.4")],
  cursor: [model("auto", "Auto", true), model("composer-1", "Composer 1")],
};

export function AgentVisualSmokeHarness() {
  const { t } = useLocalization();
  const [draft, setDraft] = useState("");
  const [providerId, setProviderId] = useState(agentProviders[0].descriptor.id);
  const [selectedModel, setSelectedModel] = useState(modelsByProvider[providerId][0].model);
  const startupLoading = new URLSearchParams(window.location.search).get("state") === "loading";
  const selectedProvider = agentProviders.find((entry) => entry.descriptor.id === providerId) ?? agentProviders[0];
  const models = modelsByProvider[providerId];
  const startupProjection = useMemo(() => createAgentProjection(), []);
  const projection = useMemo(() => {
    const value = createAgentProjection();
    value.sessionState = "active";
    value.messages = [
      {
        id: "user:1",
        role: "user",
        turnId: "turn-1",
        itemId: null,
        text: "好，可是现在的这个 terminal 的颜色也没有按照主题风格来。terminal 的颜色也要按照这个整体的一致的颜色去做",
        streaming: false,
        terminalState: null,
        sequence: 1,
      },
      {
        id: "assistant:1",
        role: "assistant",
        turnId: "turn-1",
        itemId: "message-1",
        text: "补充两点：\n\n- 终端与正文之间保留一条柔和的视觉分隔，与 sidebar 的处理方式一致。\n- 终端前景色和 ANSI 色板继续由主题定义，底色则使用统一的正文画布色。",
        streaming: false,
        terminalState: "completed",
        sequence: 2,
      },
      {
        id: "user:2",
        role: "user",
        turnId: "turn-2",
        itemId: null,
        text: "好，现在我需要你这个 md editor 的上下 padding 要和左右的 padding 相同",
        streaming: false,
        terminalState: null,
        sequence: 3,
      },
      {
        id: "assistant:2",
        role: "assistant",
        turnId: "turn-2",
        itemId: "message-2",
        text: "分支已切到 `codex-cloud`。先找到 MD 编辑器内容区上下与左右 padding 的定义处。",
        streaming: false,
        terminalState: "completed",
        sequence: 6,
      },
    ];
    value.activities = [
      {
        id: "activity:duration",
        turnId: "turn-2",
        itemId: "reasoning-1",
        kind: "reasoning",
        label: "Thought briefly",
        status: "completed",
        detail: { delta: "Located the theme boundary and compared terminal token ownership." },
        output: "",
        sequence: 4,
      },
      {
        id: "activity:compaction",
        turnId: "turn-2",
        itemId: "compact-1",
        kind: "tool",
        label: "Compacted context",
        status: "completed",
        detail: { tool: "compaction" },
        output: "",
        sequence: 5,
      },
      {
        id: "activity:explored",
        turnId: "turn-2",
        itemId: "tool-1",
        kind: "tool",
        label: "Explored markdown-editor.css, 2 searches",
        status: "completed",
        detail: { tool: "grep", input: { pattern: "padding", path: "src" } },
        output: "src/markdown-editor.css:42:padding: 24px;\nsrc/editor-shell.css:18:padding-inline: 24px;",
        sequence: 7,
      },
      {
        id: "activity:command",
        turnId: "turn-2",
        itemId: "tool-command",
        kind: "command",
        label: "Search owners",
        status: "completed",
        detail: { tool: "bash", input: { command: "/bin/zsh -lc \"rg -n -i liangyu dev\\ issues\"" }, metadata: { exitCode: 0, duration: 2080 } },
        output: "dev issues/ISSUE-001.md:5:Owner | liangyu*\ndev issues/ISSUE-016.md:5:Owner | liangyu*",
        sequence: 8,
      },
      {
        id: "activity:read",
        turnId: "turn-2",
        itemId: "tool-read",
        kind: "tool",
        label: "Read markdown editor styles",
        status: "completed",
        detail: { tool: "read", input: { file_path: "src/markdown-editor.css" } },
        output: ".markdown-editor {\n  padding: 24px;\n}",
        sequence: 9,
      },
      {
        id: "activity:file-change",
        turnId: "turn-2",
        itemId: "tool-edit",
        kind: "file-change",
        label: "Updated markdown-editor.css",
        status: "completed",
        detail: {
          tool: "edit",
          path: "src/markdown-editor.css",
          changes: [{ path: "src/markdown-editor.css", additions: 2704, deletions: 585 }],
          input: { patch: "@@ -10,2 +10,2 @@\n-padding: 12px 24px;\n+padding: 24px;" },
        },
        output: "",
        sequence: 10,
      },
    ];
    value.parts = [{
      id: "fixture:hidden-file-change-summary",
      turnId: "turn-2",
      itemId: "tool-2",
      kind: "file-change",
      label: "Updated files",
      status: "completed",
      detail: { changes: [{ path: "src/markdown-editor.css", additions: 2704, deletions: 585 }] },
      output: "",
      sequence: 10,
    }];
    value.turns = [
      {
        id: "turn-1",
        status: "completed",
        startedAtSequence: 1,
        startedAtMs: 0,
        completedAtSequence: 2,
        durationMs: 2_400,
        partIds: ["user:1", "assistant:1"],
      },
      {
        id: "turn-2",
        status: "completed",
        startedAtSequence: 3,
        startedAtMs: 3_000,
        completedAtSequence: 11,
        durationMs: 31_000,
        partIds: ["user:2", "assistant:2"],
      },
    ];
    value.lastSequence = 10;
    value.terminalState = "completed";
    return value;
  }, []);
  const visibleProjection = startupLoading ? startupProjection : projection;

  return (
    <>
      <main className="desktop-agent-visual-smoke dark">
        <AgentPanelLayout
          ariaLabel={t("agent.panel.chat", { agent: bidiIsolate(selectedProvider.descriptor.displayName) })}
          header={<AgentSurfaceHeader
            title={t("agent.visual.title")}
            runtimeLabel={selectedProvider.descriptor.displayName}
            statusCode="ready"
            statusLabel={t("agent.header.status.ready")}
            loading={startupLoading}
            newSessionDisabled={false}
            onNewSession={() => {}}
            agentSelector={<AgentProviderPicker
              agentProviders={agentProviders}
              selectedAgentProviderId={providerId}
              onSelectAgentProvider={(nextProviderId) => {
                setProviderId(nextProviderId);
                setSelectedModel(modelsByProvider[nextProviderId][0].model);
              }}
            />}
          />}
          conversation={<AgentTranscript projection={visibleProjection} loading={startupLoading} runtimeLabel={selectedProvider.descriptor.displayName} />}
          dock={startupLoading ? null : <>
            <AgentComposer
              floatingAccessory={<AgentChangesPill projection={visibleProjection} onViewChanges={() => {}} />}
              draft={draft}
              onDraftChange={setDraft}
              disabled={startupLoading}
              running={false}
              stopping={false}
              submitting={false}
              configurationDisabled={startupLoading}
              placeholder={t("agent.composer.placeholder.followUp")}
              runtimeLabel={selectedProvider.descriptor.displayName}
              models={models}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              commands={[]}
              onSubmit={async () => { setDraft(""); return true; }}
              onStop={() => {}}
            />
          </>}
        />
      </main>
      <DesktopOverlayPortal theme="dark"><></></DesktopOverlayPortal>
    </>
  );
}

function provider(id: string, displayName: string, iconKey: string): AgentRuntimeCatalogEntry {
  return {
    descriptor: { id, displayName, iconKey, distribution: "user-installed" },
    readiness: { runtimeId: id, provider: id, status: "ready", version: "1.0.0", minimumVersion: null, message: "Ready", selectable: true },
  };
}

function detectedProvider(id: string, displayName: string, iconKey: string): AgentRuntimeCatalogEntry {
  return {
    descriptor: { id, displayName, iconKey, distribution: "user-installed" },
    readiness: {
      runtimeId: id,
      provider: id,
      status: "protocol-unavailable",
      version: "2026.07.09-a3815c0",
      minimumVersion: null,
      message: "Cursor Agent is installed, but its native protocol is not available.",
      selectable: false,
    },
  };
}

function model(id: string, displayName: string, isDefault = false): AgentModel {
  return { id, model: id, displayName, description: "Native coding Agent model", isDefault };
}
