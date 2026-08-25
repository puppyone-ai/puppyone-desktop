import { describe, expect, it } from "vitest";
import { CREATE_NEW_ITEM_IDS } from "../src/preferences";
import {
  getDefaultCreateNewMenuItems,
  getConfiguredCreateEntryMenuItems,
  getCreateEntryMenuItem,
} from "../src/features/create-new/createEntryMenuRegistry";

describe("create entry menu registry", () => {
  it("defines every configurable item and its default menu placement centrally", () => {
    expect(CREATE_NEW_ITEM_IDS.map((kind) => getCreateEntryMenuItem(kind).kind))
      .toEqual(CREATE_NEW_ITEM_IDS);
    expect(getDefaultCreateNewMenuItems()).toEqual([
      { kind: "markdown", enabled: true, placement: "main" },
      { kind: "csv", enabled: true, placement: "main" },
      { kind: "html", enabled: true, placement: "main" },
      { kind: "contextMap", enabled: true, placement: "submenu" },
      { kind: "text", enabled: false, placement: "submenu" },
      { kind: "json", enabled: false, placement: "submenu" },
      { kind: "slides", enabled: true, placement: "submenu" },
      { kind: "app", enabled: false, placement: "submenu" },
      { kind: "puppyflow", enabled: false, placement: "submenu" },
    ]);
  });

  it("preserves configured order independently of an item's default placement", () => {
    const configured = ["app", "html", "contextMap", "markdown", "csv"] as const;

    expect(getConfiguredCreateEntryMenuItems(configured).map((item) => item.kind))
      .toEqual(configured);
  });
});
