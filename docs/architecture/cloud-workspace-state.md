# Cloud Repository Context Boundaries

Cloud navigation for an open local workspace is derived from its actual Git
state. The canonical PuppyOne remote is the sole locator; the signed-in Cloud
session supplies authorization. Desktop and Cloud do not maintain an identity
record for the local folder.

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

- No canonical remote: show the local-only explanation and an explicit action
  to add a Cloud Git remote. Do not show an error banner.
- Resolved context: show Project content.
- Remote missing after a previous display hint: the actual current state wins;
  show local-only.
- Unauthorized/missing/wrong-host/conflict: keep local files available and show
  specific recovery guidance.
- Network outage: preserve context inputs and offer retry without mutating Git.

## Mutations

Adding a Cloud Git remote is an explicit operation:

1. choose a Project/root-or-Scope target;
2. issue a one-time user Git credential;
3. write secret-free workspace sync preferences;
4. configure the canonical remote and OS credential helper;
5. if local setup fails, best-effort revoke the just-issued credential.

Removing Cloud access from a folder removes the local remote and related local
sync preferences. It is not a server-side folder operation. Credential
revocation is an independent explicit action.

## Architecture guard

Production source must not introduce a server-issued local-checkout ID, a
Cloud field in workspace config, a legacy-remote context resolver, or an API
that accepts `remote_url` for Project discovery.
