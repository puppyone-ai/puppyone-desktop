/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopBillingCatalog,
  DesktopBillingOperation,
  DesktopBillingPlan,
  DesktopBillingQuote,
  DesktopBillingSummary,
  DesktopBillingUsage,
  DesktopCloudSession,
} from "../src/lib/cloudApi";
import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_TIMEOUT_MS,
  type CloudBillingControllerDependencies,
  useCloudBillingController,
} from "../src/features/cloud/billing/useCloudBillingController";
import { testT } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  user_id: "user-a",
  user_email: "a@example.com",
  api_base_url: "https://cloud.example/api/v1",
  session_generation: "generation-a",
  expires_in: 3600,
  expires_at: 0,
  status: "authenticated",
} satisfies DesktopCloudSession;

const plan: DesktopBillingPlan = {
  id: "plus",
  aliases: [],
  name: "Plus",
  description: "Plus plan",
  public: true,
  purchasable: true,
  highlighted: true,
  currency: "USD",
  interval: "month",
  price_per_seat_cents: 1800,
  seats: { minimum: 1, maximum: 14 },
  features: {},
  fixed_limits: {},
  per_seat_limits: {},
  allow: {},
  runtime: { fixed_units: 0, units_per_seat: 100 },
};

const catalog: DesktopBillingCatalog = {
  schema_version: "1.0",
  catalog_version: "2026-07-15.1",
  effective_at: "2026-07-15T00:00:00Z",
  currency: "USD",
  plans: [plan],
  runtime: {
    top_ups_enabled: false,
    overage_enabled: false,
    unit_seconds: 60,
    minimum_units: 1,
    overage_price_cents_per_unit: 0,
    profiles: [],
    top_up_packs: [],
  },
};

function summary(orgId: string, revision = 1): DesktopBillingSummary {
  return {
    org_id: orgId,
    plan_id: "plus",
    status: "active",
    seat_quantity: 2,
    pending_plan_id: null,
    cancel_at_period_end: false,
    current_period_end: null,
    catalog_version: catalog.catalog_version,
    source_revision: revision,
    portal_available: true,
    seat_changes_available: true,
    runtime_available_units: 100,
    runtime_reserved_units: 0,
    runtime_overage_enabled: false,
    runtime_monthly_limit_cents: 0,
  };
}

function usage(orgId: string): DesktopBillingUsage {
  return {
    runtime: {
      org_id: orgId,
      available_units: 100,
      reserved_units: 0,
      granted_units: 100,
      consumed_units: 0,
      postpaid_available_units: 0,
      postpaid_consumed_units: 0,
      buckets: [],
    },
    storage: {
      logical_bytes: 0,
      limit_bytes: 1000,
      percent: 0,
      threshold_percent: 0,
      version: 1,
    },
  };
}

function quote(orgId: string): DesktopBillingQuote {
  return {
    quote_id: `quote-${orgId}`,
    org_id: orgId,
    kind: "plan",
    current_plan_id: "free",
    target_plan_id: "plus",
    current_seats: 1,
    target_seats: 2,
    currency: "USD",
    current_amount_cents: 0,
    target_amount_cents: 3600,
    delta_amount_cents: 3600,
    application_mode: "checkout",
    requires_confirmation: true,
    catalog_version: catalog.catalog_version,
    expires_at: "2026-07-16T00:00:00Z",
    details: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dependencies(): CloudBillingControllerDependencies {
  return {
    getCatalog: vi.fn().mockResolvedValue(catalog),
    getSummary: vi.fn().mockImplementation(async (_session, orgId: string) => summary(orgId)),
    getUsage: vi.fn().mockImplementation(async (_session, orgId: string) => usage(orgId)),
    listOperations: vi.fn().mockResolvedValue([]),
    quotePlan: vi.fn().mockImplementation(async (_session, orgId: string) => quote(orgId)),
    quoteSeats: vi.fn().mockImplementation(async (_session, orgId: string) => quote(orgId)),
    createCheckout: vi.fn().mockImplementation(async (_session, orgId: string) => ({
      checkout_id: `checkout-${orgId}`,
      checkout_url: "https://checkout.example/session",
      quote: quote(orgId),
    })),
    applyPlanChange: vi.fn().mockImplementation(async (_session, orgId: string) => quote(orgId)),
    applySeatChange: vi.fn().mockImplementation(async (_session, orgId: string) => quote(orgId)),
    createPortal: vi.fn().mockResolvedValue({ portal_url: "https://portal.example", expires_at: null }),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    createIdempotencyKey: vi.fn()
      .mockImplementation((scope: string) => `desktop:${scope}:${crypto.randomUUID()}`),
    now: () => Date.now(),
  };
}

function Probe({
  activeSession = session,
  apiBaseUrl,
  organizationId = "org-a",
  enabled = true,
  deps,
}: {
  activeSession?: DesktopCloudSession;
  apiBaseUrl?: string | null;
  organizationId?: string | null;
  enabled?: boolean;
  deps: CloudBillingControllerDependencies;
}) {
  const billing = useCloudBillingController({
    session: activeSession,
    apiBaseUrl: apiBaseUrl === undefined ? activeSession.api_base_url : apiBaseUrl,
    organizationId,
    enabled,
    onSessionChange: React.useCallback(() => undefined, []),
    t: testT,
  }, deps);
  return (
    <div
      data-context={billing.state.contextKey}
      data-org={billing.state.summary?.org_id ?? ""}
      data-revision={billing.state.summary?.source_revision ?? ""}
      data-quote={billing.state.quote?.quote_id ?? ""}
      data-loading={billing.state.loading ? "true" : "false"}
      data-polling={billing.state.polling ? "true" : "false"}
      data-error={billing.state.actionError ?? billing.state.error ?? ""}
    >
      <button type="button" data-action="refresh" onClick={() => void billing.refresh()}>refresh</button>
      <button type="button" data-action="quote" onClick={() => void billing.quotePlan(plan)}>quote</button>
      <button type="button" data-action="confirm" onClick={() => void billing.confirmQuote()}>confirm</button>
    </div>
  );
}

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useCloudBillingController", () => {
  it("discards an old account response and resets quote/idempotency state on context change", async () => {
    const deps = dependencies();
    const oldSummary = deferred<DesktopBillingSummary>();
    vi.mocked(deps.getSummary)
      .mockReturnValueOnce(oldSummary.promise)
      .mockImplementation(async (_activeSession, orgId: string) => summary(orgId));

    await act(async () => root?.render(<Probe deps={deps} />));
    const nextSession = {
      ...session,
      user_id: "user-b",
      user_email: "b@example.com",
      session_generation: "generation-b",
    };
    await act(async () => root?.render(
      <Probe activeSession={nextSession} organizationId="org-b" deps={deps} />,
    ));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-b"));

    await act(async () => oldSummary.resolve(summary("org-a")));
    expect(container.firstElementChild?.getAttribute("data-org")).toBe("org-b");

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-quote"))
      .toBe("quote-org-b"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-polling"))
      .toBe("true"));

    await act(async () => root?.render(<Probe organizationId="org-c" deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-c"));
    expect(container.firstElementChild?.getAttribute("data-quote")).toBe("");
    expect(container.firstElementChild?.getAttribute("data-polling")).toBe("false");
  });

  it("treats the API host as a request epoch boundary", async () => {
    const deps = dependencies();
    const oldSummary = deferred<DesktopBillingSummary>();
    vi.mocked(deps.getSummary)
      .mockReturnValueOnce(oldSummary.promise)
      .mockResolvedValue(summary("org-a", 2));

    await act(async () => root?.render(
      <Probe apiBaseUrl="https://old-cloud.example/api/v1" deps={deps} />,
    ));
    await act(async () => root?.render(
      <Probe apiBaseUrl="https://new-cloud.example/api/v1" deps={deps} />,
    ));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-revision"))
      .toBe("2"));

    await act(async () => oldSummary.resolve(summary("org-a", 99)));
    expect(container.firstElementChild?.getAttribute("data-revision")).toBe("2");
    expect(container.firstElementChild?.getAttribute("data-context"))
      .toContain("https://new-cloud.example/api/v1");
  });

  it("rejects an old action even if the same context is disabled and re-enabled", async () => {
    const deps = dependencies();
    const oldQuote = deferred<DesktopBillingQuote>();
    vi.mocked(deps.quotePlan).mockReturnValueOnce(oldQuote.promise);

    await act(async () => root?.render(<Probe deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await act(async () => root?.render(<Probe enabled={false} deps={deps} />));
    await act(async () => root?.render(<Probe deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));

    await act(async () => oldQuote.resolve(quote("org-a")));
    expect(container.firstElementChild?.getAttribute("data-quote")).toBe("");
  });

  it("coalesces overlapping poll ticks into one active request and one trailing refresh", async () => {
    vi.useFakeTimers();
    const deps = dependencies();
    const slowSummary = deferred<DesktopBillingSummary>();

    await act(async () => root?.render(<Probe deps={deps} />));
    await act(async () => vi.runOnlyPendingTimersAsync());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await act(async () => vi.runOnlyPendingTimersAsync());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-quote"))
      .toBe("quote-org-a"));

    vi.mocked(deps.getSummary).mockReturnValueOnce(slowSummary.promise);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());
    await act(async () => Promise.resolve());
    expect(container.firstElementChild?.getAttribute("data-polling")).toBe("true");
    expect(deps.getSummary).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(BILLING_POLL_INTERVAL_MS * 3));
    expect(deps.getSummary).toHaveBeenCalledTimes(2);

    await act(async () => slowSummary.resolve(summary("org-a")));
    await act(async () => Promise.resolve());
    expect(deps.getSummary).toHaveBeenCalledTimes(3);
  });

  it("stops polling after the authoritative revision reaches the quoted target", async () => {
    vi.useFakeTimers();
    const deps = dependencies();

    await act(async () => root?.render(<Probe deps={deps} />));
    await act(async () => vi.runOnlyPendingTimersAsync());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await act(async () => vi.runOnlyPendingTimersAsync());
    vi.mocked(deps.getSummary).mockResolvedValueOnce(summary("org-a", 2));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());
    await act(async () => vi.runOnlyPendingTimersAsync());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-polling"))
      .toBe("false"));

    const completedCalls = vi.mocked(deps.getSummary).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(BILLING_POLL_INTERVAL_MS * 2));
    expect(deps.getSummary).toHaveBeenCalledTimes(completedCalls);
  });

  it("keeps the mutation idempotency key stable for retry but rotates it with context", async () => {
    const deps = dependencies();
    vi.mocked(deps.quotePlan)
      .mockRejectedValueOnce(new Error("retry"))
      .mockImplementation(async (_activeSession, orgId: string) => quote(orgId));

    await act(async () => root?.render(<Probe deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-error"))
      .toContain("retry"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-quote"))
      .toBe("quote-org-a"));

    const firstKey = vi.mocked(deps.quotePlan).mock.calls[0]?.[4];
    const retryKey = vi.mocked(deps.quotePlan).mock.calls[1]?.[4];
    expect(retryKey).toBe(firstKey);

    await act(async () => root?.render(<Probe organizationId="org-b" deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-b"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-quote"))
      .toBe("quote-org-b"));
    const nextContextKey = vi.mocked(deps.quotePlan).mock.calls[2]?.[4];
    expect(nextContextKey).not.toBe(firstKey);
  });

  it("keeps an apply idempotency key stable when confirmation is retried", async () => {
    const deps = dependencies();
    const planChangeQuote = { ...quote("org-a"), application_mode: "plan_change" as const };
    vi.mocked(deps.quotePlan).mockResolvedValue(planChangeQuote);
    vi.mocked(deps.applyPlanChange)
      .mockRejectedValueOnce(new Error("provider timeout"))
      .mockResolvedValue(planChangeQuote);

    await act(async () => root?.render(<Probe deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-quote"))
      .toBe("quote-org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-error"))
      .toContain("provider timeout"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());
    await vi.waitFor(() => expect(deps.applyPlanChange).toHaveBeenCalledTimes(2));

    expect(vi.mocked(deps.applyPlanChange).mock.calls[1]?.[3])
      .toBe(vi.mocked(deps.applyPlanChange).mock.calls[0]?.[3]);
  });

  it("ignores a completed checkout after its account context was replaced", async () => {
    const deps = dependencies();
    const checkout = deferred<Awaited<ReturnType<typeof deps.createCheckout>>>();
    vi.mocked(deps.createCheckout).mockReturnValueOnce(checkout.promise);

    await act(async () => root?.render(<Probe deps={deps} />));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-quote"))
      .toBe("quote-org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());

    const nextSession = {
      ...session,
      user_id: "user-b",
      user_email: "b@example.com",
      session_generation: "generation-b",
    };
    await act(async () => root?.render(
      <Probe activeSession={nextSession} organizationId="org-b" deps={deps} />,
    ));
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-b"));
    await act(async () => checkout.resolve({
      checkout_id: "checkout-org-a",
      checkout_url: "https://checkout.example/session",
      quote: quote("org-a"),
    }));

    expect(container.firstElementChild?.getAttribute("data-org")).toBe("org-b");
    expect(container.firstElementChild?.getAttribute("data-polling")).toBe("false");
    expect(container.firstElementChild?.getAttribute("data-quote")).toBe("");
    expect(deps.openExternalUrl).not.toHaveBeenCalled();
  });

  it("ends polling with a retryable error after the confirmation deadline", async () => {
    vi.useFakeTimers();
    const deps = dependencies();

    await act(async () => root?.render(<Probe deps={deps} />));
    await act(async () => vi.runOnlyPendingTimersAsync());
    await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-org"))
      .toBe("org-a"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="quote"]')?.click());
    await act(async () => vi.runOnlyPendingTimersAsync());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click());
    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(container.firstElementChild?.getAttribute("data-polling")).toBe("true");

    await act(async () => vi.advanceTimersByTimeAsync(
      BILLING_POLL_TIMEOUT_MS + BILLING_POLL_INTERVAL_MS,
    ));
    expect(container.firstElementChild?.getAttribute("data-polling")).toBe("false");
    expect(container.firstElementChild?.getAttribute("data-error"))
      .toContain("taking longer than expected");
  });
});
