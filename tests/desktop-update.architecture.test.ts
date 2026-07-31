import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop update interaction boundaries", () => {
  it("keeps blocked updates in Settings and never rechecks a downloaded payload", () => {
    const service = source("electron/update-service.mjs");
    const main = source("electron/main.mjs");
    const controls = source("src/components/DesktopUpdateControls.tsx");

    expect(service).toContain('state.status === "downloaded" || state.status === "blocked"');
    expect(service).not.toContain('|| status === "blocked";');
    expect(service).toContain("confirmRestartWithBlockers");
    expect(main).toContain(
      "confirmRestartWithBlockers: confirmUpdateRestartWithBlockers",
    );
    expect(main).toContain("native.update.confirm.proceed");
    expect(controls).toContain('<small aria-live="polite">{detail}</small>');
    expect(controls).toContain(
      'state.status === "downloaded" || state.status === "blocked"',
    );
    expect(controls).not.toContain("DesktopUpdateTitlebarButton");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
