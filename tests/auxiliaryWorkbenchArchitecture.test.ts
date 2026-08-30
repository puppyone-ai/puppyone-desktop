import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Unified Terminal Workbench architecture", () => {
  it("keeps serializable topology independent from feature runtimes", () => {
    const model = source(
      "packages/shared-ui/src/workbench/auxiliary-workbench/auxiliaryWorkbenchModel.ts",
    );
    expect(model).toContain("type AuxiliaryWorkbenchItem");
    expect(model).toContain("type AuxiliaryWorkbenchGroup");
    expect(model).toContain("itemIds: readonly string[]");
    expect(model).toContain("assertAuxiliaryWorkbenchState");
    expect(model).not.toMatch(/React|electron|TerminalRuntime|AgentSessionController/);
    expect(model).not.toContain('kind: "terminal"');
    expect(model).not.toContain('kind: "agent-chat"');
  });

  it("composes one Right Sidebar surface and lazy Agent contribution", () => {
    const app = source("src/App.tsx");
    const lazyEntry = source("src/features/desktop-agent/lazy.ts");
    expect(app).toContain("lazy(loadAgentChatWorkbenchItem)");
    expect(app).toContain("contributions={auxiliaryWorkbenchContributions}");
    expect(app).toContain("terminalEnabled={desktopTerminalEnabled}");
    expect(app).toContain('className="desktop-right-sidebar-surface is-active"');
    expect(app).not.toContain("<RightAgentPanel");
    expect(app).not.toContain('key={focusedWorkspace?.path ?? workspace.path}');
    expect(lazyEntry).toContain('import("./workbench/AgentChatWorkbenchItem")');
  });

  it("preserves Item views across Tab reorder and keeps close feature-authoritative", () => {
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const hostOwner = source(
      "src/features/desktop-terminal/layout/session-host/usePersistentTerminalSessionHosts.ts",
    );
    const hostSlot = source(
      "src/features/desktop-terminal/workbench/TerminalWorkbenchItemHostSlot.tsx",
    );
    expect(panel).toContain("createPortal(");
    expect(panel).toContain("await contribution.requestClose(item)");
    expect(panel.indexOf("await contribution.requestClose(item)"))
      .toBeLessThan(panel.indexOf("workbench.removeItem(itemId)", panel.indexOf("requestCloseItem")));
    expect(hostOwner).toContain('document.createElement("div")');
    expect(hostSlot).toContain("slot.append(host)");
    expect(hostSlot).toContain("if (host.parentElement === slot) host.remove()");
  });

  it("separates visible, presented, command-target and DOM-focus state", () => {
    const contract = source("src/features/app-shell/auxiliary-workbench/types.ts");
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    expect(contract).toContain("sidebarVisible: boolean");
    expect(contract).toContain("presented: boolean");
    expect(contract).toContain("commandTarget: boolean");
    expect(contract).toContain("domFocused: boolean");
    expect(panel).toContain("active && presentedItemIdSet.has(item.id)");
    expect(panel).toContain("active && workbench.activeItemId === item.id");
  });

  it("pins every Terminal runtime to the Item root captured at creation", () => {
    const pool = source(
      "src/features/desktop-terminal/workbench/TerminalRuntimePool.ts",
    );
    expect(pool).toContain("rootByItemId");
    expect(pool).toContain("this.rootByItemId.set(itemId, workspacePath)");
    expect(pool).toContain("workspacePath,");
    expect(pool).not.toContain("focusedWorkspace");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
