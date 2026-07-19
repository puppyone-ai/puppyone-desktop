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
const historyPreviewCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/history-card.css", import.meta.url),
  "utf8",
);
const sharedGraphCss = readFileSync(
  new URL("../src/features/cloud/graph/graph.css", import.meta.url),
  "utf8",
);
const identityCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/project-identity.css", import.meta.url),
  "utf8",
);

describe("Cloud Overview visual architecture", () => {
  it("uses three independent dashboard columns with a stacked resource column", () => {
    const layout = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard"));
    const card = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard-card"));
    const stack = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-dashboard-side-stack"));

    expect(layout).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(layout).toContain("gap: 16px;");
    expect(layout).not.toContain("border:");
    expect(layout).not.toContain("background:");
    expect(card).toContain("border: 1px solid var(--po-border-subtle);");
    expect(card).toContain("border-radius: 12px;");
    expect(card).toContain("box-shadow: none;");
    expect(stack).toContain("grid-template-rows: repeat(2, minmax(0, 1fr));");
    expect(stack).toContain("gap: 16px;");
  });

  it("retires the empty topology canvas and keeps the Project Git remote compact", () => {
    const remote = compact(readCssBlock(identityCss, ".desktop-cloud-overview-git-remote code"));

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
  });

  it("reuses the canonical branch graph inside the compact History card", () => {
    const preview = compact(readCssBlock(
      historyPreviewCss,
      ".desktop-cloud-overview-history-preview-row",
    ));
    const segment = compact(readCssBlock(
      sharedGraphCss,
      ".desktop-cloud-history-graph-segment",
    ));

    expect(preview).toContain("grid-template-columns: auto minmax(0, 1fr);");
    expect(historyPreviewCss).toContain("desktop-cloud-overview-history-preview-title em");
    expect(historyPreviewCss).not.toContain("desktop-cloud-overview-history-activity");
    expect(segment).toContain("stroke-linecap: round;");
    expect(segment).toContain("vector-effect: non-scaling-stroke;");
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
    expect(metric).toContain("flex: 0 0 auto;");
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
