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
export type CreateEntryMenuGroup = "folder" | "primary" | "custom";

export type CreateEntryMenuItemDefinition = Readonly<{
  kind: CreateEntryMenuItemKind;
  group: CreateEntryMenuGroup;
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
    group: "folder",
    order: 0,
    defaultEnabled: true,
    extension: "",
    iconName: "folder",
    iconType: "folder",
  },
  markdown: {
    kind: "markdown",
    group: "primary",
    order: 10,
    defaultEnabled: true,
    extension: ".md",
    iconName: "Untitled.md",
    iconType: "markdown",
  },
  csv: {
    kind: "csv",
    group: "primary",
    order: 20,
    defaultEnabled: true,
    extension: ".csv",
    iconName: "Untitled.csv",
    iconType: "spreadsheet",
  },
  html: {
    kind: "html",
    group: "primary",
    order: 30,
    defaultEnabled: true,
    extension: ".html",
    iconName: "Untitled.html",
    iconType: "html",
  },
  contextMap: {
    kind: "contextMap",
    group: "custom",
    order: 10,
    defaultEnabled: true,
    experimentalSetting: "enableContextMaps",
    extension: ".contextmap",
    iconName: "Untitled.contextmap",
    iconType: "context-map",
  },
  text: {
    kind: "text",
    group: "custom",
    order: 20,
    defaultEnabled: false,
    extension: ".txt",
    iconName: "Untitled.txt",
    iconType: "text",
  },
  json: {
    kind: "json",
    group: "custom",
    order: 30,
    defaultEnabled: false,
    extension: ".json",
    iconName: "Untitled.json",
    iconType: "json",
  },
  slides: {
    kind: "slides",
    group: "custom",
    order: 40,
    defaultEnabled: true,
    extension: ".puppyoneapp",
    iconName: "Untitled Slides.puppyoneapp",
    iconType: "app",
  },
  app: {
    kind: "app",
    group: "custom",
    order: 50,
    defaultEnabled: false,
    extension: ".puppyoneapp",
    iconName: "Untitled.puppyoneapp",
    iconType: "app",
  },
  puppyflow: {
    kind: "puppyflow",
    group: "custom",
    order: 60,
    defaultEnabled: false,
    experimentalSetting: "enablePuppyFlowFiles",
    extension: ".puppyflow",
    iconName: "Untitled.puppyflow",
    iconType: "workflow",
  },
} as const satisfies Record<CreateEntryMenuItemKind, CreateEntryMenuItemDefinition>;

export const PRIMARY_CREATE_ENTRY_KINDS = CREATE_NEW_ITEM_IDS
  .filter((kind) => CREATE_ENTRY_MENU_ITEM_REGISTRY[kind].group === "primary")
  .sort((left, right) => (
    CREATE_ENTRY_MENU_ITEM_REGISTRY[left].order - CREATE_ENTRY_MENU_ITEM_REGISTRY[right].order
  ));

export function getCreateEntryMenuItem(
  kind: CreateEntryMenuItemKind,
): CreateEntryMenuItemDefinition {
  return CREATE_ENTRY_MENU_ITEM_REGISTRY[kind];
}

export function getDefaultCreateNewMenuItems(): Array<{
  kind: CreateNewItemId;
  enabled: true;
}> {
  return CREATE_NEW_ITEM_IDS.flatMap((kind) => (
    CREATE_ENTRY_MENU_ITEM_REGISTRY[kind].defaultEnabled ? [{ kind, enabled: true }] : []
  ));
}

export function getConfiguredCreateEntryMenuItems(
  kinds: readonly CreateNewItemId[],
  group: Exclude<CreateEntryMenuGroup, "folder">,
): CreateEntryMenuItemDefinition[] {
  const configuredKinds = new Set(kinds);
  if (group === "primary") {
    return PRIMARY_CREATE_ENTRY_KINDS
      .filter((kind) => configuredKinds.has(kind))
      .map((kind) => getCreateEntryMenuItem(kind));
  }

  return Array.from(configuredKinds)
    .map((kind) => getCreateEntryMenuItem(kind))
    .filter((item) => item.group === group);
}
