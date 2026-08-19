import { describe, expect, it } from "vitest";
import { CREATE_NEW_ITEM_IDS } from "../src/preferences";
import {
  getDefaultCreateNewMenuItems,
  getConfiguredCreateEntryMenuItems,
  getCreateEntryMenuItem,
  PRIMARY_CREATE_ENTRY_KINDS,
} from "../src/features/create-new/createEntryMenuRegistry";

describe("create entry menu registry", () => {
  it("covers every configurable item and keeps the primary group ordered centrally", () => {
    expect(PRIMARY_CREATE_ENTRY_KINDS).toEqual(["markdown", "csv", "html"]);
    expect(CREATE_NEW_ITEM_IDS.map((kind) => getCreateEntryMenuItem(kind).kind))
      .toEqual(CREATE_NEW_ITEM_IDS);
    expect(getDefaultCreateNewMenuItems()).toEqual([
      { kind: "markdown", enabled: true },
      { kind: "contextMap", enabled: true },
      { kind: "csv", enabled: true },
      { kind: "html", enabled: true },
      { kind: "slides", enabled: true },
    ]);
  });

  it("derives menu groups without losing the configured custom order", () => {
    const configured = ["app", "html", "contextMap", "markdown", "csv"] as const;

    expect(getConfiguredCreateEntryMenuItems(configured, "primary").map((item) => item.kind))
      .toEqual(["markdown", "csv", "html"]);
    expect(getConfiguredCreateEntryMenuItems(configured, "custom").map((item) => item.kind))
      .toEqual(["app", "contextMap"]);
  });
});
