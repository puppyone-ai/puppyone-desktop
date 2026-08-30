import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const launcher = source("src/features/desktop-agent/ui/AgentRuntimeLauncher.tsx");
const launcherCss = source("src/features/desktop-agent/ui/styles/launcher.css");
const tabs = source("src/features/desktop-agent/ui/AgentSessionTabs.tsx");
const tabsCss = source("src/features/desktop-agent/ui/styles/tabs.css");
const terminalLauncherCss = source("src/features/desktop-terminal/ui/terminal-launcher.css");
const terminalTabsCss = source("src/features/desktop-terminal/ui/session-header/terminal-session-header.css");

describe("Desktop Agent and Terminal chrome visual contract", () => {
  it("keeps the legacy in-chat runtime chooser compact", () => {
    expect(launcherCss).toMatch(/padding:\s*clamp\(56px, 20vh, 220px\) 0 32px/);
    expect(launcherCss).toMatch(/width:\s*min\(100%, 252px\)/);
    expect(launcherCss).toMatch(/gap:\s*8px/);
    expect(launcherCss).toMatch(/padding:\s*18px/);
    expect(launcherCss).toMatch(/inset-inline-start:\s*22px/);
    expect(launcherCss).toMatch(/font-size:\s*12px/);
    expect(launcherCss).toMatch(/font-weight:\s*500/);
    expect(launcherCss).toMatch(/line-height:\s*18px/);
    expect(launcherCss).toMatch(/min-height:\s*34px/);
    expect(launcherCss).toMatch(/gap:\s*9px/);
    expect(launcherCss).toMatch(/padding:\s*5px 8px/);

    expect(launcherCss).toMatch(/\.desktop-agent-runtime-launcher-group\s*\{[^}]*border:\s*1px solid var\(--agent-border-subtle\)[^}]*border-radius:\s*0/s);
    expect(launcherCss).toMatch(/\.desktop-agent-runtime-launcher-option \.desktop-agent-brand-mark\s*\{[^}]*width:\s*18px[^}]*height:\s*18px[^}]*border-radius:\s*4px/s);
    expect(launcherCss).not.toMatch(/\.desktop-agent-runtime-launcher-heading h2\s*\{[^}]*font-size:\s*15px/s);
    expect(launcherCss).not.toMatch(/\.desktop-agent-runtime-launcher-option\s*\{[^}]*min-height:\s*38px/s);
    expect(launcher).toContain('aria-describedby={historyOpen ? undefined : "desktop-agent-runtime-launcher-description"}');
    expect(launcher).toContain('className="desktop-agent-runtime-launcher-description"');
    expect(launcher).toContain('className="desktop-agent-runtime-launcher-history"');
    expect(launcher).toContain('historyOpen ? (');
    expect(launcherCss).toMatch(/\.desktop-agent-history-list\s*\{[^}]*overflow-y:\s*auto/s);
  });

  it("uses two compact, non-wrapping recipe rails in the unified launcher", () => {
    expect(terminalLauncherCss).toMatch(/padding:\s*clamp\(58px, 18vh, 196px\) 10px 32px/);
    expect(terminalLauncherCss).toMatch(/width:\s*min\(100%, 320px\)/);
    expect(terminalLauncherCss).toMatch(/\.desktop-terminal-launcher-content\s*\{[^}]*gap:\s*22px/s);
    expect(terminalLauncherCss).toMatch(/\.desktop-terminal-launcher-rail\s*\{[^}]*min-height:\s*44px[^}]*flex-wrap:\s*nowrap[^}]*overflow:\s*hidden/s);
    expect(terminalLauncherCss).toMatch(/\.desktop-terminal-launcher-recipe\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/s);
    expect(terminalLauncherCss).toMatch(/\.desktop-terminal-launcher-recipe-label\s*\{[^}]*clip-path:\s*inset\(50%\)/s);
    expect(terminalLauncherCss).not.toContain("::-webkit-scrollbar");
    expect(terminalLauncherCss).not.toMatch(/scrollbar-(?:width|color)\s*:/);
  });

  it("matches Terminal tab typography and control geometry", () => {
    expect(terminalTabsCss).toContain("--desktop-terminal-tab-control-height: 28px;");
    expect(terminalTabsCss).toContain("--desktop-terminal-tab-width: 144px;");
    expect(terminalTabsCss).toMatch(
      /\.desktop-terminal-subheader\s*\{[^}]*height:\s*var\(--desktop-terminal-group-header-size, 38px\)/s,
    );
    expect(terminalTabsCss).toMatch(/\.desktop-terminal-tab-select\s*\{[^}]*font-size:\s*var\(--desktop-sidebar-font-size, var\(--po-text-size-sidebar, 13px\)\)[^}]*line-height:\s*var\(--desktop-sidebar-line-height, 18px\)/s);

    expect(tabsCss).toContain("--desktop-agent-tab-control-height: 28px;");
    expect(tabsCss).toContain("--desktop-agent-tab-width: 144px;");
    expect(tabsCss).toContain("--desktop-agent-tabs-gap: 3px;");
    expect(tabsCss).toMatch(/\.desktop-agent-workspace\s*\{[^}]*grid-template-rows:\s*38px minmax\(0, 1fr\)[^}]*font-family:\s*var\(--po-font-sans\)[^}]*font-size:\s*var\(--desktop-sidebar-font-size, var\(--po-text-size-sidebar, 13px\)\)/s);
    expect(tabsCss).toMatch(/\.desktop-agent-tabs-subheader\s*\{[^}]*height:\s*38px[^}]*padding:\s*4px 6px 6px/s);
    expect(tabsCss).toMatch(/\.desktop-agent-tab-select\s*\{[^}]*grid-template-columns:\s*var\(--desktop-agent-tab-control-height\) minmax\(0, 1fr\)[^}]*font-size:\s*var\(--desktop-sidebar-font-size, var\(--po-text-size-sidebar, 13px\)\)[^}]*line-height:\s*var\(--desktop-sidebar-line-height, 18px\)/s);
    expect(tabsCss).toMatch(/\.desktop-agent-tab \.desktop-agent-brand-mark\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/s);
    expect(tabsCss).not.toMatch(/\.desktop-agent-tab\s*\{[^}]*height:\s*30px/s);
    expect(tabs).toContain('className="desktop-agent-tab-leading"');
    expect(tabs).toContain('size={14}');
  });
});
