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

export type AuxiliaryWorkbenchContribution = Readonly<{
  kind: string;
  label: string;
  createLabel: string;
  initialSnapshot: AuxiliaryWorkbenchItemSnapshot;
  maximumItems?: number;
  minimumSize: WorkbenchSplitMinimumSize;
  /** Resolve feature code and creation prerequisites before topology commits. */
  prepare?: () => Promise<void>;
  renderItem: (context: AuxiliaryWorkbenchItemRenderContext) => ReactNode;
  requestClose: (item: AuxiliaryWorkbenchItem) => Promise<boolean>;
}>;
