import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/dashboard-grid.css", import.meta.url),
  "utf8",
);
const resourceCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/resource-cards.css", import.meta.url),
  "utf8",
);
const identityCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/project-identity.css", import.meta.url),
  "utf8",
);

describe("Cloud Overview visual architecture", () => {
  it("uses one square file card beside three compact metrics", () => {
    const layout = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard"));
    const card = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard-card"));
    const storage = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-dashboard-card--storage"));
    const preview = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-storage-preview"));

    expect(layout).toContain("width: min(100%, 840px);");
    expect(layout).toContain("grid-template-columns: minmax(300px, 340px) minmax(260px, 1fr);");
    expect(layout).toContain("grid-template-rows: repeat(3, minmax(0, 1fr));");
    expect(layout).not.toContain("border:");
    expect(layout).not.toContain("background:");
    expect(card).toContain("border: 1px solid var(--po-border-subtle);");
    expect(card).toContain("border-radius: 10px;");
    expect(card).toContain("box-shadow: none;");
    expect(storage).toContain("grid-row: 1 / span 3;");
    expect(storage).toContain("aspect-ratio: 1;");
    expect(preview).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
  });

  it("reimplements the archived Project folder construction without importing it", () => {
    const tab = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-storage-tab"));
    const body = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-storage-body"));
    const overviewSource = readFileSync(
      new URL("../src/features/cloud/sections/overview/OverviewDashboard.tsx", import.meta.url),
      "utf8",
    );

    expect(tab).toContain("border: 2px solid var(--po-border);");
    expect(tab).toContain("border-bottom: 0;");
    expect(tab).toContain("background: var(--po-project-card-tab);");
    expect(body).toContain("margin-top: -2px;");
    expect(body).toContain("border: 2px solid var(--po-border);");
    expect(body).toContain("border-radius: 0 8px 8px 8px;");
    expect(body).toContain("background: var(--po-project-card-bg);");
    expect(overviewSource).not.toContain("ProjectFolderCard");
  });

  it("keeps the Project Git remote compact and moves Cloud status into the identity mark", () => {
    const remote = compact(readCssBlock(identityCss, ".desktop-cloud-overview-git-remote code"));
    const overviewSource = readFileSync(
      new URL("../src/features/cloud/sections/overview/OverviewSection.tsx", import.meta.url),
      "utf8",
    );

    expect(existsSync(new URL(
      "../src/features/cloud/sections/overview/styles/deployment-board.css",
      import.meta.url,
    ))).toBe(false);
    expect(existsSync(new URL(
      "../src/features/cloud/sections/overview/styles/metric-rail.css",
      import.meta.url,
    ))).toBe(false);
    expect(remote).toContain("text-overflow: ellipsis;");
    expect(remote).toContain("white-space: nowrap;");
    expect(overviewSource).not.toContain("desktop-cloud-source-pill");
    expect(overviewSource).toContain("aria-label={t(\"cloud.common.cloudSource\")}");
    expect(identityCss).toContain(".desktop-cloud-overview-landing-mark::after");
  });

  it("keeps details out of the Overview summary", () => {
    const overviewSource = readFileSync(
      new URL("../src/features/cloud/sections/overview/OverviewDashboard.tsx", import.meta.url),
      "utf8",
    );

    expect(overviewSource).not.toContain("CloudOverviewHistoryPreview");
    expect(overviewSource).not.toContain("desktop-cloud-overview-access-row");
    expect(overviewSource).not.toContain("ProviderMark");
    expect(overviewSource).toContain("const STORAGE_PREVIEW_LIMIT = 8;");
  });

  it("uses namespaced modifiers so legacy utility classes cannot collapse dashboard metrics", () => {
    const overviewSource = readFileSync(
      new URL("../src/features/cloud/sections/overview/OverviewDashboard.tsx", import.meta.url),
      "utf8",
    );
    const metric = compact(readCssBlock(
      dashboardCss,
      ".desktop-cloud-overview-dashboard-hero",
    ));
    const literalClassTokens = [...overviewSource.matchAll(/className="([^"]+)"/g)]
      .flatMap((match) => match[1].split(/\s+/));

    expect(overviewSource).toContain("desktop-cloud-overview-dashboard-hero--metric");
    expect(literalClassTokens).not.toContain("compact");
    expect(literalClassTokens).not.toContain("interactive");
    expect(metric).toContain("flex: 1 1 auto;");
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
