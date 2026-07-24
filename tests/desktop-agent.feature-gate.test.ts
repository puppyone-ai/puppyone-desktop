import { describe, expect, it } from "vitest";
import {
  isDesktopAgentChatEnabled,
} from "../src/features/desktop-agent/featureGate";
import {
  isDesktopTerminalEnabled,
} from "../src/features/desktop-terminal/featureGate";

describe("Desktop Agent Chat experiment gate", () => {
  it("keeps the existing Terminal available when the Agent experiment is off", () => {
    expect(isDesktopTerminalEnabled({ terminalToolEnabled: true })).toBe(true);
    expect(isDesktopAgentChatEnabled({
      available: true,
      optedIn: false,
    })).toBe(false);
  });

  it("does not couple the Chat experiment to the Terminal tool setting", () => {
    expect(isDesktopTerminalEnabled({ terminalToolEnabled: false })).toBe(false);
    expect(isDesktopAgentChatEnabled({
      available: true,
      optedIn: true,
    })).toBe(true);
  });

  it("requires both release availability and explicit local opt-in", () => {
    expect(isDesktopAgentChatEnabled({ available: false, optedIn: true })).toBe(false);
    expect(isDesktopAgentChatEnabled({ available: true, optedIn: false })).toBe(false);
    expect(isDesktopAgentChatEnabled({ available: true, optedIn: true })).toBe(true);
  });

  it("has no retired Cloud-workspace branch", () => {
    expect(isDesktopAgentChatEnabled({ available: true, optedIn: true })).toBe(true);
  });
});
