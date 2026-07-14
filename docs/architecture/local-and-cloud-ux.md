# Local and Cloud UX

**Status:** Accepted product and UX contract. The contextual Local workspace →
Cloud Project resolution mechanism is implemented by ISSUE-037; broader Cloud
Only and collaboration behavior remains incremental and must not be presented
as complete before its own milestones ship.

This document defines how PuppyOne presents local-only, local-plus-Cloud, and
Cloud-only projects. It records the product reasoning behind one Projects
entry, one Project identity, one Project shell, and capability-based Local and
Cloud experiences.

It complements, but does not replace:

- [Cloud Workspace State Boundaries](cloud-workspace-state.md), which owns
  Cloud environment, authentication, binding, and project-data states;
- [Desktop Session, Workspace Identity, and Cache Lifecycle](desktop-session-workspace-cache-lifecycle.md),
  which owns stable project identity and physical local workspace identity;
- [Git and Source Control Architecture](git/README.md), which owns local Git
  authority and source-control behavior;
- [Automation and Plugin Domain Boundary](automation-plugin-domain-boundary.md),
  which separates Cloud Automation from local viewer Plugins.

## Executive Decision

PuppyOne has one Projects entry and one Project interface. It does not expose
separate Local Projects and Cloud Projects products.

A Project can have one of three user-visible availability states:

1. **Local Only** — the Project has a local workspace and no PuppyOne Cloud
   attachment.
2. **Local + Cloud** — the same Project has both a local working workspace and
   PuppyOne Cloud services.
3. **Cloud Only** — the Project is hosted in PuppyOne Cloud and has no local
   working workspace on the current device.

These are capability states of one Project, not three incompatible Project
types. A Project can move between them without becoming a duplicate entry.

### Current rollout decision

The Cloud-only implementation remains architecturally supported, but its
standalone creation/open entry is hidden during the Local-first rollout. The
primary path is Open Folder -> explicit Share/Attach to Cloud. Hiding the entry
is a feature-release decision, not permission to delete Cloud data ports,
Cloud-only workspace state, or the ability to expose that entry later for
enterprise hosted Projects.

```text
                          one Project
                               |
             +-----------------+-----------------+
             |                 |                 |
        Local Only        Local + Cloud      Cloud Only
             |                 |                 |
       local production   local production   Cloud-hosted data
                          + Cloud services    + Cloud services
```

## Product Positioning

PuppyOne is a project knowledge workspace for humans and agents. Local storage,
Git, S3, MCP, Reviews, and Automation support that workspace; none of them alone
is the product identity.

The durable product principle is:

> Local is where work may execute. Cloud is where work can persist, be shared,
> be reviewed, and run continuously. The user still opens one Project.

PuppyOne may be Git-native underneath, but the UX must not force users to think
in terms of two products: a local editor and a separate GitHub-like website.
Local production and Cloud collaboration appear in one Project shell.

PuppyOne Cloud is also more than backup. A Cloud entitlement may enable:

- durable managed storage and version history;
- Reviews and team collaboration;
- Hosted MCP endpoints and distribution;
- Cloud Access, members, roles, and audit;
- background Automation;
- Cloud-hosted Agent execution when that capability exists;
- backup and recovery.

Buying a Cloud plan grants entitlement. It does not silently upload every local
Project or automatically deploy services.

## One Entry and One Project List

The home surface has one `Projects` list.

```text
+------------------------------------------------------+
| PuppyOne                                             |
+------------------------------------------------------+
| Projects                                             |
|                                                      |
| [folder] Private Notes                               |
|          Local only                                  |
|                                                      |
| [folder + cloud] Website                             |
|                  Working locally - Cloud synced      |
|                                                      |
| [cloud] Enterprise Knowledge                         |
|         Cloud hosted                                 |
|                                                      |
| + New Project                                        |
+------------------------------------------------------+
```

The home surface must not split the same domain into `Local Projects` and
`Cloud Projects` sections. It must not show one local entry and a second Cloud
entry after a user shares a Project.

Every entry communicates:

- Project identity and name;
- whether a local workspace is available on this device;
- whether PuppyOne Cloud is attached;
- whether the Project is synchronized, offline, or needs attention.

## Project Creation

One `New Project` action may offer multiple starting points:

```text
New Project

  Open a folder on this device
  Create in PuppyOne Cloud
  Connect an existing source       (when supported)
```

`Open a folder on this device` creates or opens a Local Only experience.

`Create in PuppyOne Cloud` creates a Cloud Only experience directly. A user
must not be forced to create a disposable local folder and then convert it to
Cloud Only.

`Connect an existing source` may create a Cloud-backed Project whose facts
remain in an authorized external system such as S3, a database, or a document
provider. This is a future-compatible creation path, not permission to blur
external, local, and PuppyOne-managed authority.

## Capability Matrix

| Capability | Local Only | Local + Cloud | Cloud Only |
| --- | --- | --- | --- |
| Project appears in the unified list | Yes | Yes | Yes |
| Local Files workspace | Yes | Yes | No |
| Cloud-streamed Files workspace | No | Cloud status/versions as needed | Yes |
| Local Git Changes | Yes | Yes | No |
| Local Terminal | Yes | Yes | No |
| Local Agent execution | Yes | Yes | No |
| Offline authoring | Yes | Yes | Only explicitly cached content |
| Reviews | No; offer Share | Yes | Yes |
| Hosted MCP | No; local MCP may be separate | Yes | Yes |
| Cloud distribution and Access | No | Yes | Yes |
| Cloud Automation | No | Yes | Yes |
| Members, roles, and Cloud audit | No | Yes | Yes |
| `Share to PuppyOne Cloud` | Yes | No | No |
| `Work locally` | Not needed | Already local | Yes, when policy permits |

Unavailable local capabilities in Cloud Only must not appear as a wall of
disabled controls. Hide them and provide one truthful `Work locally` action
when the user has permission to create a local workspace.

## Local Only UX

A Local Only Project opens the local workspace immediately.

```text
+------------------------------------------------------+
| [folder] Website                         Local only   |
+-------------+----------------------------------------+
| Files       |                                        |
| Changes     |          local Project content         |
|             |                                        |
| Settings    |                                        |
+-------------+----------------------------------------+
|                         Share to PuppyOne Cloud      |
+------------------------------------------------------+
```

### Local Only behavior

- The header uses the neutral local titlebar material and a folder mark.
- `Files` reads the authorized local folder.
- `Changes` represents the local Git working tree and history.
- Terminal and local Agent tools execute against the authorized local
  workspace.
- Cloud-only navigation is absent.
- Cloud availability must never block local open, edit, Git, or preview.
- A clear `Share to PuppyOne Cloud` action explains which Cloud capabilities
  will be added before uploading or binding anything.

## Local + Cloud UX

Sharing a Local Only Project upgrades the existing entry. It does not create a
second Project.

```text
Local Only Project
       |
       | Share to PuppyOne Cloud
       v
same Project identity
Local + Cloud
```

The resulting Project opens the local working workspace by default because it
exists on the current device.

```text
+----------------------------------------------------------------+
| [folder + cloud] Website                                       |
|                  Working locally - Cloud synced                |
+--------------+-------------------------------------------------+
| Files        |                                                 |
| Changes      |              current Project content            |
| Reviews      |                                                 |
| Assets / MCP |                                                 |
| Automation   |                                                 |
| Settings     |                                                 |
+--------------+-------------------------------------------------+
```

### Local + Cloud behavior

- `Files` uses the local working workspace by default.
- `Changes` continues to own local uncommitted and committed Git work.
- `Reviews` owns published Cloud review and merge workflows.
- `Assets / MCP` owns Cloud-backed access, distribution, and Hosted MCP.
- `Automation` owns Cloud background processes and information-source sync.
- The Project name carries a small Cloud indicator and explicit sync copy.
- The header remains the neutral local material while the active working
  workspace is local. A small Cloud indicator communicates that Cloud services
  are attached without pretending the active file source is Cloud Only.
- Cloud authentication or temporary network failure may degrade Cloud routes,
  but it must not block local Files, Changes, Terminal, or local Agent work.

The normal user does not open a separate Cloud page to manage Reviews, MCP, or
Automation. Those routes live inside the same Project shell.

## Cloud Only UX

A Cloud Only Project can be created directly in PuppyOne Cloud or reached when
a Cloud-hosted Project has no local workspace on the current device.

```text
+----------------------------------------------------------------+
| [cloud] Enterprise Knowledge          Cloud hosted              |
|                                          Work locally           |
+--------------+-------------------------------------------------+
| Files        |                                                 |
| Reviews      |          Cloud-streamed Project content         |
| Assets / MCP |                                                 |
| Automation   |                                                 |
| Settings     |                                                 |
+--------------+-------------------------------------------------+
```

### Cloud Only behavior

- The titlebar uses the dedicated Cloud sky-blue material and a Cloud mark.
- `Files` loads the Cloud directory and metadata first, then streams content
  and previews on demand.
- The application does not download the entire Project implicitly.
- `Reviews`, Hosted MCP, distribution, Automation, members, roles, and audit
  are available according to plan and permission.
- Local Changes, local Git, local Terminal, local Plugins, and local Agent
  execution are absent because no authorized local workspace exists.
- `Work locally` creates or attaches a local workspace to this same Project.
  It never creates a duplicate Project entry.
- Enterprise policy may hide `Work locally`, prohibit downloads, or restrict
  persistent cache to managed devices.

When `Work locally` completes, the Project becomes Local + Cloud on that device:

```text
Cloud Only
    |
    | Work locally
    v
same Project identity
Local + Cloud
```

## Files Source Selection

There is one `Files` destination in the Project shell. The user does not choose
between a Local Files page and a Cloud Files page every time the Project opens.

The selection rule is:

```text
authorized local workspace exists on this device?
        |
        +-- yes --> Files uses the local working workspace
        |
        `-- no  --> Files uses the Cloud data port
```

The active source must be visible in the header or Files context:

- `Local only`
- `Working locally - Cloud synced`
- `Working locally - Sync required`
- `Cloud hosted`
- `Cloud hosted - Cached locally`
- `Offline`

Do not use the word `Cloud` alone when the distinction matters. `Backed up`,
`Shared`, and `Cloud hosted` are different promises:

- **Backed up** means Cloud holds a recoverable copy.
- **Shared** means collaboration services are active.
- **Cloud hosted** means Cloud is the primary content source for this Project
  or resource scope.

## Cloud Storage and Large Data

Cloud Only must support Projects larger than local disk or memory. The Desktop
is a Cloud client in this state, not a mandatory full replica.

The UX contract is:

1. Load directory and metadata before content.
2. Stream previews and file ranges on demand.
3. Cache opened content within explicit limits.
4. Download persistently only after an explicit offline/pin action.
5. Display cache, download, and policy state honestly.
6. Allow administrators to prohibit local download or persistent cache.

```text
PuppyOne Cloud / S3
        |
        +-- directory + metadata
        +-- streamed preview
        +-- bounded temporary cache
        `-- explicitly pinned offline content
```

A temporary cache is not a second Project and must never appear as one in the
Projects list.

## Cloud Entitlement, Attachment, and Deployment

Four user states must remain separate:

1. **Entitlement** — the account has purchased PuppyOne Cloud capability.
2. **Attachment** — this Project is connected to a Cloud Project identity.
3. **Content availability** — the relevant data is resolvable by Cloud.
4. **Service deployment** — a Hosted MCP endpoint or Automation has actually
   been configured and deployed.

Purchasing Cloud does not automatically perform the remaining three steps.
Connecting a Project does not automatically expose all content through MCP.

### Contextual Cloud Project resolution

Opening Cloud or Claude from an already-open Local workspace is a contextual
Project-resolution operation. It asks exactly one question:

> Which PuppyOne Cloud Project and Scope, if any, does this local workspace
> represent for the currently signed-in user?

It is not an Organization Project-browser operation. The contextual surface
must never answer this question by listing every Project visible to the user or
by asking the user to choose among unrelated Projects. `Open existing Project`,
`Use here`, and per-Project clone actions belong to a global Cloud Projects
browser, not to the Cloud surface of an open Local workspace.

#### Identity and authority remain separate

Five facts participate in resolution and must not be collapsed:

```text
Local workspace instance
  -> identifies this physical checkout on this device

Canonical Git locator
  -> declares one Project root or one Project + non-root Scope
  -> contains no credential and grants no access

Human Cloud session
  -> supplies the current JWT ProjectGrant
  -> is the only authority for Project UI and control-plane data

WorkspaceBinding
  -> durably associates one workspace instance with one Project/Scope
  -> owns binding lifecycle and binding-specific machine credential
  -> grants no human access

Git runtime credential
  -> authenticates clone/fetch/push through one bounded RuntimeGrant
  -> never authorizes Project settings, Team, Billing, or other human APIs
```

The canonical locator families are:

```text
Project root  https://<trusted-git-origin>/git/{project_id}.git
Scoped view   https://<trusted-git-origin>/git/{project_id}/scopes/{scope_id}.git
```

The repeated Project ID in the scoped URL is intentional. It lets Desktop
identify one deterministic Project without resolving a secret, while the
server still verifies the Project/Scope relation and the current human grant.
Names, paths, access keys, query parameters, and URL credentials are never
Project identity.

#### Project context is not the same as Workspace Binding

Desktop uses two related but distinct results:

```ts
type ProjectContextResolution =
  | { status: "resolving" }
  | {
      status: "resolved";
      resolutionSource: "workspace-binding" | "canonical-remote";
      projectId: string;
      scopeId: string;
      bindingKind: "full" | "scoped";
      bindingId: string | null;
      bindingStatus: "bound" | "not-bound";
      capabilities: string[];
    }
  | { status: "local-only" }
  | {
      status: "recovery";
      reason:
        | "wrong-account"
        | "wrong-host"
        | "not-authorized"
        | "not-found"
        | "binding-revoked"
        | "role-downgraded"
        | "locator-conflict"
        | "legacy-confirmation-required"
        | "network"
        | "unresolvable";
      projectId?: string;
    };
```

`resolved` means the current account may enter exactly one Cloud Project
context. It does not imply that Desktop may silently create a binding, issue a
credential, mutate Git configuration, or upload content. A canonical remote
can therefore open an authorized Project even when a durable WorkspaceBinding
is missing. The Project shell may show a non-blocking `Finish connecting this
workspace` or `Repair connection` action when binding-specific sync capability
is absent.

WorkspaceBinding remains the durable local identity for Local + Cloud. It is
required before Desktop claims that this workspace has a managed persistent
attachment or issues a binding-specific machine credential. Creating,
replacing, or revoking it is an explicit attach, repair, or detach operation.

#### Exact resolution algorithm

Desktop resolves the current Local workspace in this order:

```text
Open current Local workspace
        |
        v
Wait for workspace config + complete Git remote snapshot
        |
        v
Normalize all PuppyOne fetch and push locators
        |
        +-- conflicting Project/Scope/origin facts --> recovery: locator-conflict
        |
        +-- valid binding hint exists
        |       |
        |       +-- server validates binding, account and capabilities
        |       |       |
        |       |       +-- valid and locator agrees --> resolved exact Project
        |       |       +-- remote missing -----------> resolved + repair warning
        |       |       `-- revoked/mismatched -------> recovery
        |       |
        |       `-- no usable binding
        |               |
        |               +-- one canonical locator ----> server context resolver
        |               +-- legacy access locator ----> explicit migration flow
        |               `-- no locator ---------------> local-only
        |
        `-- no binding hint
                |
                +-- one canonical locator ------------> server context resolver
                +-- legacy access locator ------------> explicit migration flow
                `-- no locator -----------------------> local-only
```

The server context resolver must validate the trusted Cloud/Git origin, parse
the canonical grammar, authorize `Project Read` for the current JWT, verify the
exact Scope belongs to the Project, and return current capabilities. Only after
that response may Desktop render Project metadata or navigate to the Project.
An unauthorized or missing target fails closed and never falls back to a broad
Project list.

An authorization fact-store or workspace-binding storage outage is different
from a missing Project, binding, Scope, or grant. The backend must fail closed
with a generic retryable `503` and must not convert that outage into absence.
A safe control-plane read retries one HTTP transport failure; mutations are not
automatically replayed. The Electron bridge must preserve the HTTP status
across IPC. Desktop may retain a Project only when the same resolution key
already has a server-verified exact context; otherwise it shows a temporary
verification recovery state with Retry, not deletion or account-switch
guidance.

The binding is the durable identity fast path, but an active canonical remote
is also an integrity fact. When both exist they must agree on Cloud origin,
Project ID, Scope ID, and full/scoped kind. A valid binding with a missing
remote may still open the Project with a repair warning. A binding and remote
that point to different targets are ambiguous and must enter recovery rather
than silently preferring either one.

The blocking boundary is deliberately narrow. Desktop waits for the initial
workspace-config read and the first complete Git snapshot; later watcher or
focus refreshes keep the previous snapshot visible and re-resolve only if an
identity fact actually changes. Git HEAD/status changes and public session
status/expiry refreshes are not identity changes and must not repeat binding
authorization or Project-detail hydration. A successful binding response is already the
current human authorization decision and must include the current Project
capabilities, so Desktop may enter the exact Project immediately. Project
metadata, aggregate details, and Claude/Git readiness hydrate after navigation
and never hold identity resolution behind `Matching folder`. Readiness affects
feature availability inside the Project; it is not evidence for Project
identity and is not part of the resolver's critical path.

#### Remote collection and ambiguity

Desktop must inspect all Git remotes, including both fetch and push URLs. It
must not stop at the first URL that matches PuppyOne syntax.

1. Reject credentials, query strings, fragments, unsupported transports, and
   malformed or percent-encoded identity.
2. Normalize each accepted locator to
   `(cloudOrigin, projectId, scopeId, bindingKind)`.
3. Treat duplicate remotes with the same normalized locator as one candidate.
4. Treat a fetch/push mismatch, different Project IDs, different Scope IDs, or
   different Cloud origins as `locator-conflict`.
5. Never resolve ambiguity by Organization-list order, remote iteration order,
   remote name alone, or a stale browse selection.

The configured primary PuppyOne remote may explain which remote is expected,
but it cannot override contradictory canonical identity silently. Development
may map a trusted production Git origin to a loopback API through an explicit
dev configuration; production origin validation must not be weakened to make
localhost testing convenient.

#### Contextual surface versus global Project catalog

The two surfaces have different ownership and data contracts:

| Surface | Project identity input | May call Project catalog? | Result |
| --- | --- | :---: | --- |
| Open Local workspace -> Cloud/Claude | binding or local Git locator | No | exact Project, local-only, or recovery |
| App home with no active workspace | current account | Yes | unified Projects list |
| Explicit global Cloud Projects browser | current account | Yes | Cloud-only browsing/opening |
| Open Cloud-only workspace | stored Cloud Project ID | No | exact Cloud Project |

The contextual data hook accepts an authorized `projectId` or remains idle. It
must never interpret a missing `projectId` as permission to call
`listProjects`. Catalog loading belongs to a separate global/home hook. A
transient global browse selection must be cleared when a Local workspace opens
and must never override its binding, locator, local-only, or recovery state.
While Desktop is restoring the last workspace, the temporary absence of a
renderer workspace is an unknown startup state—not the global home—and must
not start an Organization catalog request.

Once context resolves, navigation enters the exact Project overview or
contents route and exposes Project-scoped routes according to returned
capabilities. When context is `local-only`, the surface shows the Local
workspace summary and one primary `Back up and connect`/`Share to PuppyOne
Cloud` action. It does not render an Organization Project count, unrelated
Project rows, `Use here`, or clone commands. Team and Billing remain explicit
global account destinations; they are not the fallback page for unresolved
local context.

#### Backend contract

The backend canonical resolver may evolve the existing
`resolve-canonical-remote` endpoint or expose an equivalent Desktop Project
context endpoint. Its response is an authorized context, not a legacy
confirmation candidate, and contains no replayable secret:

```ts
type CanonicalProjectContext = {
  project: {
    id: string;
    name: string;
    capabilities: string[];
  };
  scope: {
    id: string;
    kind: "full" | "scoped";
    path: string | null;
  };
  locator: {
    projectId: string;
    scopeId: string;
    bindingKind: "full" | "scoped";
  };
};
```

Canonical resolution does not require user confirmation because the locator is
stable and secret-free; the current JWT still decides whether the user may see
the Project. Legacy `/git/ap/<secret>.git` resolution remains confirmation-
gated during migration because its path is a credential, not durable identity.
Neither response returns Git credentials, shared keys, binding credentials, or
an unfiltered Organization Project list.

#### Persistence and race safety

Desktop persists only non-secret identity facts for a durable attachment:

```json
{
  "project": { "workspaceInstanceId": "stable-local-instance" },
  "cloud": {
    "origin": "https://cloud.puppyone.ai",
    "projectId": "project-id",
    "bindingId": "binding-id"
  }
}
```

The manifest never stores the binding credential, role, capability snapshot,
absolute path, or access key. A context resolved only from a canonical remote
must not invent a binding ID. An explicit connect/repair flow may create the
binding, write its non-secret facts, configure the canonical remote, and place
the one-time credential in the OS-backed Git credential helper.

Every asynchronous result is keyed by workspace instance, normalized Cloud
origin, account/session generation, and locator or binding identity. Switching
folder, account, host, or remote invalidates the prior request. A late catalog,
resolver, or Project-detail response from an old context must never replace the
active Project.

The active resolver stamps its in-memory result with that secret-free context
key, and the attachment projection requires an exact key match before it may
promote a Project ID. Recent-workspace badges and other cache hints do not carry
this authority. Legacy locator material contributes only its already-masked
display identity; the raw access credential never enters the key.

#### Failure behavior

| Condition | Contextual result | Required UX |
| --- | --- | --- |
| Folder is not a Git repository | `local-only` | Local summary + Back up and connect |
| Git repository has no PuppyOne locator | `local-only` | Local summary + Back up and connect |
| Canonical locator + authorized JWT | `resolved` | Enter exact Project directly |
| Canonical locator + signed-out session | `recovery` | Sign in for the locator's trusted host |
| Canonical locator + wrong account/role | `recovery` | Switch account or Request Access |
| Wrong Cloud/Git host | `recovery` | Explain host and offer explicit switch |
| Project or Scope was removed | `recovery` | Explain stale remote and open Git repair |
| Authorization/binding storage returns retryable 503 after its bounded safe-read retry | resolved warning when already verified; otherwise temporary recovery | Retry; do not imply deletion, switch account, or enumerate Projects |
| Binding revoked or downgraded | `recovery` or resolved read-only warning | Reattach or explain current capability |
| Conflicting PuppyOne remotes | `recovery` | Show conflicting remote names/targets |
| Network failure with verified binding | resolved warning when safe | Keep local work usable; retry Cloud |
| Network failure without verified context | `recovery` | Retry; never guess or list Projects |

Here, `verified` means that the server successfully validated the binding in
the current secret-free resolution context, or that an in-memory result with
the exact same workspace, account/session generation, host, binding and remote
key was already validated. A manifest Project ID or binding ID alone never
qualifies as verified context.

Role/account/host/binding failures leave local Files, Changes, Terminal, and
local Agent work usable. Recovery never deletes local content, silently
rebinds, rotates a credential, uploads data, or scans the Organization.

#### Version Engine boundary

Context resolution is a control-plane operation above Git transport. It reads
identity and authorization facts; it does not call S3 object storage, create a
Version Engine transaction, materialize a RepoFacade, or change canonical root
state.

```text
Desktop context resolution
  -> canonical locator + Human JWT
  -> ProjectGrant + exact Project/Scope UI context

Git content operation
  -> canonical locator + Git runtime credential
  -> RuntimeGrant
  -> Git adapter / RepoFacade
  -> existing Version Engine admission and transaction path
```

Backing up or publishing continues through the existing Git/RuntimeGrant entry
point. The Project-context resolver must never become a second content-write
path or bypass Version Engine invariants.

#### Ownership of the implementation

| Layer | Required change | Explicitly unchanged |
| --- | --- | --- |
| Desktop | remote-set normalization, resolution state machine, feature-owned Workspace Surface projection, contextual routing, data-hook separation, recovery/local-only UX, stale-request protection | local filesystem and Git authority |
| Backend control plane | canonical context response, current JWT authorization, exact Project/Scope validation, capabilities, fail-closed errors | machine RuntimeGrant semantics |
| Database | use existing Project, Scope, membership and WorkspaceBinding facts | no schema or data migration required |
| Version Engine | no change | canonical root, scope projection, CAS, S3 and transaction kernel |

This is therefore primarily a Desktop architecture change with a small but
necessary backend control-plane contract change. It is not a database or
Version Engine migration.

### MCP rule

A personal MCP server may run locally while Desktop is running. A stable,
team-shareable Hosted MCP endpoint requires Cloud-resolvable resources.

For a Local Only scope, the UX may offer:

```text
Run local MCP
Share this Project to deploy Hosted MCP
```

For Local + Cloud and Cloud Only, Hosted MCP is available only for resources
that Cloud can authorize and resolve. The product must not imply that an
offline laptop is a continuously available Cloud service.

## Changes and Reviews

Local Git Changes and Cloud Reviews are related but not interchangeable.

- `Changes` owns the private/local working state.
- Publishing work creates or updates a Cloud change request.
- `Reviews` owns discussion, required human review, checks, conflicts, approval,
  and merge decisions.
- Agent execution approval remains in the Agent surface; it is not a Review.
- Agent-authored or Automation-authored Cloud changes enter Reviews before
  changing protected shared state.

The longer-term domain object is a Change whose lifecycle may include local
work, draft publication, Review, merge, and recorded decision. Git remains the
version mechanism underneath; users must not be forced to jump between an
editor product and a separate GitHub-like product to complete that lifecycle.

## Claude readiness

Claude Project runtime is not unlocked by Cloud metadata, an empty Project, a
non-root checkout, or a Web/API-created root head. Cloud must report all three
durable facts:

1. an active Git surface on the canonical root scope;
2. a valid canonical root head;
3. a committed root `access_git` Version Engine transaction proving the first
   Git push was accepted.

Until then the Project shell shows `Create Git` or `Push your first commit` and
does not request or create Claude runtime. A scoped checkout always explains
that the full root checkout is required.

## Visual Semantics

Visual treatment communicates the active working source, not merely account
subscription.

| State | Project mark | Header treatment | Required status copy |
| --- | --- | --- | --- |
| Local Only | Folder | Neutral local material | `Local only` |
| Local + Cloud | Folder with small Cloud indicator | Neutral local material | `Working locally` plus Cloud sync state |
| Cloud Only | Cloud | Dedicated Cloud sky-blue material | `Cloud hosted` |

The full Cloud titlebar treatment must not appear simply because the account
owns a Cloud plan. It appears when the active workspace is Cloud Only. A local
working workspace with Cloud services uses the small Cloud indicator instead.

Status color is supplementary. The folder/Cloud mark and readable status text
must communicate the state without color.

## Settings and Management

Project settings live in the same shell and separate authority clearly:

```text
Settings
  Local workspace
    path
    offline/cache state
    detach from this device

  PuppyOne Cloud
    plan and attachment
    storage and sync
    members and roles
    Hosted MCP
    Automation
    audit and retention
```

Cloud may display registered local workspace status such as device name and
last synchronization time. It must not imply that it can read or mutate files
on an offline device. Local filesystem actions remain under the authority of
the authorized Desktop instance.

## Transition Rules

### Local Only to Local + Cloud

- Triggered by an explicit `Share to PuppyOne Cloud` action.
- Explains upload, collaboration, storage, and service effects before starting.
- Preserves the Project identity and local workspace.
- Updates the existing Projects-list entry instead of adding a new one.
- Makes Cloud routes available only after attachment and permission resolve.

### Cloud Only to Local + Cloud

- Triggered by `Work locally` when policy permits.
- Creates or attaches one authorized local workspace instance.
- May download all content or a selected supported scope according to product
  policy; it never silently downloads an unbounded Cloud Project.
- Preserves Cloud Project identity, Reviews, and service configuration.

### Local + Cloud to Cloud Only

- Occurs on a device when its local workspace is explicitly detached or
  removed while the Cloud-hosted Project remains available.
- Must confirm unsynchronized work before detaching.
- Must not delete Cloud content as a side effect of removing a device-local
  workspace.

### Local + Cloud to Local Only

Removing Cloud attachment is a destructive collaboration transition, not a
simple visual toggle. The UX must explain what happens to members, Reviews,
Hosted MCP, Automation, Cloud storage, and remote history. It must verify that
the user has an adequate local copy before offering any operation that could
remove Cloud-hosted content.

## Product and UX Non-Goals

- Do not build separate Local and Cloud applications inside one window.
- Do not duplicate a Project entry after Share or Work locally.
- Do not require every Cloud Only Project to create a local folder first.
- Do not silently upload all local content when a user buys a Cloud plan.
- Do not silently download all Cloud content when a user opens a Cloud Project.
- Do not market large S3-backed storage as proof that PuppyOne is a general
  database product.
- Do not show unavailable local features as unexplained disabled icons in
  Cloud Only.
- Do not let Cloud auth failure block Local Only or Local + Cloud local work.
- Do not use a model/provider choice such as Claude versus OpenAI to determine
  whether a Project is Local or Cloud. Model route and Project availability are
  independent concepts.

## Implementation Direction

The target composition is one Project shell driven by explicit capabilities,
not two page trees with ad hoc cross-links.

```text
Project identity
      |
      +-- local workspace available? ----> Files / Changes / Terminal / Local Agent
      |
      +-- Cloud attached? ---------------> Reviews / Assets / MCP / Automation
      |
      `-- Cloud content source? ---------> Cloud Files data port / Cloud titlebar
```

Route visibility should derive from one capability model or route metadata.
New work must not grow scattered `workspaceIsCloud` conditions across page and
sidebar components when a shared descriptor can express the rule.

The stable Project ID remains distinct from every physical local workspace
instance. Multiple local checkouts may attach to one Project without becoming
duplicate Project identities. See
[Desktop Session, Workspace Identity, and Cache Lifecycle](desktop-session-workspace-cache-lifecycle.md).

## Delivery Sequence

1. **Unified identity and list**
   - one Projects list;
   - clear Local Only, Local + Cloud, and Cloud Only status;
   - no duplicate entry after Share or Work locally.
2. **Unified shell capabilities**
   - stable Files destination;
   - conditional local Changes/Terminal;
   - conditional Cloud Reviews/Assets/MCP/Automation.
3. **Safe transitions**
   - Share to Cloud;
   - create Cloud Only directly;
   - Work locally;
   - detach local workspace with unsynchronized-work protection.
4. **Cloud-scale Files**
   - metadata-first loading;
   - streaming preview;
   - bounded cache and explicit offline pinning;
   - enterprise download policy.
5. **Integrated Change lifecycle**
   - local draft to Cloud Review;
   - human/Agent/Automation authorship;
   - checks, conflict state, approval, merge, and decision history.

## Verification Scenarios

Every implementation milestone must manually and automatically cover the
applicable scenarios:

1. Open a Local Only folder while signed out and offline.
2. Buy/sign into Cloud without attaching the current Project; verify that
   nothing uploads automatically.
3. Share a Local Only Project; verify the same Projects-list entry becomes
   Local + Cloud.
4. Restart the app and open that Local + Cloud Project; verify Files uses the
   local workspace and Cloud routes remain available.
5. Lose Cloud connectivity; verify local Files, Changes, Terminal, and local
   Agent work continue.
6. Create a Cloud Only Project directly with no local path.
7. Open a Cloud Only Project; verify Files uses Cloud streaming and local-only
   controls are absent.
8. Use Work locally; verify the same Project becomes Local + Cloud on that
   device without duplication.
9. Detach the local workspace; verify unsynchronized work is protected and
   Cloud data remains intact.
10. Apply an enterprise no-download policy; verify Work locally and persistent
    cache are unavailable with an explicit explanation.
11. Deploy Hosted MCP only from Cloud-resolvable resources.
12. Switch provider/model in Agent Chat; verify Project Local/Cloud state does
    not change.
13. Create a root head through Product/API without a Git push; verify Claude
    remains at `Push your first commit`.
14. Accept the first root Git push; verify Claude becomes ready.
15. Open a non-Git Local workspace while signed in; verify the contextual Cloud
    surface does not request or render the Organization Project catalog.
16. Open a Git workspace with one authorized canonical Project locator; verify
    Desktop enters that exact Project without binding confirmation or catalog
    enumeration.
17. Open a canonical scoped locator; verify the server returns the exact parent
    Project and non-root Scope and Desktop visibly preserves scoped context.
18. Open a workspace whose binding and canonical remote disagree; verify
    Desktop shows recovery and does not prefer either identity silently.
19. Configure two PuppyOne remotes for different Projects; verify a deterministic
    locator-conflict state independent of remote order.
20. Remove all PuppyOne remotes from an unbound Local workspace; verify the UI
    returns to Local Only with one Back up and connect action.
21. Switch workspace, account, or host while resolution is in flight; verify a
    stale response cannot select or render the previous Project.
22. Open the explicit global Cloud Projects browser with no Local workspace;
    verify catalog browsing remains available there.
23. Make the authorization fact store unavailable; verify the backend returns
    retryable 503, Electron preserves that status, and Desktop neither reports
    Project deletion nor clears a context already verified for the same key.
24. Interrupt the binding-store TLS connection once; verify the safe read
    retries and resolves. Keep it unavailable; verify retryable 503, preserved
    local binding identity, and no automatic mutation replay.

## Invariants

- The user opens a Project, never a separate Local product or Cloud product.
- One Project identity produces one Projects-list entry.
- Local Only, Local + Cloud, and Cloud Only are explicit capability states.
- Local + Cloud opens its local workspace by default on a device where that
  workspace is available.
- Cloud Only can be created directly and does not require a local folder.
- Full Cloud titlebar color is reserved for an active Cloud Only workspace;
  Local + Cloud uses a smaller Cloud indicator.
- Local authority remains usable when Cloud is unavailable.
- Hosted MCP and continuously running Cloud services require Cloud-resolvable
  resources.
- Share, download, detach, and service deployment are explicit user actions.
- Temporary cache, cloned workspace, and Cloud attachment never create a
  duplicate Project identity.
- The Cloud/Claude surface of an open Local workspace never enumerates the
  Organization Project catalog to discover context.
- A canonical Git locator identifies one Project/Scope candidate but grants no
  human or machine authority by itself.
- Current JWT authorization is required before canonical locator metadata may
  become Project UI context.
- WorkspaceBinding is durable attachment identity, not a prerequisite for
  entering an already-authorized canonical Project context.
- Canonical context resolution never creates content, credentials, bindings,
  S3 objects, or Version Engine transactions.
- Authorization dependency failure is never cached or presented as a missing
  Project/grant; it remains fail-closed and retryable end to end.
