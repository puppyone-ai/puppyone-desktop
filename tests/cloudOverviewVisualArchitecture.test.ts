import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardCss = readSource("../src/features/cloud/sections/overview/styles/dashboard-grid.css");
const baseCss = readSource("../src/features/cloud/sections/overview/styles/base.css");
const projectIdentityCss = readSource("../src/features/cloud/sections/overview/styles/project-identity.css");
const resourceCss = readSource("../src/features/cloud/sections/overview/styles/resource-cards.css");
const statusCss = readSource("../src/features/cloud/sections/overview/styles/status-cards.css");
const dashboardSource = readSource("../src/features/cloud/sections/overview/OverviewDashboard.tsx");
const overviewSource = readSource("../src/features/cloud/sections/overview/OverviewSection.tsx");

describe("Cloud Overview visual architecture", () => {
  it("makes the file table the full-width primary Overview surface", () => {
    const layout = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard"));

    expect(layout).toContain("display: block;");
    expect(layout).toContain("width: 100%;");
    expect(layout).toContain("margin-top: 30px;");
    expect(dashboardSource).not.toContain("OverviewSummaryCard");
    expect(dashboardSource).not.toContain("desktop-cloud-overview-summary-grid");
    expect(overviewSource).toContain("desktop-cloud-overview-header-facts");
  });

  it("starts directly with table columns inside one emphasized frame", () => {
    const files = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-files"));
    const columns = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-file-columns"));

    expect(files).toContain("border: 1px solid var(--po-border-strong);");
    expect(files).toContain("border-radius: 10px;");
    expect(columns).toContain("min-height: 34px;");
    expect(columns).toContain("border-bottom: 1px solid var(--po-border);");
    expect(columns).toContain("background: var(--po-active);");
    expect(resourceCss).toContain(".desktop-cloud-overview-file-row {\n  min-height: 40px;");
    expect(resourceCss).toContain("min-height: 40px;\n  border-bottom: 1px solid var(--po-border-subtle);");
    expect(dashboardSource).toContain("desktop-cloud-overview-file-columns");
    expect(dashboardSource).toContain("desktop-cloud-overview-visually-hidden");
    expect(dashboardSource).not.toContain("desktop-cloud-overview-files-header");
    expect(dashboardSource).not.toContain("cloud.overview.filesLabel");
  });

  it("renders real entries, modification time, and size with product file icons", () => {
    const name = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-file-name"));
    const metadata = compact(readCssBlock(
      resourceCss,
      ".desktop-cloud-overview-file-modified,\n.desktop-cloud-overview-file-size",
    ));

    expect(name).toContain("font-size: 12px;");
    expect(name).toContain("font-weight: 500;");
    expect(metadata).toContain("font-size: 11px;");
    expect(metadata).toContain("font-weight: 400;");
    expect(dashboardSource).toContain("FileGlyphIcon");
    expect(dashboardSource).toContain("getCloudOverviewEntryUpdatedAt(entry, history)");
    expect(dashboardSource).toContain("formatBytes(entry.size_bytes");
    expect(dashboardSource).not.toMatch(/\bFile\b.*from "lucide-react"/);
    expect(dashboardSource).not.toMatch(/\bFolder\b.*from "lucide-react"/);
  });

  it("gives storage a long description strip and keeps three quiet facts beside it", () => {
    const facts = compact(readCssBlock(statusCss, ".desktop-cloud-overview-header-facts"));
    const fact = compact(readCssBlock(statusCss, ".desktop-cloud-overview-header-fact"));
    const storage = compact(readCssBlock(statusCss, ".desktop-cloud-overview-project-storage"));
    const track = compact(readCssBlock(statusCss, ".desktop-cloud-overview-project-storage-track"));
    const path = compact(readCssBlock(projectIdentityCss, ".desktop-cloud-overview-path-fact"));
    const titleRow = compact(readCssBlock(baseCss, ".desktop-cloud-overview-title-row"));

    expect(facts).toContain("grid-auto-flow: column;");
    expect(fact).toContain("border-inline-start: 1px solid var(--po-border-subtle);");
    expect(storage).toContain("width: min(100%, 420px);");
    expect(track).toContain("height: 4px;");
    expect(path).toContain("width: clamp(150px, 17vw, 220px);");
    expect(titleRow).toContain("align-items: center;");
    expect(overviewSource.match(/<CloudOverviewHeaderFact/g)).toHaveLength(2);
    expect(overviewSource).toContain("<CloudOverviewStorageMeter");
    expect(overviewSource).toContain('label={t("cloud.overview.activeConnections")}');
    expect(overviewSource).toContain("<CloudOverviewPathFact");
    expect(overviewSource.indexOf("<CloudOverviewStorageMeter")).toBeLessThan(
      overviewSource.indexOf("desktop-cloud-overview-header-side"),
    );
    expect(overviewSource).toContain("desktop-cloud-overview-title-row");
    expect(overviewSource).not.toContain("getCloudRoute(\"git-sync\").icon");
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
