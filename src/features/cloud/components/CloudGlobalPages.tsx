import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import {
  getCloudOrganizationEntitlements,
  getCloudOrganizationSeatUsage,
  listCloudOrganizationMembers,
  listCloudOrganizations,
  type DesktopCloudOrgMember,
  type DesktopCloudOrganization,
  type DesktopCloudOrganizationEntitlements,
  type DesktopCloudOrganizationSeatUsage,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  cloudMessage,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../cloudPresentation";

export type CloudGlobalPageProps = {
  accountEmail: string | null;
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  projects: DesktopCloudProject[];
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onOpen: () => void;
};

export function CloudGlobalTeamPage({
  accountEmail,
  session,
  apiBaseUrl,
  projects,
  onSessionChange,
  onOpen,
}: CloudGlobalPageProps) {
  const { t } = useLocalization();
  const orgData = useCloudOrganizationData(session, apiBaseUrl, onSessionChange);
  const organization = orgData.organization;
  const members = orgData.members;
  const displayName = accountEmail?.split("@")[0] || t("cloud.team.cloudUser");
  const seatLimit = orgData.entitlements?.seat_quantity ?? null;
  const seatsUsed = orgData.seatUsage?.billable_seat_quantity ?? null;
  const plan = orgData.entitlements?.plan_id ?? null;

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
            <p>{seatsUsed !== null && seatLimit !== null && plan !== null
              ? t("cloud.team.seatsUsed", {
                used: seatsUsed,
                limit: seatLimit,
                plan: bidiIsolate(plan),
              })
              : t("cloud.team.loadFailed")}</p>
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
                <div><i /><i /></div>
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

export function CloudOrganizationPageShell({
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

export function useCloudOrganizationData(
  session: DesktopCloudSession,
  apiBaseUrl: string | null,
  onSessionChange: (session: DesktopCloudSession | null) => void,
) {
  const [state, setState] = useState<{
    organization: DesktopCloudOrganization | null;
    members: DesktopCloudOrgMember[];
    entitlements: DesktopCloudOrganizationEntitlements | null;
    seatUsage: DesktopCloudOrganizationSeatUsage | null;
    loading: boolean;
    error: CloudMessageDescriptor | null;
  }>({
    organization: null,
    members: [],
    entitlements: null,
    seatUsage: null,
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
            setState({ organization: null, members: [], entitlements: null, seatUsage: null, loading: false, error: null });
          }
          return;
        }

        const [membersResult, entitlementResult, seatUsageResult] = await Promise.allSettled([
          listCloudOrganizationMembers(session, organization.id, onSessionChange, apiBaseUrl),
          getCloudOrganizationEntitlements(session, organization.id, onSessionChange, apiBaseUrl),
          getCloudOrganizationSeatUsage(session, organization.id, onSessionChange, apiBaseUrl),
        ]);
        if (cancelled) return;
        setState({
          organization,
          members: membersResult.status === "fulfilled" ? membersResult.value : [],
          entitlements: entitlementResult.status === "fulfilled" ? entitlementResult.value : null,
          seatUsage: seatUsageResult.status === "fulfilled" ? seatUsageResult.value : null,
          loading: false,
          error: membersResult.status === "rejected"
            || entitlementResult.status === "rejected"
            || seatUsageResult.status === "rejected"
            ? cloudMessage("organization-partial")
            : null,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            organization: null,
            members: [],
            entitlements: null,
            seatUsage: null,
            loading: false,
            error: cloudMessage(
              "organization-load-failed",
              undefined,
              error instanceof Error ? error.message : undefined,
            ),
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

function formatRole(role: string, t: MessageFormatter) {
  if (role === "owner" || role === "member" || role === "viewer") return t(`cloud.team.role.${role}`);
  return role;
}
