# Desktop Session, Workspace Identity, and Cache Lifecycle

This document is the durable contract for PuppyOne Desktop authentication,
local project identity, recent-workspace persistence, and account-scoped Cloud
caches. The implementation is local-first: Cloud availability must never block
opening or editing a local folder.

## Ownership boundaries

```text
Renderer
  public auth/session state only
  account/revision-aware derived UI cache
       |
       | trusted, sender-validated IPC
       v
Electron main
  Auth Broker
  credential store
  OAuth loopback listener + PKCE verifier
  workspace registry and filesystem identity
       |
       v
PuppyOne Backend
  token validation/rotation/revocation
  Desktop PKCE verification
  project authorization and revision facts
```

The Renderer never receives access tokens, refresh tokens, OAuth verifiers, or
raw credential envelopes. Server authorization remains authoritative; hiding a
button or evicting a UI cache is not an authorization control.

## Authentication lifecycle

`electron/cloud-auth-service.mjs` is the main-owned Auth Broker. It has one
active account and API origin at a time.

- Access tokens live only in main-process memory.
- The encrypted v2 credential record contains the refresh token, immutable user
  ID, display email, API origin, and update timestamp.
- Legacy v1 full-session envelopes are read only to perform one refresh. Their
  access token is discarded and a successful refresh migrates the record to v2.
- A `session_generation` changes on login, logout, account/identity replacement,
  or another auth boundary. Renderer caches and in-flight results are scoped to
  it.
- Refresh is singleflight by `{api_origin, user_id}`. Concurrent callers share
  one refresh and each original request is retried no more than once.

The public session status is one of:

```text
restoring -> authenticated <-> refreshing
                       `----> offline-authenticated
signing-in -> authenticated
authenticated -> signing-out -> signed-out
authenticated -> expired
```

Network/timeout/5xx failures retain the encrypted refresh credential and expose
`offline-authenticated`. A refresh response that explicitly reports an invalid,
expired, or revoked session clears it. A `403` is a permission error and never
starts refresh or sign-in loops.

### Credential durability

Credential and workspace-registry writes use a serialized mutation queue and:

```text
create mode-0600 temp -> write -> file fsync -> close -> rename -> chmod
```

Malformed credential/registry files are renamed to a timestamped `.corrupt.*`
file. On Linux, Electron `safeStorage` using `basic_text` fails closed in
production; insecure storage exists only behind the explicit development flag.

### Browser login

New sign-ins bind a random `127.0.0.1` port and use `/auth/callback`. Main creates
a high-entropy PKCE verifier and sends only its S256 challenge to Desktop start.
The verifier is bound in memory to state, provider, API origin, redirect URI,
and TTL, and is submitted at exchange. It is removed on success, failure,
timeout, cancellation, or app shutdown.

The legacy `puppyone://` receiver remains only for already-open migration flows;
it is not the redirect selected for new sign-ins. The backend must validate the
Desktop challenge/verifier and atomically consume state/exchange codes; shared
backend state is tracked separately by `ISSUE-004`.

### Logout

Logout marks the broker `signing-out`, rotates generation, blocks/aborts old
requests, attempts remote revoke with a bounded timeout, and always clears local
runtime/credential/cache state before broadcasting `signed-out` to every
window. Remote unavailability never prevents local logout.

## Project and workspace identity

Path is location, not identity. An initialized `.puppyone/config.json` uses v2:

```json
{
  "version": 2,
  "project": { "id": "stable UUID" },
  "sync": { "sourceOfTruth": {} },
  "git": {},
  "backup": {},
  "cloud": { "projectId": null }
}
```

- `project.id` is shareable and follows a project when it moves or is cloned.
- `workspaceInstanceId` represents one physical local checkout. It is derived
  from filesystem identity, so rename/move keeps it while another clone gets a
  different value.
- `canonicalPath` and `fsIdentity` locate the checkout; they are not project
identity.

The main-owned recent-workspace registry also caches non-authoritative
home-screen hints for the explicit Cloud binding (`projectId`, `bindingId`,
origin, and configured workspace-instance ID) plus whether a legacy PuppyOne
remote exists. Hydration refreshes those facts from each persisted folder under
main-process control. The renderer may verify the explicit binding through
Cloud APIs, but it must never issue config or Git IPC for an inactive recent
folder: filesystem authority is scoped to the one workspace assigned to that
window. Opening a legacy remote-only workspace is the point where its binding
can be confirmed and persisted safely.
- Opening an arbitrary folder never creates `.puppyone`. The ID is generated on
  an explicit config write/Cloud bind. “Treat as new project” generates a new
  project UUID and clears the old Cloud binding without touching files or Git.

Multiple paths with one project ID are valid clones/worktrees. The global v2
workspace registry stores instance/project IDs, canonical path, filesystem
identity, name, and `lastOpenedAt`. Main serializes all mutations and reconciles
a moved path through instance/filesystem identity.

Recent projects return registry metadata immediately. Full existence/Git/commit
hydration happens in the background with at most four workers; a slow network
volume cannot head-of-line block the remaining list. The existing workspace
watcher reloads atomic create/rename/modify/delete changes to
`.puppyone/config.json`. Invalid or incomplete external replacements preserve
the last verified config and surface a recoverable error.

## Cloud cache contract

Mutable Cloud UI data uses the shared bounded cache in
`src/features/cloud/cache/cloudCache.ts`. Every key contains:

```text
user_id
session_generation
api_origin
project_id
project_revision/head (or explicit mutable-latest sentinel + short TTL)
resource and normalized path
cache schema version
```

The cache enforces entry and estimated-byte limits, LRU eviction, TTL for
mutable results, and request singleflight. Successful Cloud mutations invalidate
their project namespace. Logout/account/host/generation changes clear the whole
active namespace. A late result from an old generation may resolve to its old
caller but is never inserted into the current cache or UI state.

Cache contents are disposable derived data. Cloud APIs, local files, Git, and
server authorization are always the facts of record.

## Verification and recovery

The regression suite covers concurrent refresh, revoked/offline behavior,
credential migration/corruption, PKCE/loopback/replay, remote-failure logout,
late requests, move/symlink/clone identity, concurrent registry writes, corrupt
registry recovery, bounded recent hydration, config watcher filtering, cache
generation/TTL/size/mutation invalidation, and the absence of token-bearing IPC
state.

Run before release:

```bash
npm run lint
npm test
npm run build
```

If Cloud authentication cannot be restored, local workspace open/edit, Git, and
Viewer flows must continue to function. Credential or registry corruption is
reported and quarantined; it never triggers deletion of project files.
