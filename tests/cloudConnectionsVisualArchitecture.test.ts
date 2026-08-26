import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const accessCss = readFileSync(
  new URL("../src/features/cloud/sections/access/styles/base.css", import.meta.url),
  "utf8",
);
const accessSource = readFileSync(
  new URL("../src/features/cloud/sections/access/AccessSection.tsx", import.meta.url),
  "utf8",
);
const routeOutletSource = readFileSync(
  new URL("../src/features/cloud/routes/CloudProjectRouteOutlet.tsx", import.meta.url),
  "utf8",
);

describe("Cloud Connections visual architecture", () => {
  it("uses the same landing title system as Access and Automation", () => {
    const catalog = compact(readCssBlock(accessCss, ".desktop-cloud-access-catalog"));
    const header = compact(readCssBlock(accessCss, ".desktop-cloud-access-landing-header"));
    const title = compact(readCssBlock(accessCss, ".desktop-cloud-access-landing-copy h1"));

    expect(catalog).toContain("padding: 44px clamp(28px, 4.6vw, 44px) 56px;");
    expect(header).toContain("align-items: flex-start;");
    expect(header).toContain("padding: 0 8px;");
    expect(title).toContain("font-size: var(--po-text-size-page-title, 20px);");
    expect(title).toContain("font-weight: 500;");
  });

  it("renders MCP, CLI, and Git through the exact Access Point list", () => {
    const list = compact(readCssBlock(accessCss, ".desktop-cloud-access-point-list"));
    const row = compact(readCssBlock(accessCss, ".desktop-cloud-access-point-row"));

    expect(list).toContain("gap: 7px;");
    expect(row).toContain("grid-template-columns: 30px minmax(0, 1fr) minmax(260px, 330px);");
    expect(row).toContain("border: 1px solid var(--po-border-subtle);");
    expect(accessSource).toContain("catalogFilterLocked");
    expect(accessSource).toContain("desktop-cloud-access-point-list");
    expect(routeOutletSource).toContain('activeSection === "mcp"');
    expect(routeOutletSource).toContain('activeSection === "cli"');
    expect(routeOutletSource).toContain('activeSection === "git-sync"');
  });

  it("does not maintain a second visual implementation for Connection routes", () => {
    expect(routeOutletSource).not.toContain("CloudMcpSection");
    expect(routeOutletSource).not.toContain("CloudCliSection");
    expect(routeOutletSource).not.toContain("CloudGitSyncSection");
    expect(accessSource).toContain("includePlaceholders: catalogFilterLocked");
  });
});

function readCssBlock(css: string, selector: string): string {
  const marker = `${selector} {`;
  const lineMarker = `\n${marker}`;
  const lineStart = css.indexOf(lineMarker);
  const start = css.startsWith(marker) ? 0 : lineStart >= 0 ? lineStart + 1 : -1;
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
