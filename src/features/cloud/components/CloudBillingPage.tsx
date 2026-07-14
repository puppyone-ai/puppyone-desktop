import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Clock3,
  CreditCard,
  Database,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization, type LocalizationContextValue } from "@puppyone/localization/react";
import {
  applyCloudBillingPlanChange,
  applyCloudBillingSeatChange,
  createCloudBillingCheckout,
  createCloudBillingPortal,
  createDesktopBillingIdempotencyKey,
  getCloudBillingCatalog,
  getCloudBillingSummary,
  getCloudBillingUsage,
  listCloudBillingOperations,
  openCloudBillingExternalUrl,
  quoteCloudBillingPlan,
  quoteCloudBillingSeats,
  type DesktopBillingCatalog,
  type DesktopBillingOperation,
  type DesktopBillingPlan,
  type DesktopBillingQuote,
  type DesktopBillingSummary,
  type DesktopBillingUsage,
} from "../../../lib/cloudApi";
import {
  CloudOrganizationPageShell,
  type CloudGlobalPageProps,
  useCloudOrganizationData,
} from "./CloudGlobalPages";

type BillingState = {
  catalog: DesktopBillingCatalog | null;
  summary: DesktopBillingSummary | null;
  usage: DesktopBillingUsage | null;
  operations: DesktopBillingOperation[];
  loading: boolean;
  error: string | null;
};

type CloudBillingPageProps = Omit<CloudGlobalPageProps, "onOpen">;

const EMPTY_BILLING_STATE: BillingState = {
  catalog: null,
  summary: null,
  usage: null,
  operations: [],
  loading: false,
  error: null,
};

export function CloudGlobalBillingPage({
  session,
  apiBaseUrl,
  projects,
  onSessionChange,
}: CloudBillingPageProps) {
  const localization = useLocalization();
  const { t } = localization;
  const orgData = useCloudOrganizationData(session, apiBaseUrl, onSessionChange);
  const organization = orgData.organization;
  const isOwner = orgData.members.some(
    (member) => member.user_id === session.user_id && member.role === "owner",
  );
  const [billing, setBilling] = useState<BillingState>(EMPTY_BILLING_STATE);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [seatQuantity, setSeatQuantity] = useState(1);
  const [quote, setQuote] = useState<DesktopBillingQuote | null>(null);
  const [quotedOperationId, setQuotedOperationId] = useState<string | null>(null);
  const [requestedPlanId, setRequestedPlanId] = useState<string | null>(null);
  const [action, setAction] = useState<"quote" | "confirm" | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollingUntil, setPollingUntil] = useState<number | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());

  const idempotencyKeyFor = (intent: string, scope: string): string => {
    const existing = idempotencyKeys.current.get(intent);
    if (existing) return existing;
    const created = createDesktopBillingIdempotencyKey(scope);
    idempotencyKeys.current.set(intent, created);
    return created;
  };

  const clearIdempotencyKey = (intent: string) => {
    idempotencyKeys.current.delete(intent);
  };

  const loadBilling = useCallback(async () => {
    if (!organization || !isOwner) return;
    setBilling((current) => ({ ...current, loading: true, error: null }));
    try {
      const [catalog, summary, usage, operations] = await Promise.all([
        getCloudBillingCatalog(session, onSessionChange, apiBaseUrl),
        getCloudBillingSummary(session, organization.id, onSessionChange, apiBaseUrl),
        getCloudBillingUsage(session, organization.id, onSessionChange, apiBaseUrl),
        listCloudBillingOperations(session, organization.id, onSessionChange, apiBaseUrl),
      ]);
      if (summary.org_id !== organization.id || usage.runtime.org_id !== organization.id) {
        throw new Error(t("cloud.billing.organizationMismatch"));
      }
      setBilling({ catalog, summary, usage, operations, loading: false, error: null });
      setSeatQuantity((current) => current === 1 ? Math.max(1, summary.seat_quantity) : current);
    } catch (error) {
      setBilling((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : t("cloud.billing.loadFailed"),
      }));
    }
  }, [apiBaseUrl, isOwner, onSessionChange, organization, session, t]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling, refreshRevision]);

  useEffect(() => {
    if (pollingUntil === null) return;
    const tick = () => {
      if (Date.now() >= pollingUntil) {
        setPollingUntil(null);
        return;
      }
      setRefreshRevision((value) => value + 1);
    };
    const timer = window.setInterval(tick, 4000);
    return () => window.clearInterval(timer);
  }, [pollingUntil]);

  const currentPlan = useMemo(
    () => billing.catalog?.plans.find((plan) => plan.id === billing.summary?.plan_id) ?? null,
    [billing.catalog, billing.summary?.plan_id],
  );
  const pendingOperations = billing.operations.filter(
    (operation) => !["confirmed", "canceled", "failed"].includes(operation.status),
  );
  const actionableSeatOperation = pendingOperations.find(
    (operation) => (
      ["member_activation", "member_deactivation"].includes(operation.kind)
      && Number.isSafeInteger(operation.target_seat_quantity)
      && (operation.target_seat_quantity ?? 0) > 0
    ),
  ) ?? null;

  const refresh = () => {
    setActionError(null);
    setRefreshRevision((value) => value + 1);
  };

  const quotePlan = async (plan: DesktopBillingPlan) => {
    if (!organization || !plan.purchasable) return;
    const seats = clampSeats(seatQuantity, plan);
    setSeatQuantity(seats);
    setRequestedPlanId(plan.id);
    setQuote(null);
    setQuotedOperationId(null);
    setActionError(null);
    setAction("quote");
    const intent = `plan-quote:${organization.id}:${plan.id}:${seats}`;
    try {
      setQuote(await quoteCloudBillingPlan(
        session,
        organization.id,
        plan.id,
        seats,
        idempotencyKeyFor(intent, "plan-quote"),
        onSessionChange,
        apiBaseUrl,
      ));
      clearIdempotencyKey(intent);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("cloud.billing.quoteFailed"));
    } finally {
      setAction(null);
    }
  };

  const quoteSeats = async (requestedOperation: DesktopBillingOperation | null = null) => {
    if (!organization || !billing.summary?.seat_changes_available) return;
    const requestedSeats = requestedOperation?.target_seat_quantity
      ?? Math.max(1, Math.trunc(seatQuantity));
    const linkedOperation = requestedOperation ?? pendingOperations.find(
      (operation) => (
        ["member_activation", "member_deactivation"].includes(operation.kind)
        && operation.target_seat_quantity === requestedSeats
      ),
    ) ?? null;
    setSeatQuantity(requestedSeats);
    setRequestedPlanId(billing.summary.plan_id);
    setQuote(null);
    setQuotedOperationId(linkedOperation?.id ?? null);
    setActionError(null);
    setAction("quote");
    const intent = `seat-quote:${organization.id}:${requestedSeats}:${linkedOperation?.id ?? "manual"}`;
    try {
      setQuote(await quoteCloudBillingSeats(
        session,
        organization.id,
        requestedSeats,
        idempotencyKeyFor(intent, "seat-quote"),
        linkedOperation?.id,
        onSessionChange,
        apiBaseUrl,
      ));
      clearIdempotencyKey(intent);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("cloud.billing.quoteFailed"));
    } finally {
      setAction(null);
    }
  };

  const confirmQuote = async () => {
    if (!organization || !billing.summary || !quote) return;
    setActionError(null);
    setAction("confirm");
    const intent = `quote-apply:${organization.id}:${quote.application_mode}:${quote.quote_id}`;
    const mutationKey = idempotencyKeyFor(intent, quote.application_mode);
    try {
      if (quote.application_mode === "checkout") {
        const checkout = await createCloudBillingCheckout(
          session,
          organization.id,
          {
            planId: quote.target_plan_id,
            seatQuantity: quote.target_seats,
            quoteId: quote.quote_id,
          },
          mutationKey,
          onSessionChange,
          apiBaseUrl,
        );
        await openCloudBillingExternalUrl(checkout.checkout_url);
      } else if (quote.application_mode === "seat_change") {
        await applyCloudBillingSeatChange(
          session,
          organization.id,
          quote.quote_id,
          mutationKey,
          quotedOperationId,
          onSessionChange,
          apiBaseUrl,
        );
      } else {
        await applyCloudBillingPlanChange(
          session,
          organization.id,
          quote.quote_id,
          mutationKey,
          onSessionChange,
          apiBaseUrl,
        );
      }
      setQuote(null);
      setQuotedOperationId(null);
      clearIdempotencyKey(intent);
      setPollingUntil(Date.now() + 60_000);
      refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("cloud.billing.changeFailed"));
    } finally {
      setAction(null);
    }
  };

  const openPortal = async () => {
    if (!organization) return;
    setActionError(null);
    setAction("portal");
    const intent = `portal:${organization.id}`;
    try {
      const portal = await createCloudBillingPortal(
        session,
        organization.id,
        idempotencyKeyFor(intent, "portal"),
        onSessionChange,
        apiBaseUrl,
      );
      await openCloudBillingExternalUrl(portal.portal_url);
      clearIdempotencyKey(intent);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("cloud.billing.portalFailed"));
    } finally {
      setAction(null);
    }
  };

  return (
    <CloudOrganizationPageShell
      title={t("cloud.route.cloud-billing.title")}
      description={t("cloud.billing.description", {
        organization: bidiIsolate(organization?.name ?? t("cloud.organization.yours")),
      })}
      actions={(
        <button
          className="desktop-cloud-org-secondary-button"
          type="button"
          onClick={refresh}
          disabled={billing.loading}
        >
          <RefreshCw size={14} />
          <span>{t("cloud.common.refresh")}</span>
        </button>
      )}
    >
      <div className="desktop-cloud-billing-stack">
        {!orgData.loading && !organization && (
          <BillingNotice icon={<ShieldAlert size={16} />} title={t("cloud.billing.noOrganization")} />
        )}
        {!orgData.loading && organization && !isOwner && (
          <BillingNotice
            icon={<ShieldAlert size={16} />}
            title={t("cloud.billing.ownerRequired")}
            detail={t("cloud.billing.ownerRequiredDetail")}
          />
        )}
        {(billing.error || actionError) && (
          <div className="desktop-cloud-org-inline-error standalone">
            <strong>{t("cloud.billing.loadFailed")}</strong>
            <span>{actionError ?? billing.error}</span>
          </div>
        )}
        {pollingUntil !== null && (
          <BillingNotice
            icon={<Clock3 size={16} />}
            title={t("cloud.billing.waitingForAuthority")}
            detail={t("cloud.billing.waitingForAuthorityDetail")}
          />
        )}

        {billing.summary && currentPlan && (
          <section className="desktop-cloud-billing-current">
            <div className="desktop-cloud-billing-current-main">
              <div>
                <div className="desktop-cloud-billing-title-row">
                  <span>{t("cloud.billing.currentPlan")}</span>
                  <h2>{currentPlan.name}</h2>
                  <em>{billing.summary.status}</em>
                </div>
                <p>{currentPlan.description}</p>
              </div>
              <div className="desktop-cloud-billing-price">
                <strong>{formatMonthlyTotal(currentPlan, billing.summary.seat_quantity, localization)}</strong>
                <span>{currentPlan.interval === "month" ? t("cloud.billing.perMonth") : ""}</span>
                <small>{t("cloud.billing.currentSeats", { count: billing.summary.seat_quantity })}</small>
              </div>
            </div>
            <div className="desktop-cloud-billing-summary">
              <span className="desktop-cloud-plan-feature"><Check size={14} />{t("cloud.billing.catalogVersion", { version: billing.summary.catalog_version })}</span>
              <span className="desktop-cloud-plan-feature"><Check size={14} />{t("cloud.billing.sourceRevision", { revision: billing.summary.source_revision })}</span>
              {billing.summary.pending_plan_id && (
                <span className="desktop-cloud-plan-feature"><Clock3 size={14} />{t("cloud.billing.pendingPlan", { plan: billing.summary.pending_plan_id })}</span>
              )}
              {billing.summary.cancel_at_period_end && (
                <span className="desktop-cloud-plan-feature"><Clock3 size={14} />{t("cloud.billing.cancelPending")}</span>
              )}
              {billing.summary.portal_available && (
                <button className="desktop-cloud-billing-inline-action" type="button" onClick={() => void openPortal()} disabled={action !== null}>
                  {t("cloud.billing.managePortal")} <ExternalLink size={12} />
                </button>
              )}
            </div>
          </section>
        )}

        {billing.usage && (
          <section className="desktop-cloud-billing-usage-grid">
            <UsageCard
              icon={<Zap size={16} />}
              title={t("cloud.billing.runtimeUsage")}
              value={t("cloud.billing.runtimeAvailable", { count: billing.usage.runtime.available_units })}
              detail={t("cloud.billing.runtimeDetail", {
                consumed: billing.usage.runtime.consumed_units,
                reserved: billing.usage.runtime.reserved_units,
              })}
              percent={ratioPercent(
                billing.usage.runtime.consumed_units,
                billing.usage.runtime.granted_units,
              )}
            />
            <UsageCard
              icon={<Database size={16} />}
              title={t("cloud.billing.storageUsage")}
              value={formatBytes(billing.usage.storage.logical_bytes, localization)}
              detail={billing.usage.storage.limit_bytes === null
                ? t("cloud.billing.unlimited")
                : t("cloud.billing.storageLimit", {
                  limit: formatBytes(billing.usage.storage.limit_bytes, localization),
                })}
              percent={billing.usage.storage.percent}
              warning={billing.usage.storage.threshold_percent >= 80}
            />
          </section>
        )}

        {billing.catalog && billing.summary && (
          <section className="desktop-cloud-billing-options">
            <div className="desktop-cloud-billing-options-header">
              <div>
                <h2>{t("cloud.billing.upgradeOptions")}</h2>
                <p>{t("cloud.billing.catalogAuthority")}</p>
              </div>
              <label className="desktop-cloud-billing-seat-control">
                <span>{t("cloud.billing.seatQuantity")}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={seatQuantity}
                  onChange={(event) => setSeatQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                  aria-label={t("cloud.billing.seatQuantity")}
                />
                <button
                  type="button"
                  onClick={() => void quoteSeats()}
                  disabled={action !== null || !billing.summary.seat_changes_available}
                >
                  {t("cloud.billing.quoteSeatChange")}
                </button>
              </label>
            </div>
            <div className="desktop-cloud-billing-plan-grid">
              {billing.catalog.plans.filter((plan) => plan.public).map((plan) => (
                <CatalogPlanCard
                  key={plan.id}
                  plan={plan}
                  current={plan.id === billing.summary?.plan_id}
                  localization={localization}
                  busy={action !== null}
                  onQuote={() => void quotePlan(plan)}
                />
              ))}
            </div>
          </section>
        )}

        {quote && (
          <section className="desktop-cloud-billing-quote" aria-live="polite">
            <div>
              <span>{t("cloud.billing.quote")}</span>
              <h2>{t("cloud.billing.quoteSummary", {
                plan: quote.target_plan_id,
                count: quote.target_seats,
              })}</h2>
              <p>{t("cloud.billing.quoteExpires", {
                time: localization.formatDate(new Date(quote.expires_at), {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}</p>
            </div>
            <div className="desktop-cloud-billing-quote-price">
              <strong>{formatCurrency(quote.target_amount_cents, quote.currency, localization)}</strong>
              <span>{t("cloud.billing.perMonth")}</span>
              <small>{t("cloud.billing.quoteDelta", {
                amount: formatCurrency(quote.delta_amount_cents, quote.currency, localization),
              })}</small>
            </div>
            {(quote.target_plan_id !== requestedPlanId || quote.details.crosses_plan_boundary === true) && (
              <div className="desktop-cloud-billing-boundary-warning">
                <ShieldAlert size={16} />
                <span>{t("cloud.billing.boundaryChange", { plan: quote.target_plan_id })}</span>
              </div>
            )}
            <button type="button" className="primary" onClick={() => void confirmQuote()} disabled={action !== null}>
              <CreditCard size={14} />
              {t("cloud.billing.confirmQuotedChange")}
            </button>
          </section>
        )}

        {pendingOperations.length > 0 && (
          <BillingNotice
            icon={<Clock3 size={16} />}
            title={t("cloud.billing.pendingOperations", { count: pendingOperations.length })}
            detail={pendingOperations.map((operation) => operation.status).join(", ")}
            action={actionableSeatOperation && (
              <button
                type="button"
                onClick={() => void quoteSeats(actionableSeatOperation)}
                disabled={action !== null}
              >
                {t("cloud.billing.quoteSeatChange")}
              </button>
            )}
          />
        )}

        {billing.catalog && (
          <div className="desktop-cloud-billing-note">
            <span>{t("cloud.billing.checkoutNote", { count: projects.length })}</span>
            <span>{t("cloud.billing.secure")} <ExternalLink size={12} /></span>
          </div>
        )}
      </div>
    </CloudOrganizationPageShell>
  );
}

function CatalogPlanCard({
  plan,
  current,
  localization,
  busy,
  onQuote,
}: {
  plan: DesktopBillingPlan;
  current: boolean;
  localization: LocalizationContextValue;
  busy: boolean;
  onQuote: () => void;
}) {
  const { t } = localization;
  const facts = catalogFacts(plan, localization);
  return (
    <article className={`desktop-cloud-billing-plan-card ${plan.highlighted ? "recommended" : ""}`}>
      <div>
        <div className="desktop-cloud-billing-plan-heading">
          <h3>{plan.name}</h3>
          {current && <span>{t("cloud.billing.current")}</span>}
        </div>
        <p>{plan.description}</p>
      </div>
      <div className="desktop-cloud-billing-plan-price">
        <strong>{formatPerSeatPrice(plan, localization)}</strong>
        {plan.price_per_seat_cents !== null && plan.interval === "month" && (
          <span>{t("cloud.billing.perSeatMonth")}</span>
        )}
      </div>
      <div className="desktop-cloud-billing-plan-features">
        {facts.map((fact) => (
          <span className="desktop-cloud-plan-feature" key={fact}>
            <Check size={14} /><span>{fact}</span>
          </span>
        ))}
      </div>
      <button
        className={plan.highlighted ? "primary" : ""}
        type="button"
        onClick={onQuote}
        disabled={busy || current || !plan.purchasable}
      >
        <CreditCard size={14} />
        <span>{current
          ? t("cloud.billing.currentPlan")
          : plan.purchasable
            ? t("cloud.billing.requestQuote")
            : t("cloud.billing.contactUs")}</span>
      </button>
    </article>
  );
}

function UsageCard({ icon, title, value, detail, percent, warning = false }: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  percent: number | null;
  warning?: boolean;
}) {
  const boundedPercent = percent === null ? null : Math.max(0, Math.min(100, percent));
  return (
    <article className={`desktop-cloud-billing-usage-card ${warning ? "warning" : ""}`}>
      <header>{icon}<span>{title}</span></header>
      <strong>{value}</strong>
      <small>{detail}</small>
      {boundedPercent !== null && (
        <div className="desktop-cloud-billing-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={boundedPercent}>
          <span style={{ width: `${boundedPercent}%` }} />
        </div>
      )}
    </article>
  );
}

function BillingNotice({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="desktop-cloud-billing-notice">
      {icon}
      <div><strong>{title}</strong>{detail && <span>{detail}</span>}</div>
      {action}
    </div>
  );
}

function clampSeats(value: number, plan: DesktopBillingPlan): number {
  const minimum = Math.max(1, plan.seats.minimum);
  const maximum = plan.seats.maximum ?? Number.MAX_SAFE_INTEGER;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value) || minimum));
}

function catalogFacts(plan: DesktopBillingPlan, localization: LocalizationContextValue): string[] {
  const { t } = localization;
  const maximum = plan.seats.maximum === null
    ? t("cloud.billing.unlimited")
    : localization.formatNumber(plan.seats.maximum);
  const facts = [t("cloud.billing.seatRange", {
    minimum: localization.formatNumber(plan.seats.minimum),
    maximum,
  })];
  const storagePerSeat = plan.per_seat_limits["storage.max_bytes"];
  const fixedStorage = plan.fixed_limits["storage.max_bytes"];
  if (storagePerSeat !== undefined) {
    facts.push(t("cloud.billing.storagePerSeat", { amount: formatBytes(storagePerSeat, localization) }));
  } else if (typeof fixedStorage === "number") {
    facts.push(t("cloud.billing.storageIncluded", { amount: formatBytes(fixedStorage, localization) }));
  }
  const scopes = plan.fixed_limits["repo_scopes.max_per_project"];
  facts.push(t("cloud.billing.scopesPerProject", {
    count: scopes === null ? t("cloud.billing.unlimited") : localization.formatNumber(scopes ?? 0),
  }));
  const upload = plan.fixed_limits["upload.max_single_file_bytes"];
  if (typeof upload === "number") {
    facts.push(t("cloud.billing.singleFileLimit", { amount: formatBytes(upload, localization) }));
  }
  const runtime = plan.runtime.units_per_seat;
  if (runtime > 0) {
    facts.push(t("cloud.billing.runtimePerSeat", { count: localization.formatNumber(runtime) }));
  }
  return facts;
}

function formatPerSeatPrice(plan: DesktopBillingPlan, localization: LocalizationContextValue): string {
  if (plan.price_per_seat_cents === null) return localization.t("cloud.billing.custom");
  return formatCurrency(plan.price_per_seat_cents, plan.currency, localization);
}

function formatMonthlyTotal(
  plan: DesktopBillingPlan,
  seats: number,
  localization: LocalizationContextValue,
): string {
  if (plan.price_per_seat_cents === null) return localization.t("cloud.billing.custom");
  return formatCurrency(plan.price_per_seat_cents * seats, plan.currency, localization);
}

function formatCurrency(cents: number, currency: string, localization: LocalizationContextValue): string {
  return localization.formatNumber(cents / 100, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function formatBytes(value: number, localization: LocalizationContextValue): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = Math.max(0, value);
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${localization.formatNumber(amount, { maximumFractionDigits: amount < 10 ? 1 : 0 })} ${units[unit]}`;
}

function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}
