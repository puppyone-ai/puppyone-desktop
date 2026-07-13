import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Check, CreditCard, ExternalLink, Mail, RefreshCw, X } from "lucide-react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization, type LocalizationContextValue } from "@puppyone/localization/react";
import {
  getCloudOrganizationEntitlements,
  listCloudOrganizationMembers,
  listCloudOrganizations,
  type DesktopCloudOrgMember,
  type DesktopCloudOrganization,
  type DesktopCloudOrganizationEntitlements,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  cloudMessage,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../cloudPresentation";

type CloudGlobalPageProps = {
  accountEmail: string | null;
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  projects: DesktopCloudProject[];
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onOpen: () => void;
};

type PlanItem = {
  id: "seat" | "project" | "scopes-project" | "scopes" | "storage" | "storage-project" | "files-project" | "single-file-upload" | "git-remote" | "cli" | "mcp" | "workspace" | "sandbox" | "enterprise-deployment";
  type: "metric" | "capability";
  value?: number | "custom" | "unlimited";
  unit?: "gb" | "mb";
  included?: boolean;
};

type PlanDefinition = {
  id: "free" | "plus" | "pro" | "enterprise";
  priceUsd?: number;
  customPrice?: boolean;
  badgeId?: string;
  items: PlanItem[];
};

const PLANS: PlanDefinition[] = [
  {
    id: "free",
    priceUsd: 0,
    items: [
      { id: "seat", type: "metric", value: 1 }, { id: "project", type: "metric", value: 1 },
      { id: "scopes-project", type: "metric", value: 2 }, { id: "storage", type: "metric", value: 1, unit: "gb" },
      { id: "storage-project", type: "metric", value: 1, unit: "gb" }, { id: "files-project", type: "metric", value: 2000 },
      { id: "single-file-upload", type: "metric", value: 50, unit: "mb" },
      { id: "git-remote", type: "capability" }, { id: "cli", type: "capability" },
      { id: "mcp", type: "capability", included: false }, { id: "workspace", type: "capability", included: false },
      { id: "sandbox", type: "capability", included: false }, { id: "enterprise-deployment", type: "capability", included: false },
    ],
  },
  {
    id: "plus",
    priceUsd: 15,
    badgeId: "cloud.billing.recommended",
    items: [
      { id: "seat", type: "metric", value: 10 }, { id: "project", type: "metric", value: 5 },
      { id: "scopes-project", type: "metric", value: 10 }, { id: "storage", type: "metric", value: 50, unit: "gb" },
      { id: "storage-project", type: "metric", value: 10, unit: "gb" }, { id: "files-project", type: "metric", value: 25000 },
      { id: "single-file-upload", type: "metric", value: 200, unit: "mb" },
      { id: "git-remote", type: "capability" }, { id: "cli", type: "capability" }, { id: "mcp", type: "capability" },
      { id: "workspace", type: "capability", included: false }, { id: "sandbox", type: "capability", included: false },
      { id: "enterprise-deployment", type: "capability", included: false },
    ],
  },
  {
    id: "pro",
    priceUsd: 100,
    items: [
      { id: "seat", type: "metric", value: 50 }, { id: "project", type: "metric", value: 50 },
      { id: "scopes", type: "metric", value: "unlimited" }, { id: "storage", type: "metric", value: 500, unit: "gb" },
      { id: "storage-project", type: "metric", value: 50, unit: "gb" }, { id: "files-project", type: "metric", value: 250000 },
      { id: "single-file-upload", type: "metric", value: 500, unit: "mb" },
      { id: "git-remote", type: "capability" }, { id: "cli", type: "capability" }, { id: "mcp", type: "capability" },
      { id: "workspace", type: "capability" }, { id: "sandbox", type: "capability" },
      { id: "enterprise-deployment", type: "capability", included: false },
    ],
  },
  {
    id: "enterprise",
    customPrice: true,
    items: [
      { id: "seat", type: "metric", value: "custom" }, { id: "project", type: "metric", value: "custom" },
      { id: "scopes", type: "metric", value: "custom" }, { id: "storage", type: "metric", value: "custom" },
      { id: "storage-project", type: "metric", value: "custom" }, { id: "files-project", type: "metric", value: "custom" },
      { id: "single-file-upload", type: "metric", value: "custom" },
      { id: "git-remote", type: "capability" }, { id: "cli", type: "capability" }, { id: "mcp", type: "capability" },
      { id: "workspace", type: "capability" }, { id: "sandbox", type: "capability" }, { id: "enterprise-deployment", type: "capability" },
    ],
  },
];

const UPGRADE_PLANS = PLANS.filter((plan) => plan.id !== "free");
const CURRENT_SUMMARY_LABELS = new Set([
  "seat",
  "project",
  "scopes-project",
  "scopes",
  "storage",
  "storage-project",
  "single-file-upload",
  "git-remote",
  "cli",
  "mcp",
  "workspace",
  "sandbox",
]);
const UPGRADE_DETAIL_LABELS = new Set([
  "seat",
  "project",
  "scopes-project",
  "scopes",
  "storage",
  "storage-project",
  "files-project",
  "single-file-upload",
  "mcp",
  "workspace",
  "sandbox",
  "enterprise-deployment",
]);

export function CloudGlobalTeamPage({ accountEmail, session, apiBaseUrl, projects, onSessionChange, onOpen }: CloudGlobalPageProps) {
  const { t } = useLocalization();
  const orgData = useCloudOrganizationData(session, apiBaseUrl, onSessionChange);
  const organization = orgData.organization;
  const members = orgData.members.length > 0 ? orgData.members : buildFallbackMembers(accountEmail);
  const displayName = accountEmail?.split("@")[0] || t("cloud.team.cloudUser");
  const seatLimit = organization?.seat_limit ?? Math.max(1, members.length);
  const plan = organization?.plan ?? "free";

  return (
    <CloudOrganizationPageShell
      title={t("cloud.route.cloud-team.title")}
      description={t("cloud.team.description", {
        organization: bidiIsolate(organization?.name ?? t("cloud.organization.yours")),
      })}
      actions={(
        <button className="desktop-cloud-org-primary-button" type="button" onClick={onOpen}>
          <Mail size={14} />
          <span>{t("cloud.team.inviteMember")}</span>
        </button>
      )}
    >
      <div className="desktop-cloud-org-card">
        <div className="desktop-cloud-org-card-header">
          <div>
            <h2>{t("cloud.team.members")}</h2>
            <p>{t("cloud.team.seatsUsed", { used: members.length, limit: seatLimit, plan: bidiIsolate(plan) })}</p>
          </div>
        </div>

        <div className="desktop-cloud-team-list">
          {members.map((member, index) => {
            const name = member.display_name || member.email || displayName;
            const initial = (name[0] || "U").toUpperCase();
            return (
              <div className="desktop-cloud-team-row" key={member.id || member.user_id || member.email || index}>
                <div className="desktop-cloud-team-member">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="desktop-cloud-team-avatar image" />
                  ) : (
                    <span className="desktop-cloud-team-avatar" aria-hidden="true">{initial}</span>
                  )}
                  <div>
                    <strong>
                      <span dir="auto">{name}</span>
                      {member.role === "owner" && <em>{t("cloud.team.role.owner")}</em>}
                    </strong>
                    {member.email && member.display_name && <small>{member.email}</small>}
                  </div>
                </div>
                <span className={`desktop-cloud-team-role ${member.role === "owner" ? "owner" : ""}`}>
                  {formatRole(member.role, t)}
                </span>
              </div>
            );
          })}
        </div>

        {orgData.loading && members.length === 0 && (
          <div className="desktop-cloud-team-loading">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <span />
                <div>
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
        )}

        {orgData.error && (
          <div className="desktop-cloud-org-inline-error">
            <strong>{t("cloud.team.loadFailed")}</strong>
            <span>{formatCloudMessage(orgData.error, t)}</span>
          </div>
        )}

        <div className="desktop-cloud-org-card-footer">
          <span>{t("cloud.project.sessionCount", { count: projects.length })}</span>
          <button type="button" onClick={onOpen}>{t("cloud.team.openFullPage")}</button>
        </div>
      </div>
    </CloudOrganizationPageShell>
  );
}

export function CloudGlobalBillingPage({ session, apiBaseUrl, projects, onSessionChange, onOpen }: CloudGlobalPageProps) {
  const localization = useLocalization();
  const { t } = localization;
  const orgData = useCloudOrganizationData(session, apiBaseUrl, onSessionChange);
  const organization = orgData.organization;
  const currentDisplayPlan = normalizeDisplayPlanId(orgData.entitlements?.plan_id || organization?.plan);
  const currentPlan = getPlanById(currentDisplayPlan);
  const currentSummaryItems = currentPlan.items.filter((item) => CURRENT_SUMMARY_LABELS.has(item.id));

  return (
    <CloudOrganizationPageShell
      title={t("cloud.route.cloud-billing.title")}
      description={t("cloud.billing.description", {
        organization: bidiIsolate(organization?.name ?? t("cloud.organization.yours")),
      })}
      actions={(
        <button className="desktop-cloud-org-secondary-button" type="button" onClick={onOpen}>
          <RefreshCw size={14} />
          <span>{t("cloud.common.refresh")}</span>
        </button>
      )}
    >
      <div className="desktop-cloud-billing-stack">
        {orgData.error && (
          <div className="desktop-cloud-org-inline-error standalone">
            <strong>{t("cloud.billing.loadFailed")}</strong>
            <span>{formatCloudMessage(orgData.error, t)}</span>
          </div>
        )}

        <section className="desktop-cloud-billing-current">
          <div className="desktop-cloud-billing-current-main">
            <div>
              <div className="desktop-cloud-billing-title-row">
                <span>{t("cloud.billing.currentPlan")}</span>
                <h2>{t(`cloud.billing.plan.${currentPlan.id}.name`)}</h2>
                {orgData.loading && <em>{t("cloud.status.syncing")}</em>}
              </div>
              <p>{t(`cloud.billing.plan.${currentPlan.id}.line`)}</p>
            </div>
            <div className="desktop-cloud-billing-price">
              <strong>{formatPlanPrice(currentPlan, localization)}</strong>
              <span>{currentPlan.customPrice ? "" : t("cloud.billing.perMonth")}</span>
              <small>{t("cloud.billing.managedThroughPolar")}</small>
            </div>
          </div>
          <div className="desktop-cloud-billing-summary">
            {currentSummaryItems.map((item) => (
              <PlanFeature key={`current-${item.value || "included"}-${item.id}`} item={item} />
            ))}
          </div>
        </section>

        <section className="desktop-cloud-billing-options">
          <div className="desktop-cloud-billing-options-header">
            <div>
              <h2>{t("cloud.billing.upgradeOptions")}</h2>
              <p>{t("cloud.billing.upgradeDescription")}</p>
            </div>
            <span>{t("cloud.billing.checkoutThroughPolar")}</span>
          </div>
          <div className="desktop-cloud-billing-plan-grid">
            {UPGRADE_PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} current={plan.id === currentDisplayPlan} onOpen={onOpen} />
            ))}
          </div>
        </section>

        <div className="desktop-cloud-billing-note">
          <span>{t("cloud.billing.checkoutNote", { count: projects.length })}</span>
          <span>{t("cloud.billing.secure")} <ExternalLink size={12} /></span>
        </div>
      </div>
    </CloudOrganizationPageShell>
  );
}

function CloudOrganizationPageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="desktop-cloud-org-page">
      <div className="desktop-cloud-org-shell">
        <div className="desktop-cloud-org-header">
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {actions && <div>{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function PlanCard({ plan, current, onOpen }: { plan: PlanDefinition; current: boolean; onOpen: () => void }) {
  const localization = useLocalization();
  const { t } = localization;
  const detailItems = plan.items.filter((item) => UPGRADE_DETAIL_LABELS.has(item.id));
  const isRecommended = Boolean(plan.badgeId && !current);
  const planName = t(`cloud.billing.plan.${plan.id}.name`);
  return (
    <article className={`desktop-cloud-billing-plan-card ${plan.id === "plus" ? "recommended" : ""}`}>
      <div>
        <div className="desktop-cloud-billing-plan-heading">
          <h3>{planName}</h3>
          {current && <span>{t("cloud.billing.current")}</span>}
          {isRecommended && <span>{t(plan.badgeId!)}</span>}
        </div>
        <p>{t(`cloud.billing.plan.${plan.id}.line`)}</p>
      </div>

      <div className="desktop-cloud-billing-plan-price">
        <strong>{formatPlanPrice(plan, localization)}</strong>
        {!plan.customPrice && <span>{t("cloud.billing.perMonth")}</span>}
      </div>

      <div className="desktop-cloud-billing-plan-features">
        {detailItems.map((item) => (
          <PlanFeature key={`${plan.id}-${item.value || "included"}-${item.id}`} item={item} />
        ))}
      </div>

      <button className={plan.id === "plus" ? "primary" : ""} type="button" onClick={onOpen}>
        {plan.id === "enterprise" ? <Mail size={14} /> : <CreditCard size={14} />}
        <span>{current
          ? t("cloud.billing.currentPlan")
          : plan.id === "enterprise"
            ? t("cloud.billing.contactUs")
            : t("cloud.billing.choosePlan", { plan: planName })}</span>
        {plan.id !== "enterprise" && <ExternalLink size={13} />}
      </button>
    </article>
  );
}

function useCloudOrganizationData(
  session: DesktopCloudSession,
  apiBaseUrl: string | null,
  onSessionChange: (session: DesktopCloudSession | null) => void,
) {
  const [state, setState] = useState<{
    organization: DesktopCloudOrganization | null;
    members: DesktopCloudOrgMember[];
    entitlements: DesktopCloudOrganizationEntitlements | null;
    loading: boolean;
    error: CloudMessageDescriptor | null;
  }>({
    organization: null,
    members: [],
    entitlements: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const organizations = await listCloudOrganizations(session, onSessionChange, apiBaseUrl);
        const organization = organizations[0] ?? null;
        if (!organization) {
          if (!cancelled) {
            setState({ organization: null, members: [], entitlements: null, loading: false, error: null });
          }
          return;
        }

        const [membersResult, entitlementResult] = await Promise.allSettled([
          listCloudOrganizationMembers(session, organization.id, onSessionChange, apiBaseUrl),
          getCloudOrganizationEntitlements(session, organization.id, onSessionChange, apiBaseUrl),
        ]);
        if (cancelled) return;
        setState({
          organization,
          members: membersResult.status === "fulfilled" ? membersResult.value : [],
          entitlements: entitlementResult.status === "fulfilled" ? entitlementResult.value : null,
          loading: false,
          error: membersResult.status === "rejected" || entitlementResult.status === "rejected"
            ? cloudMessage("organization-partial")
            : null,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            organization: null,
            members: [],
            entitlements: null,
            loading: false,
            error: cloudMessage("organization-load-failed", undefined, error instanceof Error ? error.message : undefined),
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, onSessionChange, session]);

  return state;
}

function buildFallbackMembers(accountEmail: string | null): DesktopCloudOrgMember[] {
  if (!accountEmail) return [];
  return [{
    id: "current-user",
    user_id: "current-user",
    email: accountEmail,
    display_name: accountEmail.split("@")[0],
    avatar_url: null,
    role: "owner",
    joined_at: "",
  }];
}

function normalizeDisplayPlanId(value: unknown): PlanDefinition["id"] {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "plus" || raw === "pro" || raw === "enterprise") return raw;
  return "free";
}

function getPlanById(id: PlanDefinition["id"]): PlanDefinition {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

function formatRole(role: string, t: MessageFormatter) {
  if (role === "owner" || role === "member" || role === "viewer") return t(`cloud.team.role.${role}`);
  return role;
}

function PlanFeature({ item }: { item: PlanItem }) {
  const localization = useLocalization();
  const { t } = localization;
  const included = item.included !== false;
  return (
    <span className={`desktop-cloud-plan-feature ${included ? "" : "disabled"}`}>
      {included ? <Check size={14} /> : <X size={14} />}
      <span>
        {item.value !== undefined && <strong>{formatPlanItemValue(item, localization)}</strong>}
        <span className={item.value !== undefined ? "with-value" : ""}>{t(`cloud.billing.feature.${item.id}`)}</span>
      </span>
    </span>
  );
}

function formatPlanPrice(plan: PlanDefinition, localization: LocalizationContextValue) {
  if (plan.customPrice) return localization.t("cloud.billing.custom");
  return localization.formatNumber(plan.priceUsd ?? 0, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  });
}

function formatPlanItemValue(item: PlanItem, localization: LocalizationContextValue) {
  if (item.value === "custom") return localization.t("cloud.billing.custom");
  if (item.value === "unlimited") return localization.t("cloud.billing.unlimited");
  if (typeof item.value !== "number") return "";
  const value = localization.formatNumber(item.value);
  return item.unit ? localization.t(`cloud.billing.value.${item.unit}`, { value }) : value;
}
