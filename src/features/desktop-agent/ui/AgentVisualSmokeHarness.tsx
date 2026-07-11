import { useMemo, useState } from "react";
import { AgentComposer } from "./AgentComposer";
import { AgentSurfaceHeader } from "./AgentSurfaceHeader";
import { AgentTranscript } from "./AgentTranscript";
import { createAgentProjection } from "../domain/agent-projection";
import "./desktop-agent.css";

const models = [
  { id: "anthropic/claude-sonnet-4-5", model: "anthropic/claude-sonnet-4-5", displayName: "Claude Sonnet 4.5", description: "Balanced coding model", isDefault: true, providerId: "anthropic" },
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
        text: "这些测试文件都在代码库里面吗？",
        streaming: false,
        terminalState: null,
        sequence: 1,
      },
      {
        id: "assistant:1",
        role: "assistant",
        turnId: "turn-1",
        itemId: "message-1",
        text: "是的，它们都保留在项目的 `tests` 目录里，`npm test` 会自动运行。\n\n这次新增的覆盖包括：\n\n- 文件复制与剪贴板交互\n- 工作区 IPC 安全边界\n- OpenCode session 恢复和流式事件\n\n基准测试仍然独立保留，用来持续发现首开和滚动性能回退。",
        streaming: false,
        terminalState: "completed",
        sequence: 2,
      },
      {
        id: "user:2",
        role: "user",
        turnId: "turn-2",
        itemId: null,
        text: "好，那把架构和性能边界也一起固定下来。",
        streaming: false,
        terminalState: null,
        sequence: 3,
      },
      {
        id: "assistant:2",
        role: "assistant",
        turnId: "turn-2",
        itemId: "message-2",
        text: "已经收拢完成。Chat 始终由 OpenCode harness 驱动，Provider 和 Model 是 session 内的选择；PuppyOne 只保存映射与 UI 投影，不再维护第二套 Agent loop。",
        streaming: false,
        terminalState: "completed",
        sequence: 5,
      },
    ];
    value.activities = [{
      id: "activity:architecture",
      turnId: "turn-2",
      itemId: "tool-1",
      kind: "file-change",
      label: "Updated Agent architecture and UI boundaries",
      status: "completed",
      detail: { changes: [{ path: "docs/architecture/desktop-agent", additions: 86, deletions: 12 }] },
      output: "",
      sequence: 4,
    }];
    value.lastSequence = 5;
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
        <AgentComposer
          draft={draft}
          onDraftChange={setDraft}
          disabled={false}
          running={false}
          stopping={false}
          submitting={false}
          placeholder="Plan, build, / for commands, @ for context"
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
