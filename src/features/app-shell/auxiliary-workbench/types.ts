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

export type AuxiliaryWorkbenchCreationRecipe = Readonly<{
  id: string;
  label: string;
  iconKey: string | null;
  status: "available" | "unavailable" | "coming-soon";
}>;

export type AuxiliaryWorkbenchPreparationContext = Readonly<{
  item: AuxiliaryWorkbenchItem;
  recipe: AuxiliaryWorkbenchCreationRecipe | null;
}>;

export type AuxiliaryWorkbenchContribution = Readonly<{
  kind: string;
  label: string;
  createLabel: string;
  initialSnapshot: AuxiliaryWorkbenchItemSnapshot;
  maximumItems?: number;
  minimumSize: WorkbenchSplitMinimumSize;
  creationRecipes?: readonly AuxiliaryWorkbenchCreationRecipe[];
  /** Resolve feature code and creation prerequisites before topology commits. */
  prepare?: (context: AuxiliaryWorkbenchPreparationContext) => Promise<void>;
  /** Dispose feature state prepared for an Item that admission never committed. */
  discardPreparedItem?: (context: AuxiliaryWorkbenchPreparationContext) => void | Promise<void>;
  renderItem: (context: AuxiliaryWorkbenchItemRenderContext) => ReactNode;
  requestClose: (item: AuxiliaryWorkbenchItem) => Promise<boolean>;
}>;
