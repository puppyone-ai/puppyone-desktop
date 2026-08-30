/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  beginInitializeForRuntime: vi.fn(),
}));
const getAgentSessionController = vi.hoisted(() => vi.fn(() => controller));

vi.mock("../src/features/desktop-agent/application/controllerRegistry", () => ({
  closeAgentSessionController: vi.fn(),
  discardAgentSessionController: vi.fn(),
  getAgentSessionController,
}));

import { prepareAgentChatWorkbenchItem } from "../src/features/desktop-agent/workbench/AgentChatWorkbenchItem";

describe("Agent Chat Workbench preparation", () => {
  beforeEach(() => {
    controller.beginInitializeForRuntime.mockClear();
    getAgentSessionController.mockClear();
  });

  it("binds the requested runtime without making topology wait for discovery", () => {
    const preparation = prepareAgentChatWorkbenchItem(
      "/workspace/project",
      "chat-item-1",
      "codex",
    );

    expect(preparation).toBeUndefined();
    expect(getAgentSessionController).toHaveBeenCalledWith(
      "/workspace/project",
      expect.any(Function),
      "chat-item-1",
      expect.any(Function),
    );
    expect(controller.beginInitializeForRuntime).toHaveBeenCalledWith("codex");
  });
});
