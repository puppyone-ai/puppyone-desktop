import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styleRoot = path.join(root, "src/features/desktop-agent/ui/styles");
const css = [
  fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/desktop-agent.css"), "utf8"),
  ...["foundation.css", "transcript.css", "activities.css", "blocking.css", "composer.css", "pickers.css", "responsive.css"]
    .map((file) => fs.readFileSync(path.join(styleRoot, file), "utf8")),
].join("\n");
const composer = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/AgentComposer.tsx"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/RightAgentPanel.tsx"), "utf8");
const picker = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/AgentPickerPopover.tsx"), "utf8");
const brandMark = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/AgentBrandMark.tsx"), "utf8");
const messagePart = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/AgentMessagePart.tsx"), "utf8");
const transcript = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/AgentTranscript.tsx"), "utf8");

describe("Desktop Agent Cursor-style sidebar visual contract", () => {
  it("keeps user prompts as bubbles and Agent replies in document flow", () => {
    expect(css).toMatch(/--agent-inline-inset:\s*20px/);
    expect(css).toMatch(/--agent-dock-padding-top:\s*12px/);
    expect(css).toMatch(/--agent-dock-padding-bottom:\s*12px/);
    expect(css).toMatch(/--agent-control-size:\s*30px/);
    expect(css).toMatch(/--agent-radius-message:\s*16px/);
    expect(css).toMatch(/--agent-radius-composer:\s*8px/);
    expect(css).toMatch(/\.desktop-agent-transcript\s*\{[^}]*padding:\s*12px var\(--agent-inline-inset\) 24px/s);
    expect(css).toMatch(/\.desktop-agent-message\.is-user\s*\{[^}]*width:\s*fit-content[^}]*max-width:\s*min\(85%, 720px\)[^}]*padding:\s*12px 15px[^}]*border:\s*1px solid var\(--agent-border-subtle\)[^}]*box-shadow:\s*none/s);
    expect(css).toMatch(/\.desktop-agent-message\.is-assistant\s*\{[^}]*width:\s*100%[^}]*padding:\s*0[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
    expect(css).toMatch(/\.desktop-agent-message-text\s*\{[^}]*font-size:\s*var\(--agent-font-size\)/s);
    expect(css).toMatch(/\.desktop-agent-markdown\s*\{[^}]*font-size:\s*var\(--agent-font-size\)[^}]*line-height:\s*1\.66/s);
    expect(messagePart).toContain('data-message-surface={isAssistant ? "document" : "bubble"}');
  });

  it("keeps chrome in flow and gives the composer explicit control sizing", () => {
    expect(css).toMatch(/\.desktop-agent-header-region\s*\{[^}]*height:\s*var\(--desktop-sidebar-toolbar-height\)/s);
    expect(css).not.toMatch(/\.desktop-agent-header-region\s*\{[^}]*box-shadow:/s);
    expect(css).toMatch(/\.desktop-agent-session-header\s*\{[^}]*width:\s*100%[^}]*justify-content:\s*space-between[^}]*padding:\s*0 var\(--desktop-sidebar-toolbar-padding-right\) 0 var\(--desktop-sidebar-toolbar-padding-left\)[^}]*border-bottom:\s*1px solid transparent/s);
    expect(css).toMatch(/\.desktop-agent-transcript-wrap::before\s*\{[^}]*right:\s*var\(--desktop-sidebar-navigation-fade-scrollbar-inset\)[^}]*height:\s*calc\(var\(--desktop-sidebar-navigation-fade-size\) \* var\(--agent-edge-fade-top, 0\)\)[^}]*var\(--agent-canvas\) 0%[^}]*color-mix\(in srgb, var\(--agent-canvas\) 78%, transparent\) 46%[^}]*transparent 100%[^}]*opacity:\s*var\(--agent-edge-fade-top, 0\)/s);
    expect(transcript).toContain("useScrollEdgeState(scrollRef");
    expect(transcript).toContain('"--agent-edge-fade-top": scrollEdgeState.topFade.toFixed(3)');
    expect(css).toMatch(/\.desktop-agent-dock-region\s*\{[^}]*padding:\s*var\(--agent-dock-padding-top\) var\(--agent-inline-inset\) var\(--agent-dock-padding-bottom\)/s);
    expect(css).toMatch(/\.desktop-agent-composer-shell\s*\{[^}]*padding:\s*0/s);
    expect(css).toMatch(/--agent-sidebar-border:\s*var\(--po-divider\)/);
    expect(css).toMatch(/--agent-config-border:\s*var\(--po-border-subtle\)/);
    expect(css).toMatch(/\.desktop-agent-composer\s*\{[^}]*padding:\s*0[^}]*border:\s*1px solid var\(--agent-sidebar-border\)/s);
    expect(css).toMatch(/\.desktop-agent-composer-trailing\s*\{[^}]*border-top:\s*1px solid var\(--agent-sidebar-border\)/s);
    expect(css).toMatch(/\.desktop-agent-picker-trigger\s*\{[^}]*width:\s*fit-content[^}]*border:\s*1px solid var\(--agent-config-border\)[^}]*background:\s*transparent/s);
    expect(css).toMatch(/\.desktop-agent-composer-picker\.is-model\s*\{[^}]*width:\s*fit-content/s);
    expect(css).toMatch(/\.desktop-agent-composer-row\s*\{[^}]*min-height:\s*118px[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*grid-template-rows:\s*minmax\(72px, auto\) 46px[^}]*gap:\s*0/s);
    expect(css).toMatch(/\.desktop-agent-picker-trigger\.is-compact\s*\{[^}]*width:\s*var\(--agent-control-size\)/s);
    expect(css).toMatch(/\.desktop-agent-composer-action\s*\{[^}]*width:\s*var\(--agent-control-size\)[^}]*height:\s*var\(--agent-control-size\)[^}]*border-radius:\s*6px/s);
    expect(css).toMatch(/\.desktop-agent-composer textarea\s*\{[^}]*min-height:\s*72px[^}]*max-height:\s*160px[^}]*font-size:\s*var\(--agent-font-size\)/s);
    expect(composer).not.toContain("<Plus");
    expect(composer).not.toContain('className="desktop-agent-tools-menu"');
    expect(composer).not.toContain("AgentBackendPicker");
    expect(composer).not.toContain('is-backend');
    expect(composer).not.toContain("AgentProviderPicker");
    expect(panel).toContain("agentSelector={<AgentProviderPicker");
    expect(css).toMatch(/\.desktop-agent-picker\.is-header \.desktop-agent-picker-trigger\s*\{[^}]*border:\s*0[^}]*font-weight:\s*650/s);
    expect(css).toMatch(/\.desktop-agent-session-header-actions\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s);
    expect(composer).not.toContain("<Zap");
    expect(panel).toContain('"Send follow-up"');
    expect(panel).toContain("<AgentPanelLayout");
    expect(brandMark).toContain("/icons/agent-claude-code.svg");
    expect(brandMark).toContain("/icons/agent-cursor.svg");
    expect(brandMark).toContain("/icons/agent-opencode.svg");
    expect(brandMark).not.toMatch(/https?:\/\//);
  });

  it("shares the Appearance typography scale with the left sidebar", () => {
    expect(css).toMatch(/--agent-font-size:\s*var\(--desktop-sidebar-font-size, var\(--po-text-size-sidebar, 13px\)\)/);
    expect(css).toMatch(/--agent-font-size-meta:\s*var\(--desktop-sidebar-font-size-meta, var\(--po-text-size-meta, 12px\)\)/);
    expect(css).toMatch(/\.desktop-agent-picker-trigger\s*\{[^}]*font-size:\s*var\(--agent-font-size\)/s);
    expect(css).toMatch(/\.desktop-agent-tool-name\s*\{[^}]*font-size:\s*var\(--agent-font-size\)/s);
    expect(css).toMatch(/\.desktop-agent-code-block pre\s*\{[^}]*font-size:\s*var\(--agent-code-font-size\)/s);
  });

  it("retains bounded overflow and explicit responsive contracts", () => {
    expect(css).toMatch(/\.desktop-agent-transcript\s*\{[^}]*overflow-x:\s*hidden/s);
    expect(css).toMatch(/@container desktop-agent \(max-width:\s*759px\)/);
    expect(css).toMatch(/@container desktop-agent \(max-width:\s*559px\)/);
    expect(css).toMatch(/@container desktop-agent \(max-width:\s*419px\)/);
    expect(css).toMatch(/\.desktop-agent-changes-pill\s*\{[^}]*min-height:\s*var\(--agent-control-size\)/s);
    expect(css).toMatch(/\.desktop-agent-tool-call\s*\{[^}]*margin:\s*0 4px 6px[^}]*padding:\s*0[^}]*border:\s*0[^}]*background:\s*transparent/s);
    expect(css).not.toContain(".desktop-agent-tool-call::before");
    expect(css).not.toContain("desktop-agent-research-pulse");
    expect(css).toMatch(/\.desktop-agent-command\s*\{[^}]*border:\s*1px solid var\(--agent-border-subtle\)[^}]*border-radius:\s*10px/s);
    expect(css).toMatch(/\.desktop-agent-context-divider\s*\{[^}]*grid-template-columns:\s*minmax\(18px, 1fr\) auto minmax\(18px, 1fr\)/s);
    expect(css).toMatch(/\.desktop-agent-picker-popover\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*1300/s);
    expect(picker).toContain("DesktopOverlayLayer");
    expect(picker).toContain('boundarySelector: ".desktop-agent-boundary"');
  });
});
