import { useCallback, useEffect, useMemo, useState } from "react";
import type { MessageFormatter } from "@puppyone/localization/core";
import type { AuxiliaryWorkbenchItem } from "@puppyone/shared-ui";
import type {
  AuxiliaryWorkbenchContribution,
  AuxiliaryWorkbenchItemSnapshot,
} from "../../app-shell/auxiliary-workbench/types";
import { presentTerminalSessionHeader } from "../model/terminalSessionHeader";
import type { DesktopTerminalSession } from "../model/terminalSessions";
import type { TerminalRuntimePool } from "./TerminalRuntimePool";
import type { TerminalWorkbenchHeaderItem } from "./TerminalWorkbenchHeader.types";
import { TERMINAL_WORKBENCH_ITEM_KIND } from "./useTerminalWorkbench";

type UseTerminalWorkbenchSnapshotsOptions = Readonly<{
  contributions: ReadonlyMap<string, AuxiliaryWorkbenchContribution>;
  items: readonly AuxiliaryWorkbenchItem[];
  runtimeRegistry: TerminalRuntimePool;
  terminalById: ReadonlyMap<string, DesktopTerminalSession>;
  t: MessageFormatter;
}>;

export function useTerminalWorkbenchSnapshots({
  contributions,
  items,
  runtimeRegistry,
  terminalById,
  t,
}: UseTerminalWorkbenchSnapshotsOptions) {
  const [featureSnapshots, setFeatureSnapshots] = useState<ReadonlyMap<
    string,
    AuxiliaryWorkbenchItemSnapshot
  >>(() => new Map());
  const itemIds = useMemo(() => items.map(({ id }) => id), [items]);

  useEffect(() => {
    const retained = new Set(itemIds);
    setFeatureSnapshots((current) => {
      if (Array.from(current.keys()).every((itemId) => retained.has(itemId))) return current;
      return new Map(Array.from(current.entries()).filter(([itemId]) => retained.has(itemId)));
    });
  }, [itemIds]);

  const snapshotById = useMemo(() => {
    const snapshots = new Map(featureSnapshots);
    for (const item of items) {
      if (item.kind !== TERMINAL_WORKBENCH_ITEM_KIND) {
        const contribution = contributions.get(item.kind);
        if (!snapshots.has(item.id) && contribution) {
          snapshots.set(item.id, contribution.initialSnapshot);
        }
        continue;
      }
      const session = terminalById.get(item.id);
      if (!session) continue;
      const presentation = presentTerminalSessionHeader(session, item.rootId, t);
      snapshots.set(item.id, Object.freeze({
        title: presentation.pathLabel,
        accessibleLabel: presentation.accessibleLabel,
        detail: presentation.overflowDetail,
        status: session.status,
        running: session.status === "running",
        resourceId: null,
      }));
    }
    return snapshots;
  }, [contributions, featureSnapshots, items, t, terminalById]);

  const headerItems = useMemo<TerminalWorkbenchHeaderItem[]>(() => items.flatMap((item) => {
    const snapshot = snapshotById.get(item.id);
    if (!snapshot) return [];
    const terminalSession = terminalById.get(item.id) ?? null;
    return [Object.freeze({
      id: item.id,
      kind: item.kind,
      snapshot,
      terminalSession,
      terminalRuntime: terminalSession?.status === "selecting"
        ? null
        : runtimeRegistry.get(item.id),
    })];
  }), [items, runtimeRegistry, snapshotById, terminalById]);

  const setInitialSnapshot = useCallback((
    itemId: string,
    snapshot: AuxiliaryWorkbenchItemSnapshot,
  ) => {
    setFeatureSnapshots((current) => {
      if (current.has(itemId)) return current;
      const next = new Map(current);
      next.set(itemId, snapshot);
      return next;
    });
  }, []);
  const updateSnapshot = useCallback((
    itemId: string,
    snapshot: AuxiliaryWorkbenchItemSnapshot,
  ) => {
    setFeatureSnapshots((current) => {
      const previous = current.get(itemId);
      if (previous && sameSnapshot(previous, snapshot)) return current;
      const next = new Map(current);
      next.set(itemId, snapshot);
      return next;
    });
  }, []);

  return { headerItems, itemIds, setInitialSnapshot, snapshotById, updateSnapshot };
}

function sameSnapshot(
  left: AuxiliaryWorkbenchItemSnapshot,
  right: AuxiliaryWorkbenchItemSnapshot,
) {
  return left.title === right.title
    && left.accessibleLabel === right.accessibleLabel
    && left.detail === right.detail
    && left.status === right.status
    && left.running === right.running
    && left.resourceId === right.resourceId;
}
