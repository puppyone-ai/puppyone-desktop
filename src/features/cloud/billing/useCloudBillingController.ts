import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { MessageFormatter } from "@puppyone/localization/core";
import type {
  DesktopBillingOperation,
  DesktopBillingPlan,
  DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  DEFAULT_CLOUD_BILLING_DEPENDENCIES,
  type CloudBillingControllerDependencies as BillingDependencies,
  type SessionChangeHandler,
} from "./cloudBillingApi";
import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_TIMEOUT_MS,
  actionableSeatOperation as findActionableSeatOperation,
  assertQuoteOrganization,
  billingReducer,
  clampBillingSeats,
  createCloudBillingContextKey,
  createInitialBillingState,
  pendingBillingOperations,
} from "./cloudBillingState";

export {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_TIMEOUT_MS,
  createCloudBillingContextKey,
} from "./cloudBillingState";
export type { CloudBillingControllerDependencies } from "./cloudBillingApi";
export type { CloudBillingControllerState } from "./cloudBillingState";

type UseCloudBillingControllerOptions = {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  organizationId: string | null;
  enabled: boolean;
  onSessionChange: SessionChangeHandler;
  t: MessageFormatter;
};

export function useCloudBillingController(
  {
    session,
    apiBaseUrl,
    organizationId,
    enabled,
    onSessionChange,
    t,
  }: UseCloudBillingControllerOptions,
  dependencies: BillingDependencies = DEFAULT_CLOUD_BILLING_DEPENDENCIES,
) {
  const contextKey = createCloudBillingContextKey(session, apiBaseUrl, organizationId);
  const [storedState, dispatch] = useReducer(
    billingReducer,
    contextKey,
    createInitialBillingState,
  );
  const state = storedState.contextKey === contextKey
    ? storedState
    : createInitialBillingState(contextKey);
  const currentContextRef = useRef(contextKey);
  const currentEnabledRef = useRef(enabled);
  const requestEpochRef = useRef(0);
  const actionEpochRef = useRef(0);
  const activeLoadRef = useRef<{
    contextKey: string;
    epoch: number;
    promise: Promise<void>;
  } | null>(null);
  const trailingRefreshContextRef = useRef<string | null>(null);
  const runLoadRef = useRef<() => Promise<void>>(async () => undefined);
  const idempotencyKeysRef = useRef(new Map<string, string>());

  currentContextRef.current = contextKey;
  currentEnabledRef.current = enabled;

  const isCurrentContext = useCallback((capturedContextKey: string) => (
    currentContextRef.current === capturedContextKey && currentEnabledRef.current
  ), []);
  const isCurrentAction = useCallback((capturedContextKey: string, actionEpoch: number) => (
    isCurrentContext(capturedContextKey) && actionEpochRef.current === actionEpoch
  ), [isCurrentContext]);

  const runLoad = useCallback((): Promise<void> => {
    const capturedContextKey = contextKey;
    const capturedOrganizationId = organizationId;
    if (!enabled || !capturedOrganizationId) return Promise.resolve();

    const activeLoad = activeLoadRef.current;
    if (activeLoad?.contextKey === capturedContextKey) {
      trailingRefreshContextRef.current = capturedContextKey;
      return activeLoad.promise;
    }

    const epoch = ++requestEpochRef.current;
    dispatch({ type: "loadStarted", contextKey: capturedContextKey });
    const promise = Promise.all([
      dependencies.getCatalog(session, onSessionChange, apiBaseUrl),
      dependencies.getSummary(
        session,
        capturedOrganizationId,
        onSessionChange,
        apiBaseUrl,
      ),
      dependencies.getUsage(
        session,
        capturedOrganizationId,
        onSessionChange,
        apiBaseUrl,
      ),
      dependencies.listOperations(
        session,
        capturedOrganizationId,
        onSessionChange,
        apiBaseUrl,
      ),
    ]).then(([catalog, summary, usage, operations]) => {
      if (!isCurrentContext(capturedContextKey) || epoch !== requestEpochRef.current) return;
      if (summary.org_id !== capturedOrganizationId
        || usage.runtime.org_id !== capturedOrganizationId
        || operations.some((operation) => operation.org_id !== capturedOrganizationId)) {
        throw new Error(t("cloud.billing.organizationMismatch"));
      }
      dispatch({
        type: "loadSucceeded",
        contextKey: capturedContextKey,
        result: { catalog, summary, usage, operations },
      });
    }).catch((error: unknown) => {
      if (!isCurrentContext(capturedContextKey) || epoch !== requestEpochRef.current) return;
      dispatch({
        type: "loadFailed",
        contextKey: capturedContextKey,
        error: error instanceof Error ? error.message : t("cloud.billing.loadFailed"),
      });
    }).finally(() => {
      if (activeLoadRef.current?.epoch !== epoch) return;
      activeLoadRef.current = null;
      if (trailingRefreshContextRef.current !== capturedContextKey
        || !isCurrentContext(capturedContextKey)) {
        return;
      }
      trailingRefreshContextRef.current = null;
      queueMicrotask(() => void runLoadRef.current());
    });
    activeLoadRef.current = { contextKey: capturedContextKey, epoch, promise };
    return promise;
  }, [
    apiBaseUrl,
    contextKey,
    dependencies,
    enabled,
    isCurrentContext,
    onSessionChange,
    organizationId,
    session,
    t,
  ]);
  runLoadRef.current = runLoad;

  useEffect(() => {
    currentEnabledRef.current = enabled;
    requestEpochRef.current += 1;
    actionEpochRef.current += 1;
    activeLoadRef.current = null;
    trailingRefreshContextRef.current = null;
    idempotencyKeysRef.current.clear();
    dispatch({ type: "contextChanged", contextKey });
    if (enabled && organizationId) void runLoadRef.current();
    return () => {
      requestEpochRef.current += 1;
      actionEpochRef.current += 1;
      currentEnabledRef.current = false;
      trailingRefreshContextRef.current = null;
    };
  }, [contextKey, enabled, organizationId]);

  useEffect(() => {
    const polling = state.polling;
    if (!polling) return;
    const timer = window.setInterval(() => {
      if (currentContextRef.current !== contextKey) return;
      if (dependencies.now() >= polling.until) {
        dispatch({
          type: "pollExpired",
          contextKey,
          error: t("cloud.billing.confirmationTimeout"),
        });
        return;
      }
      void runLoadRef.current();
    }, BILLING_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [contextKey, dependencies, state.polling, t]);

  const idempotencyKeyFor = useCallback((
    capturedContextKey: string,
    intent: string,
    scope: string,
  ): string => {
    const mapKey = `${capturedContextKey}\u001f${intent}`;
    const existing = idempotencyKeysRef.current.get(mapKey);
    if (existing) return existing;
    const created = dependencies.createIdempotencyKey(scope);
    idempotencyKeysRef.current.set(mapKey, created);
    return created;
  }, [dependencies]);

  const clearIdempotencyKey = useCallback((capturedContextKey: string, intent: string) => {
    idempotencyKeysRef.current.delete(`${capturedContextKey}\u001f${intent}`);
  }, []);

  const refresh = useCallback(() => {
    dispatch({ type: "clearActionError", contextKey });
    return runLoadRef.current();
  }, [contextKey]);

  const setSeatQuantity = useCallback((value: number) => {
    dispatch({ type: "setSeatQuantity", contextKey, value });
  }, [contextKey]);

  const quotePlan = useCallback(async (plan: DesktopBillingPlan) => {
    const capturedContextKey = contextKey;
    const capturedOrganizationId = organizationId;
    if (!enabled || !capturedOrganizationId || !plan.purchasable) return;
    const capturedActionEpoch = ++actionEpochRef.current;
    const seats = clampBillingSeats(state.seatQuantity, plan);
    const intent = `plan-quote:${capturedOrganizationId}:${plan.id}:${seats}`;
    dispatch({
      type: "quoteStarted",
      contextKey: capturedContextKey,
      requestedPlanId: plan.id,
      quotedOperationId: null,
      seatQuantity: seats,
    });
    try {
      const nextQuote = await dependencies.quotePlan(
        session,
        capturedOrganizationId,
        plan.id,
        seats,
        idempotencyKeyFor(capturedContextKey, intent, "plan-quote"),
        onSessionChange,
        apiBaseUrl,
      );
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      assertQuoteOrganization(nextQuote, capturedOrganizationId, t);
      dispatch({ type: "quoteSucceeded", contextKey: capturedContextKey, quote: nextQuote });
      clearIdempotencyKey(capturedContextKey, intent);
    } catch (error) {
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      dispatch({
        type: "actionFailed",
        contextKey: capturedContextKey,
        error: error instanceof Error ? error.message : t("cloud.billing.quoteFailed"),
      });
    } finally {
      if (isCurrentAction(capturedContextKey, capturedActionEpoch)) {
        dispatch({ type: "actionFinished", contextKey: capturedContextKey });
      }
    }
  }, [
    apiBaseUrl,
    clearIdempotencyKey,
    contextKey,
    dependencies,
    enabled,
    idempotencyKeyFor,
    isCurrentAction,
    onSessionChange,
    organizationId,
    session,
    state.seatQuantity,
    t,
  ]);

  const pendingOperations = useMemo(
    () => pendingBillingOperations(state.operations),
    [state.operations],
  );
  const actionableSeatOperation = useMemo(
    () => findActionableSeatOperation(pendingOperations),
    [pendingOperations],
  );

  const quoteSeats = useCallback(async (
    requestedOperation: DesktopBillingOperation | null = null,
  ) => {
    const capturedContextKey = contextKey;
    const capturedOrganizationId = organizationId;
    if (!enabled || !capturedOrganizationId || !state.summary?.seat_changes_available) return;
    const capturedActionEpoch = ++actionEpochRef.current;
    const requestedSeats = requestedOperation?.target_seat_quantity
      ?? Math.max(1, Math.trunc(state.seatQuantity));
    const linkedOperation = requestedOperation ?? pendingOperations.find(
      (operation) => (
        ["member_activation", "member_deactivation"].includes(operation.kind)
        && operation.target_seat_quantity === requestedSeats
      ),
    ) ?? null;
    const intent = `seat-quote:${capturedOrganizationId}:${requestedSeats}:${linkedOperation?.id ?? "manual"}`;
    dispatch({
      type: "quoteStarted",
      contextKey: capturedContextKey,
      requestedPlanId: state.summary.plan_id,
      quotedOperationId: linkedOperation?.id ?? null,
      seatQuantity: requestedSeats,
    });
    try {
      const nextQuote = await dependencies.quoteSeats(
        session,
        capturedOrganizationId,
        requestedSeats,
        idempotencyKeyFor(capturedContextKey, intent, "seat-quote"),
        linkedOperation?.id,
        onSessionChange,
        apiBaseUrl,
      );
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      assertQuoteOrganization(nextQuote, capturedOrganizationId, t);
      dispatch({ type: "quoteSucceeded", contextKey: capturedContextKey, quote: nextQuote });
      clearIdempotencyKey(capturedContextKey, intent);
    } catch (error) {
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      dispatch({
        type: "actionFailed",
        contextKey: capturedContextKey,
        error: error instanceof Error ? error.message : t("cloud.billing.quoteFailed"),
      });
    } finally {
      if (isCurrentAction(capturedContextKey, capturedActionEpoch)) {
        dispatch({ type: "actionFinished", contextKey: capturedContextKey });
      }
    }
  }, [
    apiBaseUrl,
    clearIdempotencyKey,
    contextKey,
    dependencies,
    enabled,
    idempotencyKeyFor,
    isCurrentAction,
    onSessionChange,
    organizationId,
    pendingOperations,
    session,
    state.seatQuantity,
    state.summary,
    t,
  ]);

  const confirmQuote = useCallback(async () => {
    const capturedContextKey = contextKey;
    const capturedOrganizationId = organizationId;
    const capturedQuote = state.quote;
    const capturedSummary = state.summary;
    const capturedOperationId = state.quotedOperationId;
    if (!enabled || !capturedOrganizationId || !capturedSummary || !capturedQuote) return;
    const capturedActionEpoch = ++actionEpochRef.current;
    const intent = `quote-apply:${capturedOrganizationId}:${capturedQuote.application_mode}:${capturedQuote.quote_id}`;
    const mutationKey = idempotencyKeyFor(
      capturedContextKey,
      intent,
      capturedQuote.application_mode,
    );
    dispatch({ type: "actionStarted", contextKey: capturedContextKey, action: "confirm" });
    try {
      if (capturedQuote.application_mode === "checkout") {
        const checkout = await dependencies.createCheckout(
          session,
          capturedOrganizationId,
          {
            planId: capturedQuote.target_plan_id,
            seatQuantity: capturedQuote.target_seats,
            quoteId: capturedQuote.quote_id,
          },
          mutationKey,
          onSessionChange,
          apiBaseUrl,
        );
        if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
        assertQuoteOrganization(checkout.quote, capturedOrganizationId, t);
        await dependencies.openExternalUrl(checkout.checkout_url);
      } else if (capturedQuote.application_mode === "seat_change") {
        const appliedQuote = await dependencies.applySeatChange(
          session,
          capturedOrganizationId,
          capturedQuote.quote_id,
          mutationKey,
          capturedOperationId,
          onSessionChange,
          apiBaseUrl,
        );
        if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
        assertQuoteOrganization(appliedQuote, capturedOrganizationId, t);
      } else {
        const appliedQuote = await dependencies.applyPlanChange(
          session,
          capturedOrganizationId,
          capturedQuote.quote_id,
          mutationKey,
          onSessionChange,
          apiBaseUrl,
        );
        if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
        assertQuoteOrganization(appliedQuote, capturedOrganizationId, t);
      }
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      clearIdempotencyKey(capturedContextKey, intent);
      const startedAt = dependencies.now();
      dispatch({
        type: "mutationSucceeded",
        contextKey: capturedContextKey,
        polling: {
          id: `${capturedContextKey}:${capturedQuote.quote_id}:${startedAt}`,
          until: startedAt + BILLING_POLL_TIMEOUT_MS,
          baselineSourceRevision: capturedSummary.source_revision,
          expectedPlanId: capturedQuote.target_plan_id,
          expectedSeatQuantity: capturedQuote.target_seats,
          operationId: capturedOperationId,
        },
      });
      if (isCurrentContext(capturedContextKey)) void runLoadRef.current();
    } catch (error) {
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      dispatch({
        type: "actionFailed",
        contextKey: capturedContextKey,
        error: error instanceof Error ? error.message : t("cloud.billing.changeFailed"),
      });
    } finally {
      if (isCurrentAction(capturedContextKey, capturedActionEpoch)) {
        dispatch({ type: "actionFinished", contextKey: capturedContextKey });
      }
    }
  }, [
    apiBaseUrl,
    clearIdempotencyKey,
    contextKey,
    dependencies,
    enabled,
    idempotencyKeyFor,
    isCurrentAction,
    isCurrentContext,
    onSessionChange,
    organizationId,
    session,
    state.quote,
    state.quotedOperationId,
    state.summary,
    t,
  ]);

  const openPortal = useCallback(async () => {
    const capturedContextKey = contextKey;
    const capturedOrganizationId = organizationId;
    if (!enabled || !capturedOrganizationId) return;
    const capturedActionEpoch = ++actionEpochRef.current;
    const intent = `portal:${capturedOrganizationId}`;
    dispatch({ type: "actionStarted", contextKey: capturedContextKey, action: "portal" });
    try {
      const portal = await dependencies.createPortal(
        session,
        capturedOrganizationId,
        idempotencyKeyFor(capturedContextKey, intent, "portal"),
        onSessionChange,
        apiBaseUrl,
      );
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      await dependencies.openExternalUrl(portal.portal_url);
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      clearIdempotencyKey(capturedContextKey, intent);
    } catch (error) {
      if (!isCurrentAction(capturedContextKey, capturedActionEpoch)) return;
      dispatch({
        type: "actionFailed",
        contextKey: capturedContextKey,
        error: error instanceof Error ? error.message : t("cloud.billing.portalFailed"),
      });
    } finally {
      if (isCurrentAction(capturedContextKey, capturedActionEpoch)) {
        dispatch({ type: "actionFinished", contextKey: capturedContextKey });
      }
    }
  }, [
    apiBaseUrl,
    clearIdempotencyKey,
    contextKey,
    dependencies,
    enabled,
    idempotencyKeyFor,
    isCurrentAction,
    onSessionChange,
    organizationId,
    session,
    t,
  ]);

  return {
    state,
    pendingOperations,
    actionableSeatOperation,
    refresh,
    setSeatQuantity,
    quotePlan,
    quoteSeats,
    confirmQuote,
    openPortal,
  };
}
