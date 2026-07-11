import { describe, expect, it } from "vitest";
import {
  isDesktopAgentChatEnabled,
} from "../src/features/desktop-agent/featureGate";
import {
  isDesktopTerminalEnabled,
} from "../src/features/desktop-terminal/featureGate";

describe("Desktop Agent Chat experiment gate", () => {
  it("keeps the existing Terminal available when the Agent experiment is off", () => {
    expect(isDesktopTerminalEnabled({ terminalToolEnabled: true, workspaceIsCloud: false })).toBe(true);
    expect(isDesktopAgentChatEnabled({
      available: true,
      optedIn: false,
      workspaceIsCloud: false,
    })).toBe(false);
  });

  it("does not couple the Chat experiment to the Terminal tool setting", () => {
    expect(isDesktopTerminalEnabled({ terminalToolEnabled: false, workspaceIsCloud: false })).toBe(false);
    expect(isDesktopAgentChatEnabled({
      available: true,
      optedIn: true,
      workspaceIsCloud: false,
    })).toBe(true);
  });

  it("requires both release availability and explicit local opt-in", () => {
    const base = { workspaceIsCloud: false };
    expect(isDesktopAgentChatEnabled({ ...base, available: false, optedIn: true })).toBe(false);
    expect(isDesktopAgentChatEnabled({ ...base, available: true, optedIn: false })).toBe(false);
    expect(isDesktopAgentChatEnabled({ ...base, available: true, optedIn: true })).toBe(true);
  });

  it("never exposes local Agent Chat in cloud workspaces", () => {
    expect(isDesktopAgentChatEnabled({
      available: true,
      optedIn: true,
      workspaceIsCloud: true,
    })).toBe(false);
  });
});
