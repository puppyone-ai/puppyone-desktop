import type { DataNode } from "@puppyone/shared-ui";

export const CREATE_NEW_ITEM_IDS = [
  "markdown",
  "contextMap",
  "text",
  "json",
  "csv",
  "html",
  "slides",
  "app",
  "puppyflow",
] as const;
export type CreateNewItemId = typeof CREATE_NEW_ITEM_IDS[number];

export type CreateEntryMenuItemKind = "folder" | CreateNewItemId;
export type CreateNewMenuPlacement = "main" | "submenu";

export type CreateEntryMenuItemDefinition = Readonly<{
  kind: CreateEntryMenuItemKind;
  defaultPlacement: CreateNewMenuPlacement;
  order: number;
  defaultEnabled: boolean;
  experimentalSetting?: "enableContextMaps" | "enablePuppyFlowFiles";
  extension: string;
  iconName: string;
  iconType: DataNode["type"];
}>;

const CREATE_ENTRY_MENU_ITEM_REGISTRY = {
  folder: {
    kind: "folder",
    defaultPlacement: "main",
    order: 0,
    defaultEnabled: true,
    extension: "",
    iconName: "folder",
    iconType: "folder",
  },
  markdown: {
    kind: "markdown",
    defaultPlacement: "main",
    order: 10,
    defaultEnabled: true,
    extension: ".md",
    iconName: "Untitled.md",
    iconType: "markdown",
  },
  csv: {
    kind: "csv",
    defaultPlacement: "main",
    order: 20,
    defaultEnabled: true,
    extension: ".csv",
    iconName: "Untitled.csv",
    iconType: "spreadsheet",
  },
  html: {
    kind: "html",
    defaultPlacement: "main",
    order: 30,
    defaultEnabled: true,
    extension: ".html",
    iconName: "Untitled.html",
    iconType: "html",
  },
  contextMap: {
    kind: "contextMap",
    defaultPlacement: "submenu",
    order: 10,
    defaultEnabled: true,
    experimentalSetting: "enableContextMaps",
    extension: ".contextmap",
    iconName: "Untitled.contextmap",
    iconType: "context-map",
  },
  text: {
    kind: "text",
    defaultPlacement: "submenu",
    order: 20,
    defaultEnabled: false,
    extension: ".txt",
    iconName: "Untitled.txt",
    iconType: "text",
  },
  json: {
    kind: "json",
    defaultPlacement: "submenu",
    order: 30,
    defaultEnabled: false,
    extension: ".json",
    iconName: "Untitled.json",
    iconType: "json",
  },
  slides: {
    kind: "slides",
    defaultPlacement: "submenu",
    order: 40,
    defaultEnabled: true,
    extension: ".puppyoneapp",
    iconName: "Untitled Slides.puppyoneapp",
    iconType: "app",
  },
  app: {
    kind: "app",
    defaultPlacement: "submenu",
    order: 50,
    defaultEnabled: false,
    extension: ".puppyoneapp",
    iconName: "Untitled.puppyoneapp",
    iconType: "app",
  },
  puppyflow: {
    kind: "puppyflow",
    defaultPlacement: "submenu",
    order: 60,
    defaultEnabled: false,
    experimentalSetting: "enablePuppyFlowFiles",
    extension: ".puppyflow",
    iconName: "Untitled.puppyflow",
    iconType: "workflow",
  },
} as const satisfies Record<CreateEntryMenuItemKind, CreateEntryMenuItemDefinition>;

export function getCreateEntryMenuItem(
  kind: CreateEntryMenuItemKind,
): CreateEntryMenuItemDefinition {
  return CREATE_ENTRY_MENU_ITEM_REGISTRY[kind];
}

export function getDefaultCreateNewMenuItems(): Array<{
  kind: CreateNewItemId;
  enabled: boolean;
  placement: CreateNewMenuPlacement;
}> {
  return CREATE_NEW_ITEM_IDS
    .map((kind) => CREATE_ENTRY_MENU_ITEM_REGISTRY[kind])
    .sort((left, right) => {
      if (left.defaultPlacement !== right.defaultPlacement) {
        return left.defaultPlacement === "main" ? -1 : 1;
      }
      return left.order - right.order;
    })
    .map((item) => ({
      kind: item.kind,
      enabled: item.defaultEnabled,
      placement: item.defaultPlacement,
    }));
}

export function getConfiguredCreateEntryMenuItems(
  kinds: readonly CreateNewItemId[],
): CreateEntryMenuItemDefinition[] {
  return kinds.map((kind) => getCreateEntryMenuItem(kind));
}
