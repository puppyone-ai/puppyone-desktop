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
const statusCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/status-cards.css", import.meta.url),
  "utf8",
);
const identityCss = readFileSync(
  new URL("../src/features/cloud/sections/overview/styles/project-identity.css", import.meta.url),
  "utf8",
);

describe("Cloud Overview visual architecture", () => {
  it("uses a real file list beside two compact project facts", () => {
    const layout = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard"));
    const card = compact(readCssBlock(dashboardCss, ".desktop-cloud-overview-dashboard-card"));
    const storage = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-dashboard-card--storage"));
    const fileRow = compact(readCssBlock(resourceCss, ".desktop-cloud-overview-file-row"));

    expect(layout).toContain("width: min(100%, 900px);");
    expect(layout).toContain("grid-template-columns: minmax(360px, 1.15fr) minmax(280px, 0.85fr);");
    expect(layout).toContain("grid-template-rows: auto auto;");
    expect(layout).toContain("align-items: start;");
    expect(layout).not.toContain("border:");
    expect(layout).not.toContain("background:");
    expect(card).toContain("border: 1px solid var(--po-border-subtle);");
    expect(card).toContain("border-radius: 10px;");
    expect(card).toContain("box-shadow: none;");
    expect(storage).toContain("grid-row: 1 / span 2;");
    expect(fileRow).toContain("grid-template-columns: 24px minmax(0, 1fr) auto;");
    expect(fileRow).toContain("border-bottom: 1px solid var(--po-divider);");
  });

  it("renders actual Cloud tree and access rows instead of decorative previews", () => {
    const overviewSource = readFileSync(
      new URL("../src/features/cloud/sections/overview/OverviewDashboard.tsx", import.meta.url),
      "utf8",
    );

    expect(overviewSource).toContain("tree: DesktopCloudTree | null;");
    expect(overviewSource).toContain("desktop-cloud-overview-file-row");
    expect(overviewSource).toContain("desktop-cloud-overview-access-row");
    expect(overviewSource).toContain("CloudOverviewStorageMeter");
    expect(overviewSource).not.toContain("desktop-cloud-overview-dashboard-card--usage");
    expect(overviewSource).toContain("const FILE_LIST_LIMIT = 9;");
    expect(overviewSource).not.toContain("storage-preview");
    expect(overviewSource).not.toContain("activeAutomationRows");
    expect(overviewSource).not.toContain("commitWindow");
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

  it("uses namespaced modifiers so legacy utility classes cannot collapse the cards", () => {
    const overviewSource = readFileSync(
      new URL("../src/features/cloud/sections/overview/OverviewDashboard.tsx", import.meta.url),
      "utf8",
    );
    const updatedValue = compact(readCssBlock(
      statusCss,
      ".desktop-cloud-overview-updated-value",
    ));
    const literalClassTokens = [...overviewSource.matchAll(/className="([^"]+)"/g)]
      .flatMap((match) => match[1].split(/\s+/));

    expect(overviewSource).toContain("desktop-cloud-overview-dashboard-card--updated");
    expect(literalClassTokens).not.toContain("compact");
    expect(literalClassTokens).not.toContain("interactive");
    expect(updatedValue).toContain("flex: 1;");
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
