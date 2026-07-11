import { useMemo, useState } from "react";
import { AgentComposer } from "./AgentComposer";
import { AgentChangesPill } from "./AgentChangesPill";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { createAgentProjection } from "../domain/agent-projection";
import "./desktop-agent.css";

const models = [
  { id: "cursor/fable-5-extra-high", model: "cursor/fable-5-extra-high", displayName: "Fable 5 Extra High", description: "Reference-width coding model", isDefault: true, providerId: "cursor" },
  { id: "openai/gpt-5.5", model: "openai/gpt-5.5", displayName: "GPT-5.5", description: "OpenAI coding model", isDefault: false, providerId: "openai" },
];

const modes = [
  { id: "build", displayName: "Agent", description: "Plan and make changes", isDefault: true },
  { id: "plan", displayName: "Plan", description: "Read and plan only", isDefault: false },
];

export function AgentVisualSmokeHarness() {
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(models[0].model);
  const [mode, setMode] = useState(modes[0].id);
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
        sequence: 5,
      },
    ];
    value.activities = [
      {
        id: "activity:duration",
        turnId: "turn-2",
        itemId: "reasoning-1",
        kind: "reasoning",
        label: "Worked for 2s",
        status: "completed",
        detail: {},
        output: "",
        sequence: 4,
      },
      {
        id: "activity:explored",
        turnId: "turn-2",
        itemId: "tool-1",
        kind: "tool",
        label: "Explored markdown-editor.css, 2 searches",
        status: "completed",
        detail: {},
        output: "",
        sequence: 6,
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
      sequence: 7,
    }];
    value.lastSequence = 7;
    value.terminalState = "completed";
    return value;
  }, []);

  return (
    <main className="desktop-agent-visual-smoke dark">
      <section className="desktop-agent-panel" aria-label="Agent visual smoke">
        <AgentSurfaceHeader
          title="Agent architecture"
          runtimeLabel="OpenCode"
          statusLabel="ready"
          loading={false}
          newSessionDisabled={false}
          onNewSession={() => {}}
          history={[]}
        />
        <AgentTranscript projection={projection} loading={false} runtimeLabel="OpenCode" />
        <AgentChangesPill projection={projection} onViewChanges={() => {}} />
        <AgentComposer
          draft={draft}
          onDraftChange={setDraft}
          disabled={false}
          running={false}
          stopping={false}
          submitting={false}
          placeholder="Send follow-up"
          runtimeLabel="OpenCode"
          models={models}
          selectedModel={model}
          onSelectModel={setModel}
          modes={modes}
          selectedMode={mode}
          onSelectMode={setMode}
          commands={[]}
          attachmentAvailable
          contextAvailable
          onSubmit={async () => true}
          onStop={() => {}}
        />
      </section>
    </main>
  );
}
