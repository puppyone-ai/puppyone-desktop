# Cloud Workspace State Boundaries

## Requirement

The desktop Cloud surface must not show a signed-out or global warning state
when the user is already signed in and the issue is actually a workspace,
project, or partial data-loading condition.

This requirement exists because the Cloud desktop page combines several
concepts that look similar in the UI but have different product meanings:

- user authentication
- the Cloud API host tied to the current session
- the Cloud API host implied by the current workspace Git remote
- the local workspace to Cloud project mapping
- project-level data availability
- partial failures for optional project sections

These states must stay separate. A user who is signed in must not be asked to
sign in again unless the active workspace truly requires a different Cloud API
host or the saved session is expired.

Workspace-to-Project mapping is an explicit server binding. Git remote URLs
and access credentials are runtime transport facts and must not be used as the
normal Project identity or human authorization source.

## Problem

The desktop Cloud page can regress if one component treats every missing value
as the same state. Common bad outcomes are:

1. A saved session exists, but it was restored for the default Cloud API host
   while the current workspace remote points to another host. The page then
   renders signed-out UI even though the user is already authenticated
   elsewhere.
2. One project subrequest fails, such as MCP endpoints or connector state, and
   the whole page shows a red global banner even though the project list,
   contents, and access state may still be usable.
3. A workspace has a PuppyOne Git remote but the API has not resolved the
   project mapping yet. The UI incorrectly treats this as an auth problem.
4. A local folder is not mapped to a Cloud project. The UI incorrectly treats
   this as a data-loading error.

These are architecture problems. They cannot be solved reliably with ad hoc
banner filtering inside page components.

## Final Architecture

The Cloud desktop frontend must be modeled as four independent state layers:

```ts
type CloudEnvironment = {
  apiBaseUrl: string | null;
  source: "remote" | "config" | "default";
};

type CloudAuthState =
  | { status: "restoring"; apiBaseUrl: string | null }
  | { status: "signed-out"; apiBaseUrl: string | null }
  | { status: "signed-in"; apiBaseUrl: string | null; session: DesktopCloudSession }
  | { status: "wrong-host"; apiBaseUrl: string; session: DesktopCloudSession }
  | { status: "expired"; apiBaseUrl: string | null };

type CloudWorkspaceBindingState =
  | { status: "unmapped" }
  | { status: "resolving"; remoteUrl: string }
  | { status: "mapped"; projectId: string }
  | { status: "remote-only"; remoteUrl: string }
  | { status: "error"; message: string };

type CloudProjectDataState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T; warning?: string }
  | { status: "error"; message: string };
```

The exact TypeScript names may evolve, but the separation must remain:

- `CloudEnvironment` answers: which Cloud API host does this workspace imply?
- `CloudAuthState` answers: does the user have a valid session for that host?
- `CloudWorkspaceBindingState` answers: is this local folder connected to a
  Cloud project?
- `CloudProjectDataState` answers: did a specific project section load?

No page or sidebar component should infer one layer from another by checking a
generic `error`, `loading`, or `session` boolean.

## State Ownership

The preferred file boundaries are:

```text
desktop/src/features/cloud/
  environment/
    resolveCloudEnvironment.ts

  auth/
    useCloudSessionForEnvironment.ts
    cloudAuthTypes.ts

  workspace/
    useCloudWorkspaceBinding.ts
    cloudWorkspaceTypes.ts

  data/
    useCloudProjects.ts
    useCloudProjectOverview.ts
    useCloudAccessData.ts

  history/
    useCloudHistoryData.ts
    useCloudHistoryController.ts
    pagination.ts

  graph/
    model.ts
    cloudTopology.ts
    gitTopology.ts
    shared.ts

  routes/
    cloudRoutes.ts
    CloudRouter.tsx

  pages/
    CloudProjectsPage.tsx
    CloudContentsPage.tsx
    CloudAccessPage.tsx
    CloudGitSyncPage.tsx
    CloudBillingPage.tsx
    CloudTeamPage.tsx

  states/
    CloudSignedOutState.tsx
    CloudWrongHostState.tsx
    CloudUnmappedState.tsx
    CloudRemoteOnlyState.tsx
```

The current code may still have transitional compatibility files, but new work
should move toward these boundaries instead of adding more conditions to
`CloudServiceMainView`, `CloudRouter`, or a catch-all `states.tsx`.

## Error Severity

Cloud errors must be classified before they reach the UI:

- Auth blocking: no valid session for the current environment. Render sign-in
  or wrong-host UI.
- Workspace blocking: local folder is not mapped, or a remote cannot be
  resolved. Render connect, backup, or remote-only UI.
- Project blocking: the selected project cannot be loaded at all. Render the
  page-level error for that project.
- Section warning: a noncritical project subsection failed. Render a local
  warning inside that page or section, not a global red banner.

Global red banners are reserved for blocking conditions that prevent the active
Cloud page from doing its primary job. Optional project subrequests must not
escalate to global banners.

## Implementation Rules

1. Restore session for the active environment.

   Initial app startup may restore any saved session, but the Cloud workspace
   page must also restore a session for the API base derived from the current
   workspace remote. During that check, render a restoring state instead of
   flashing signed-out UI.

2. Do not equate `session === null` with signed out until environment restore
   has completed.

   A missing session before environment resolution is an unknown state, not a
   product decision.

3. Model wrong-host explicitly.

   If a valid session exists for one Cloud API host and the workspace remote
   points to another host, show a wrong-host state with a clear login or switch
   action. Do not silently discard the session or show generic sign-in copy.

4. Keep workspace mapping separate from authentication.

   A user can be signed in while the local folder is unmapped, remote-only, or
   still resolving. Those states should offer connect, backup, Git Sync, or
   refresh actions, not auth actions.

5. Load data by route, not as one eager bundle.

   Project list, overview, contents, access, branches, organization team, and
   billing should have separate data hooks. Eager project-wide loading is
   acceptable only as a transitional implementation.

6. Do not reuse one `error` field for every Cloud failure.

   Use separate blocking errors and section warnings. If a section can render
   degraded content, its failure is a warning, not a page-level error.

7. Route metadata is the navigation source of truth.

   Sidebar labels, route ids, web paths, route context, and route visibility
   should come from route descriptors. Do not duplicate section lists in the
   sidebar and router.

8. Sign-in copy must name the actual host problem.

   "Sign in to load this Cloud workspace" is only valid for an auth-blocking
   state. For host mismatch, say that the workspace belongs to another Cloud
   host. For unmapped folders, say that the folder needs to be connected.

## Current Code Boundaries

- `desktop/src/features/cloud/environment/resolveCloudEnvironment.ts`
  - derives the active Cloud API host from the workspace remote or workspace
    config.
  - is the only place page components should ask "which Cloud host does this
    workspace imply?"

- `desktop/src/features/cloud/auth/`
  - owns environment-specific session restoration and auth-state resolution.
  - exposes helpers such as `getCloudAuthSession` and `isCloudAuthBlocking`
    so page components do not collapse wrong-host, expired, restoring, and
    signed-out states into a generic missing-session check.

- `desktop/src/features/cloud/workspace/`
  - owns explicit binding resolution keyed by stable workspace instance,
    binding ID, Cloud origin, and current account.
  - permits remote inspection only for one-time legacy candidate discovery;
    candidate confirmation creates a formal binding.
  - route components should branch on `CloudWorkspaceBindingState` instead of
    manually combining `remote`, `projectId`, `loading`, and `error`.

- `desktop/src/features/cloud/data/`
  - owns Cloud project list loading, mapped-project resolution orchestration,
    and project detail loading.
  - `useDesktopCloudData` is still the transitional aggregate hook, but its
    internal request context key must stay private and project section partial
    failures must remain warnings instead of global blocking errors.

- `desktop/src/features/cloud/routes/cloudRoutes.ts`
  - owns route ids, labels, web paths, and sidebar visibility.
  - project-scoped route paths must require an explicit project id; do not
    silently generate empty `/projects//...` URLs.

- `desktop/src/features/cloud/routes/CloudRouter.tsx`
  - routes the active Cloud section to a page or workspace state.
  - should not grow into a second data-loading or auth state machine.

- `desktop/src/features/cloud/CloudServiceMainView.tsx`
  - is the current transitional container for session restoration, selected
    project state, and Cloud actions.
  - future changes should move environment auth and workspace binding out of
    this component.

- `desktop/src/lib/cloudSession.ts`
  - owns secure-session restore and in-memory session cache behavior.
  - must support restoring for the active workspace API base.

- `desktop/src/features/cloud/data/`
  - owns Cloud data hooks.
  - should continue moving from one eager hook toward route-scoped hooks.

## Verification

For Cloud state changes, the minimum automated verification is:

```bash
npx tsc --noEmit
npm run build
```

Manual verification should cover:

- app launch with a saved session and no Cloud remote
- app launch with a saved session and a PuppyOne Cloud remote
- switching between workspaces with different Cloud remotes
- an expired saved session
- a workspace remote whose API host differs from the saved session host
- an unmapped local folder
- a remote-only workspace while project mapping is still resolving
- partial failures for access, MCP endpoints, connectors, history, and tree
  loading

## Invariants

These invariants should remain true after future changes:

- A signed-in user is not shown signed-out UI until environment-specific restore
  has completed.
- Host mismatch is a first-class state, not a generic auth failure.
- Workspace mapping state is independent from auth state.
- Project data warnings do not become global red banners.
- Sidebar navigation derives from route descriptors.
- Route-specific pages own route-specific data loading.
- `CloudServiceMainView` and `CloudRouter` do not become catch-all state
  machines again.
