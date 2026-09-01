import { beforeEach, describe, expect, it, vi } from "vitest";

const instances = vi.hoisted(() => [] as Array<{
  closeTabSession: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  rollbackPreparation: ReturnType<typeof vi.fn>;
}>);

vi.mock("../src/features/desktop-agent/application/AgentSessionController", () => ({
  AgentSessionController: class MockAgentSessionController {
    closeTabSession = vi.fn(async () => true);
    dispose = vi.fn();
    rollbackPreparation = vi.fn(async () => undefined);

    constructor() {
      instances.push(this);
    }
  },
}));

import {
  clearAgentControllerRegistryForTests,
  discardPreparedAgentSessionController,
  getAgentSessionController,
} from "../src/features/desktop-agent/application/controllerRegistry";

describe("Agent session Controller ownership registry", () => {
  beforeEach(() => {
    clearAgentControllerRegistryForTests();
    instances.length = 0;
  });

  it("does not evict a hidden tab Controller when the Workbench reaches its item limit", () => {
    const provider = () => null;
    const first = getAgentSessionController("/workspace", provider, "tab-0");
    for (let index = 1; index < 9; index += 1) {
      getAgentSessionController("/workspace", provider, `tab-${index}`);
    }

    expect(getAgentSessionController("/workspace", provider, "tab-0")).toBe(first);
    expect(instances).toHaveLength(9);
    expect(instances[0]?.dispose).not.toHaveBeenCalled();
  });

  it("removes abandoned ownership before awaiting native preparation rollback", async () => {
    const provider = () => null;
    const abandoned = getAgentSessionController("/workspace", provider, "reserved-tab");
    let release!: () => void;
    instances[0]!.rollbackPreparation.mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    const rollback = discardPreparedAgentSessionController("/workspace", "reserved-tab");
    const replacement = getAgentSessionController("/workspace", provider, "reserved-tab");
    expect(replacement).not.toBe(abandoned);

    release();
    await rollback;
    expect(instances[0]?.rollbackPreparation).toHaveBeenCalledOnce();
  });
});
