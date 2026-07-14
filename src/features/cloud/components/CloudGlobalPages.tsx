import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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

export type CloudOrganizationDataStatus =
  | "loading"
  | "selection-required"
  | "none"
  | "ready"
  | "partial"
  | "error";

export type CloudOrganizationMembersStatus = "idle" | "loading" | "ready" | "error";

type CloudOrganizationDataState = {
  contextKey: string;
  organizations: DesktopCloudOrganization[];
  selectedOrganizationId: string | null;
  organization: DesktopCloudOrganization | null;
  members: DesktopCloudOrgMember[];
  entitlements: DesktopCloudOrganizationEntitlements | null;
  seatUsage: DesktopCloudOrganizationSeatUsage | null;
  status: CloudOrganizationDataStatus;
  membersStatus: CloudOrganizationMembersStatus;
  loading: boolean;
  error: CloudMessageDescriptor | null;
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
        <>
          <CloudOrganizationSelector organizationData={orgData} />
          <button
            className="desktop-cloud-org-primary-button"
            type="button"
            onClick={onOpen}
            disabled={!organization}
          >
            <Mail size={14} />
            <span>{t("cloud.team.inviteMember")}</span>
          </button>
        </>
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

        {orgData.status === "selection-required" && (
          <div className="desktop-cloud-org-inline-error">
            <strong>{t("cloud.organization.selectionRequired")}</strong>
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
          {actions && <div className="desktop-cloud-org-actions">{actions}</div>}
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
  const contextKey = createCloudOrganizationContextKey(session, apiBaseUrl);
  const [state, setState] = useState<CloudOrganizationDataState>(
    () => emptyOrganizationState(contextKey),
  );
  const [reloadRevision, setReloadRevision] = useState(0);
  const organizationRequestEpoch = useRef(0);
  const detailsRequestEpoch = useRef(0);
  const sessionRef = useRef(session);
  const apiBaseUrlRef = useRef(apiBaseUrl);
  const onSessionChangeRef = useRef(onSessionChange);
  sessionRef.current = session;
  apiBaseUrlRef.current = apiBaseUrl;
  onSessionChangeRef.current = onSessionChange;
  const effectiveState = state.contextKey === contextKey
    ? state
    : emptyOrganizationState(contextKey);

  useEffect(() => {
    const requestEpoch = ++organizationRequestEpoch.current;
    detailsRequestEpoch.current += 1;
    setState(emptyOrganizationState(contextKey));
    const load = async () => {
      try {
        const organizations = await listCloudOrganizations(
          sessionRef.current,
          onSessionChangeRef.current,
          apiBaseUrlRef.current,
        );
        if (requestEpoch !== organizationRequestEpoch.current) return;
        if (organizations.length === 0) {
          setState({
            ...emptyOrganizationState(contextKey),
            organizations,
            status: "none",
            loading: false,
          });
          return;
        }
        const storedSelection = readOrganizationSelection(contextKey);
        const [onlyOrganization] = organizations;
        const selectedOrganizationId = organizations.length === 1
          ? onlyOrganization?.id ?? null
          : organizations.some((organization) => organization.id === storedSelection)
            ? storedSelection
            : null;
        const organization = organizations.find(
          (candidate) => candidate.id === selectedOrganizationId,
        ) ?? null;
        setState({
          ...emptyOrganizationState(contextKey),
          contextKey,
          organizations,
          selectedOrganizationId,
          organization,
          status: organization ? "loading" : "selection-required",
          membersStatus: organization ? "loading" : "idle",
          loading: Boolean(organization),
        });
      } catch (error) {
        if (requestEpoch !== organizationRequestEpoch.current) return;
        setState({
          ...emptyOrganizationState(contextKey),
          status: "error",
          loading: false,
          error: cloudMessage(
            "organization-load-failed",
            undefined,
            error instanceof Error ? error.message : undefined,
          ),
        });
      }
    };
    void load();
    return () => {
      if (requestEpoch === organizationRequestEpoch.current) {
        organizationRequestEpoch.current += 1;
      }
    };
  }, [contextKey, reloadRevision]);

  useEffect(() => {
    if (state.contextKey !== contextKey || !state.organization) return;
    const organization = state.organization;
    const requestEpoch = ++detailsRequestEpoch.current;
    const activeSession = sessionRef.current;
    const activeApiBaseUrl = apiBaseUrlRef.current;
    const activeOnSessionChange = onSessionChangeRef.current;
    const load = async () => {
      const [membersResult, entitlementResult, seatUsageResult] = await Promise.allSettled([
        listCloudOrganizationMembers(
          activeSession,
          organization.id,
          activeOnSessionChange,
          activeApiBaseUrl,
        ),
        getCloudOrganizationEntitlements(
          activeSession,
          organization.id,
          activeOnSessionChange,
          activeApiBaseUrl,
        ),
        getCloudOrganizationSeatUsage(
          activeSession,
          organization.id,
          activeOnSessionChange,
          activeApiBaseUrl,
        ),
      ]);
      if (requestEpoch !== detailsRequestEpoch.current) return;
      const partial = membersResult.status === "rejected"
        || entitlementResult.status === "rejected"
        || seatUsageResult.status === "rejected";
      setState((current) => {
        if (current.contextKey !== contextKey || current.organization?.id !== organization.id) {
          return current;
        }
        return {
          ...current,
          members: membersResult.status === "fulfilled" ? membersResult.value : [],
          entitlements: entitlementResult.status === "fulfilled" ? entitlementResult.value : null,
          seatUsage: seatUsageResult.status === "fulfilled" ? seatUsageResult.value : null,
          status: partial ? "partial" : "ready",
          membersStatus: membersResult.status === "fulfilled" ? "ready" : "error",
          loading: false,
          error: partial ? cloudMessage("organization-partial") : null,
        };
      });
    };
    void load();
    return () => {
      if (requestEpoch === detailsRequestEpoch.current) {
        detailsRequestEpoch.current += 1;
      }
    };
  }, [contextKey, state.contextKey, state.organization]);

  const selectOrganization = useCallback((organizationId: string) => {
    if (effectiveState.contextKey !== contextKey) return;
    const organization = effectiveState.organizations.find(
      (candidate) => candidate.id === organizationId,
    );
    if (!organization || effectiveState.organization?.id === organization.id) return;
    detailsRequestEpoch.current += 1;
    writeOrganizationSelection(contextKey, organization.id);
    setState({
      ...emptyOrganizationState(contextKey),
      organizations: effectiveState.organizations,
      selectedOrganizationId: organization.id,
      organization,
      status: "loading",
      membersStatus: "loading",
      loading: true,
    });
  }, [contextKey, effectiveState]);

  const refresh = useCallback(() => {
    setReloadRevision((revision) => revision + 1);
  }, []);

  return { ...effectiveState, selectOrganization, refresh };
}

export function CloudOrganizationSelector({
  organizationData,
}: {
  organizationData: ReturnType<typeof useCloudOrganizationData>;
}) {
  const { t } = useLocalization();
  if (organizationData.organizations.length <= 1) return null;
  return (
    <label className="desktop-cloud-organization-selector">
      <span>{t("cloud.organization.selectLabel")}</span>
      <select
        aria-label={t("cloud.organization.selectLabel")}
        value={organizationData.selectedOrganizationId ?? ""}
        onChange={(event) => organizationData.selectOrganization(event.target.value)}
      >
        <option value="" disabled>{t("cloud.organization.selectPlaceholder")}</option>
        {organizationData.organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>{organization.name}</option>
        ))}
      </select>
    </label>
  );
}

function emptyOrganizationState(contextKey: string): CloudOrganizationDataState {
  return {
    contextKey,
    organizations: [],
    selectedOrganizationId: null,
    organization: null,
    members: [],
    entitlements: null,
    seatUsage: null,
    status: "loading",
    membersStatus: "idle",
    loading: true,
    error: null,
  };
}

function createCloudOrganizationContextKey(
  session: DesktopCloudSession,
  apiBaseUrl: string | null,
): string {
  return [
    session.user_id,
    session.session_generation,
    normalizeApiIdentity(apiBaseUrl ?? session.api_base_url),
  ].join("\u001f");
}

function normalizeApiIdentity(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

function organizationSelectionStorageKey(contextKey: string): string {
  return `puppyone.cloud.organization-selection.v1:${encodeURIComponent(contextKey)}`;
}

function readOrganizationSelection(contextKey: string): string | null {
  try {
    return window.localStorage.getItem(organizationSelectionStorageKey(contextKey));
  } catch {
    return null;
  }
}

function writeOrganizationSelection(contextKey: string, organizationId: string): void {
  try {
    window.localStorage.setItem(organizationSelectionStorageKey(contextKey), organizationId);
  } catch {
    // Selection remains valid in memory when durable browser storage is unavailable.
  }
}

function formatRole(role: string, t: MessageFormatter) {
  if (role === "owner" || role === "member" || role === "viewer") return t(`cloud.team.role.${role}`);
  return role;
}
