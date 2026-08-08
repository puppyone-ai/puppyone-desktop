import { describe, expect, it } from "vitest";
import { createLocalDataPort } from "../src/lib/localFiles";

describe("Office editing experiment adapter", () => {
  it("withholds editing authority by default and exposes it only after opt-in", () => {
    expect(createLocalDataPort("/workspace").officeEditing).toBeUndefined();
    expect(createLocalDataPort("/workspace", { enableOfficeEditing: false }).officeEditing).toBeUndefined();
    expect(createLocalDataPort("/workspace", { enableOfficeEditing: true }).officeEditing).toBeDefined();
  });
});
