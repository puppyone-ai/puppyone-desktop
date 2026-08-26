import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardCss = readSource("../src/features/cloud/sections/overview/styles/dashboard-grid.css");
const resourceCss = readSource("../src/features/cloud/sections/overview/styles/resource-cards.css");
const statusCss = readSource("../src/features/cloud/sections/overview/styles/status-cards.css");
const dashboardSource = readSource("../src/features/cloud/sections/overview/OverviewDashboard.tsx");
const overviewSource = readSource("../src/features/cloud/sections/overview/OverviewSection.tsx");

describe("Cloud Overview visual architecture", () => {
  it("uses one cloud-drive file preview with two summaries below it", () => {
    const layout = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard"));
    const summaries = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-summary-grid"));

    expect(layout).toContain("width: min(100%, 920px);");
    expect(layout).toContain("gap: 16px;");
    expect(layout).not.toContain("grid-template-columns:");
    expect(summaries).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(dashboardSource.match(/<OverviewSummaryCard/g)).toHaveLength(2);
    expect(dashboardSource).not.toContain("automationRows");
    expect(dashboardSource).not.toContain("manageAutomations");
  });

  it("renders real tree entries with the product file icon component", () => {
    const files = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-files"));
    const header = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-files-header"));
    const row = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-file-row"));
    const name = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-file-name"));

    expect(files).toContain("border: 1px solid var(--po-border-subtle);");
    expect(files).toContain("border-radius: 9px;");
    expect(header).toContain("height: 42px;");
    expect(row).toContain("min-height: 34px;");
    expect(row).toContain("border-radius: 6px;");
    expect(row).not.toContain("border:");
    expect(name).toContain("font-size: 13px;");
    expect(name).toContain("font-weight: 500;");
    expect(dashboardSource).toContain("FileGlyphIcon");
    expect(dashboardSource).toContain("getCloudOverviewRootEntries(tree)");
    expect(dashboardSource).not.toMatch(/\bFile\b.*from "lucide-react"/);
    expect(dashboardSource).not.toMatch(/\bFolder\b.*from "lucide-react"/);
  });

  it("keeps project storage in the identity header as a Drive-style meter", () => {
    const storage = compact(readCssBlock(statusCss, ".desktop-cloud-overview-project-storage"));
    const track = compact(readCssBlock(statusCss, ".desktop-cloud-overview-project-storage-track"));

    expect(storage).toContain("width: min(100%, 340px);");
    expect(storage).toContain("margin-top: 7px;");
    expect(track).toContain("height: 3px;");
    expect(track).toContain("border-radius: 999px;");
    expect(overviewSource).toContain("<CloudOverviewStorageMeter");
    expect(dashboardSource).not.toContain("CloudOverviewStorageMeter");
    expect(dashboardSource).not.toContain("desktop-cloud-overview-storage-");
  });

  it("uses route-owned icons and the same restrained typography throughout", () => {
    const label = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-summary-label"));
    const value = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-summary-copy strong"));
    const detail = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-file-detail"));

    expect(label).toContain("font-size: 12px;");
    expect(label).toContain("font-weight: 400;");
    expect(value).toContain("font-size: 16px;");
    expect(value).toContain("font-weight: 500;");
    expect(detail).toContain("font-size: 12px;");
    expect(detail).toContain("font-weight: 400;");
    expect(dashboardSource).toContain("getCloudRoute(\"history\").icon");
    expect(dashboardSource).toContain("getCloudRoute(\"access\").icon");
    expect(overviewSource).toContain("getCloudRoute(\"git-sync\").icon");
    expect(overviewSource).not.toContain("desktop-cloud-overview-landing-mark");
  });
});

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

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
