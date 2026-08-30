import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuxiliaryWorkbenchItem } from "@puppyone/shared-ui";
import type {
  AuxiliaryWorkbenchContribution,
  AuxiliaryWorkbenchCreationRecipe,
  AuxiliaryWorkbenchPreparationContext,
} from "./types";

export type AuxiliaryWorkbenchCreationFailure = Readonly<{
  kind: string;
  label: string;
}>;

type UseAuxiliaryWorkbenchContributionsOptions = Readonly<{
  contributions: readonly AuxiliaryWorkbenchContribution[];
  items: readonly AuxiliaryWorkbenchItem[];
  onReserve: (contribution: AuxiliaryWorkbenchContribution) => AuxiliaryWorkbenchItem;
  onCommit: (
    contribution: AuxiliaryWorkbenchContribution,
    item: AuxiliaryWorkbenchItem,
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
  onReserve,
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
  const onReserveRef = useRef(onReserve);
  const preparingKindsRef = useRef(new Set<string>());
  contributionByKindRef.current = contributionByKind;
  itemsRef.current = items;
  onCommitRef.current = onCommit;
  onReserveRef.current = onReserve;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canCreate = useCallback((
    contribution: AuxiliaryWorkbenchContribution,
    recipe: AuxiliaryWorkbenchCreationRecipe | null = null,
  ) => (
    contributionByKindRef.current.get(contribution.kind) === contribution
    && isRegisteredAvailableRecipe(contribution, recipe)
    && !preparingKindsRef.current.has(contribution.kind)
    && countItemsOfKind(itemsRef.current, contribution.kind)
      < (contribution.maximumItems ?? Number.POSITIVE_INFINITY)
  ), []);

  const create = useCallback(async (
    contribution: AuxiliaryWorkbenchContribution,
    targetGroupId: string | null,
    recipe: AuxiliaryWorkbenchCreationRecipe | null = null,
  ): Promise<string | null> => {
    if (!canCreate(contribution, recipe)) return null;
    preparingKindsRef.current.add(contribution.kind);
    setPreparingKinds(new Set(preparingKindsRef.current));
    setCreationFailure((current) => current?.kind === contribution.kind ? null : current);
    let preparation: AuxiliaryWorkbenchPreparationContext | null = null;
    let committed = false;
    try {
      const item = onReserveRef.current(contribution);
      preparation = Object.freeze({ item, recipe });
      await contribution.prepare?.(preparation);
      if (
        !mountedRef.current
        || contributionByKindRef.current.get(contribution.kind) !== contribution
        || !isRegisteredAvailableRecipe(contribution, recipe)
        || countItemsOfKind(itemsRef.current, contribution.kind)
          >= (contribution.maximumItems ?? Number.POSITIVE_INFINITY)
      ) return null;
      const itemId = onCommitRef.current(contribution, preparation.item, targetGroupId);
      committed = true;
      return itemId;
    } catch {
      if (mountedRef.current) {
        setCreationFailure(Object.freeze({
          kind: contribution.kind,
          label: contribution.label,
        }));
      }
      return null;
    } finally {
      if (!committed && preparation) {
        try {
          await contribution.discardPreparedItem?.(preparation);
        } catch {
          // Admission cleanup is best-effort and must not replace the original failure.
        }
      }
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

function isRegisteredAvailableRecipe(
  contribution: AuxiliaryWorkbenchContribution,
  recipe: AuxiliaryWorkbenchCreationRecipe | null,
) {
  if (!recipe) return contribution.creationRecipes === undefined;
  return contribution.creationRecipes?.includes(recipe) === true
    && recipe.status === "available";
}
