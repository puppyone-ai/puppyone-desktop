import type { ReactNode } from "react";
import type {
  AuxiliaryWorkbenchItem,
  WorkbenchSplitMinimumSize,
} from "@puppyone/shared-ui";

export type AuxiliaryWorkbenchPresentationState = Readonly<{
  sidebarVisible: boolean;
  presented: boolean;
  commandTarget: boolean;
  domFocused: boolean;
}>;

export type AuxiliaryWorkbenchItemSnapshot = Readonly<{
  title: string;
  accessibleLabel: string;
  detail: string | null;
  /** Product mark rendered by generic Workbench chrome. */
  iconKey: string | null;
  status: "idle" | "selecting" | "starting" | "running" | "exited" | "error";
  running: boolean;
  /** Feature-owned native resource identity, never part of the topology. */
  resourceId: string | null;
}>;

export type AuxiliaryWorkbenchItemRenderContext = Readonly<{
  item: AuxiliaryWorkbenchItem;
  presentation: AuxiliaryWorkbenchPresentationState;
  peerSnapshots: ReadonlyMap<string, AuxiliaryWorkbenchItemSnapshot>;
  onPresentationChange: (snapshot: AuxiliaryWorkbenchItemSnapshot) => void;
}>;

/**
 * Opaque resource chosen from a contribution-owned history browser.
 * Workbench transports the target but never interprets a Harness session id.
 */
export type AuxiliaryWorkbenchHistoryTarget = Readonly<{
  id: string;
  title: string;
  iconKey: string | null;
  payload: unknown;
}>;

export type AuxiliaryWorkbenchHistoryBrowserContext = Readonly<{
  instanceId: string;
  rootId: string;
  rootPath: string;
  excludedResourceIds: readonly string[];
  openingTargetId: string | null;
  onBack: () => void;
  onOpen: (target: AuxiliaryWorkbenchHistoryTarget) => void;
}>;

export type AuxiliaryWorkbenchHistoryContribution = Readonly<{
  label: string;
  iconKey: string | null;
  renderBrowser: (context: AuxiliaryWorkbenchHistoryBrowserContext) => ReactNode;
}>;

export type AuxiliaryWorkbenchCreationRecipe = Readonly<{
  id: string;
  label: string;
  iconKey: string | null;
  status: "available" | "unavailable" | "coming-soon";
}>;

export type AuxiliaryWorkbenchPreparationContext = Readonly<{
  item: AuxiliaryWorkbenchItem;
  recipe: AuxiliaryWorkbenchCreationRecipe | null;
  historyTarget: AuxiliaryWorkbenchHistoryTarget | null;
}>;

export type AuxiliaryWorkbenchContribution = Readonly<{
  kind: string;
  label: string;
  createLabel: string;
  initialSnapshot: AuxiliaryWorkbenchItemSnapshot;
  maximumItems?: number;
  minimumSize: WorkbenchSplitMinimumSize;
  creationRecipes?: readonly AuxiliaryWorkbenchCreationRecipe[];
  /** Optional feature-owned browser for explicitly restoring durable resources. */
  history?: AuxiliaryWorkbenchHistoryContribution;
  /** Resolve feature code and creation prerequisites before topology commits. */
  prepare?: (context: AuxiliaryWorkbenchPreparationContext) => Promise<void>;
  /** Dispose feature state prepared for an Item that admission never committed. */
  discardPreparedItem?: (context: AuxiliaryWorkbenchPreparationContext) => void | Promise<void>;
  renderItem: (context: AuxiliaryWorkbenchItemRenderContext) => ReactNode;
  requestClose: (item: AuxiliaryWorkbenchItem) => Promise<boolean>;
}>;
