# Cloud Repository Context Boundaries

Cloud navigation for an open local workspace is derived from its actual Git
state. The canonical PuppyOne remote is the sole locator; the signed-in Cloud
session supplies authorization. Desktop and Cloud do not maintain an identity
record for the local folder.

[Cloud Entry Authentication and Project Context UX](cloud-entry-ux.md) owns
the first-match screen priority built from these independent state domains.

## Independent state domains

```text
CloudEnvironment
  configured API/Git origins and feature availability

CloudSession
  signed-out | restoring | signed-in | signing-out

CanonicalRemoteResolution
  none | unique | conflict

ProjectCloudContext
  local-only | resolving | resolved | recovery

CloudProjectData
  readiness, contents, history, automation, billing-safe capabilities

CloudRoute
  global Project catalog or contextual Project section
```

No layer may infer a downstream state by bypassing the preceding authority.
For example, a route segment or cached Project ID cannot create resolved
Project context.

## Resolution flow

```text
active local workspace
  -> read actual Git remotes
  -> select canonical PuppyOne locators only
     -> none: local-only; no Cloud API
     -> conflict: local repair state; no guessed Project
     -> one: validate trusted origin and parse exact target
  -> require current Cloud session
  -> POST /projects/{project_id}/repository-context { target }
  -> Backend checks current ProjectGrant and exact Scope
  -> resolved secret-free context
```

The request contains no local path, workspace instance, computer identifier,
raw remote URL, or Git credential.

## Context model

```ts
type ProjectCloudContext =
  | { status: "local-only"; projectId: null }
  | { status: "resolving"; projectId: null }
  | {
      status: "resolved";
      projectId: string;
      target: RepositoryTarget;
      scopePath?: string | null;
      capabilities?: string[];
    }
  | { status: "not-authorized"; projectId: string | null; message: CloudMessage }
  | { status: "wrong-account"; projectId: string | null; message: CloudMessage }
  | { status: "wrong-host"; projectId: string | null; message: CloudMessage }
  | { status: "locator-conflict"; projectId: string | null; message: CloudMessage }
  | { status: "not-found"; projectId: string | null; message: CloudMessage }
  | { status: "temporarily-unavailable"; projectId: string | null; message: CloudMessage }
  | { status: "unresolvable" | "error"; projectId: null; message: CloudMessage };
```

`resolved` is ephemeral and can be discarded whenever workspace, remote,
session generation, or Cloud origin changes.

## Source ownership

| Fact | Owner | Persistence |
|---|---|---|
| Active workspace and local instance | Electron main | local registry only |
| Canonical PuppyOne locator | Git config | Git repository |
| Session tokens/generation | Electron auth broker | main process only |
| Human Project capabilities | Cloud authorization service | server facts |
| Repository target geometry | Cloud Project/Scope model | server facts |
| Git credential | OS credential helper + hash-only server row | never workspace config |

Recent-workspace metadata may cache a canonical remote hint for display. It is
not authority and does not allow Cloud API or Git mutation against an inactive
folder.

## Session concurrency

The main process owns credentials, refresh singleflight, and session generation.
Cloud IPC returns a structured success/error envelope. If a request observes a
generation change, the main process retries one safe request using the current
session when possible. The renderer also silently reruns context resolution for
`SESSION_CHANGED`. That internal code is never product copy and never creates
an Offline banner.

## UI states

- Restoring or signing out without an effective session: show a neutral bounded
  transition state.
- No effective session: show the single account-only PuppyOne Cloud sign-in
  entry regardless of repository, route, or publish state. Do not show a local
  repository summary, push arrow, `New Cloud project`, or `Not initialized`.
- Authenticated with no canonical remote: show the local-only explanation and
  one primary `Initialize and Push` action. Show `Local repository -> Push ->
  PuppyOne Cloud`, with the destination marked `Not initialized`. Do not show
  an error banner.
- Resolved context: show Project content.
- Remote missing after a previous display hint: the actual current state wins;
  show local-only.
- Unauthorized/missing/wrong-host/conflict: keep local files available and show
  specific recovery guidance.
- Network outage: preserve context inputs and offer retry without mutating Git.

## Mutations

After authentication, initializing a local project on PuppyOne Cloud is one
explicit user operation:

1. verify that the repository has a named branch, an existing HEAD, no remote
   conflict, and no known immutable server-policy violation;
2. choose the owning Organization explicitly (auto-select only when exactly
   one is available);
3. have Electron main durably record the operation before any Cloud mutation;
4. idempotently create the Cloud Project and operation-owned Git credential;
5. configure the canonical `puppyone` remote add-only while holding the
   repository mutation lock;
6. push the captured immutable HEAD SHA to the canonical Cloud `main` branch;
7. reconcile uncertain transport outcomes against the remote ref, configure
   upstream, and enter the new Cloud Project; and
8. remove the journal on completion, or expose Resume/Abandon for a durable
   incomplete operation.

The operation does not stage, commit, amend, stash, or discard user changes.
Only existing commits are pushed; staged, unstaged, and untracked changes stay
local. The UI describes the first-time action as initialization plus Push, not
as adding a remote. Project creation, credential issuance, remote configuration,
and Git transport are implementation steps behind the single product action.
Browser sign-in remains on the shared authentication surface.
Initializing/pushing and failure are visible only after authentication; a click
must never degrade into a navigation no-op.

The complete phase, idempotency, credential, crash-recovery, and compensation
contract is defined in
[Cloud Project Publish Coordinator](cloud-publish-coordinator.md).

Configuring a local checkout for an existing Cloud Project remains a separate
explicit operation, but Desktop always connects the canonical Project-root
repository. A future specialized scoped Git view is a different product
surface; it must not silently replace the root repository used by Desktop.

Removing Cloud access from a folder removes the local remote and related local
sync preferences. It is not a server-side folder operation. Credential
revocation is normally an independent explicit action; abandoning an unfinished
publish is the narrow exception and may revoke only that operation's credential
and delete only its still-empty Project.

## Architecture guard

Production source must not introduce a server-issued local-checkout ID, a
Cloud field in workspace config, a legacy-remote context resolver, or an API
that accepts `remote_url` for Project discovery.
