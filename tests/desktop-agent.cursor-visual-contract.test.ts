import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/desktop-agent.css"), "utf8");
const composer = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/AgentComposer.tsx"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/features/desktop-agent/ui/RightAgentPanel.tsx"), "utf8");

describe("Desktop Agent Cursor sidebar visual contract", () => {
  it("locks the 420px reference geometry", () => {
    expect(css).toMatch(/--agent-page-gutter:\s*8px/);
    expect(css).toMatch(/--agent-composer-gutter:\s*8px/);
    expect(css).toMatch(/--agent-radius-message:\s*13px/);
    expect(css).toMatch(/--agent-radius-composer:\s*22px/);
    expect(css).toMatch(/\.desktop-agent-transcript\s*\{[^}]*padding:\s*10px var\(--agent-page-gutter\) 28px/s);
    expect(css).toMatch(/\.desktop-agent-message\.is-user\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*padding:\s*10px 12px 11px/s);
    expect(css).toMatch(/\.desktop-agent-message\.is-assistant\s*\{\s*padding:\s*0 10px/);
  });

  it("keeps chrome out of the document flow and the composer on one row", () => {
    expect(css).toMatch(/\.desktop-agent-session-header\s*\{[^}]*position:\s*absolute[^}]*opacity:\s*0/s);
    expect(css).toMatch(/\.desktop-agent-composer-shell\s*\{[^}]*padding:\s*4px var\(--agent-composer-gutter\) 8px/s);
    expect(css).toMatch(/\.desktop-agent-composer\s*\{[^}]*padding:\s*3px 7px 3px 8px/s);
    expect(css).toMatch(/\.desktop-agent-composer-row\s*\{[^}]*min-height:\s*34px[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto[^}]*gap:\s*8px/s);
    expect(css).toMatch(/\.desktop-agent-composer-tool\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/s);
    expect(css).toMatch(/\.desktop-agent-composer-action\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/s);
    expect(css).toMatch(/\.desktop-agent-composer textarea\s*\{[^}]*min-height:\s*20px[^}]*max-height:\s*132px/s);
    expect(composer).toContain('className="desktop-agent-tools-menu"');
    expect(composer.indexOf('is-provider')).toBeLessThan(composer.indexOf('is-model'));
    expect(composer).not.toContain("<Zap");
    expect(panel).toContain('"Send follow-up"');
  });

  it("retains bounded overflow and explicit responsive contracts", () => {
    expect(css).toMatch(/\.desktop-agent-transcript\s*\{[^}]*overflow-x:\s*hidden/s);
    expect(css).toMatch(/@container desktop-agent \(max-width:\s*759px\)/);
    expect(css).toMatch(/@container desktop-agent \(max-width:\s*559px\)/);
    expect(css).toMatch(/@container desktop-agent \(max-width:\s*419px\)/);
    expect(css).toMatch(/\.desktop-agent-changes-pill\s*\{[^}]*min-height:\s*28px/s);
  });
});
