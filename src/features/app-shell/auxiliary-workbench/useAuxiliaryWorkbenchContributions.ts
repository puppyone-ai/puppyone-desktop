import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuxiliaryWorkbenchItem } from "@puppyone/shared-ui";
import type { AuxiliaryWorkbenchContribution } from "./types";

export type AuxiliaryWorkbenchCreationFailure = Readonly<{
  kind: string;
  label: string;
}>;

type UseAuxiliaryWorkbenchContributionsOptions = Readonly<{
  contributions: readonly AuxiliaryWorkbenchContribution[];
  items: readonly AuxiliaryWorkbenchItem[];
  onCommit: (
    contribution: AuxiliaryWorkbenchContribution,
    targetGroupId: string | null,
  ) => string;
}>;

/**
 * Owns admission and asynchronous preparation around the pure topology.
 * A contribution is committed only after its current registration is ready.
 */
export function useAuxiliaryWorkbenchContributions({
  contributions,
  items,
  onCommit,
}: UseAuxiliaryWorkbenchContributionsOptions) {
  const contributionByKind = useMemo(
    () => new Map(contributions.map((contribution) => [contribution.kind, contribution])),
    [contributions],
  );
  const [creationFailure, setCreationFailure] =
    useState<AuxiliaryWorkbenchCreationFailure | null>(null);
  const [preparingKinds, setPreparingKinds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const contributionByKindRef = useRef(contributionByKind);
  const itemsRef = useRef(items);
  const mountedRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const preparingKindsRef = useRef(new Set<string>());
  contributionByKindRef.current = contributionByKind;
  itemsRef.current = items;
  onCommitRef.current = onCommit;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canCreate = useCallback((contribution: AuxiliaryWorkbenchContribution) => (
    contributionByKindRef.current.get(contribution.kind) === contribution
    && !preparingKindsRef.current.has(contribution.kind)
    && countItemsOfKind(itemsRef.current, contribution.kind)
      < (contribution.maximumItems ?? Number.POSITIVE_INFINITY)
  ), []);

  const create = useCallback(async (
    contribution: AuxiliaryWorkbenchContribution,
    targetGroupId: string | null,
  ): Promise<string | null> => {
    if (!canCreate(contribution)) return null;
    preparingKindsRef.current.add(contribution.kind);
    setPreparingKinds(new Set(preparingKindsRef.current));
    setCreationFailure((current) => current?.kind === contribution.kind ? null : current);
    try {
      await contribution.prepare?.();
      if (
        !mountedRef.current
        || contributionByKindRef.current.get(contribution.kind) !== contribution
        || countItemsOfKind(itemsRef.current, contribution.kind)
          >= (contribution.maximumItems ?? Number.POSITIVE_INFINITY)
      ) return null;
      return onCommitRef.current(contribution, targetGroupId);
    } catch {
      if (mountedRef.current) {
        setCreationFailure(Object.freeze({
          kind: contribution.kind,
          label: contribution.label,
        }));
      }
      return null;
    } finally {
      preparingKindsRef.current.delete(contribution.kind);
      if (mountedRef.current) setPreparingKinds(new Set(preparingKindsRef.current));
    }
  }, [canCreate]);

  const dismissCreationFailure = useCallback(() => setCreationFailure(null), []);

  return {
    canCreate,
    contributionByKind,
    create,
    creationFailure,
    dismissCreationFailure,
    preparingKinds,
  };
}

function countItemsOfKind(items: readonly AuxiliaryWorkbenchItem[], kind: string) {
  return items.reduce((count, item) => count + (item.kind === kind ? 1 : 0), 0);
}
