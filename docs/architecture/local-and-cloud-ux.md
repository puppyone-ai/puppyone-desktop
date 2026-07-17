# Local and Cloud UX

PuppyOne Desktop presents one Projects entry and one Project shell across local
and Cloud resources. Git remains the synchronization mechanism. A local folder
is not registered with Cloud; the presence of one canonical PuppyOne Git remote
determines whether the open folder has contextual Cloud content.

## Capability states

| State | Local folder | Canonical PuppyOne remote | Authorized Cloud Project |
|---|---:|---:|---:|
| Local Only | yes | no | not queried |
| Local + Cloud | yes | yes | yes |
| Cloud Only | no active local folder | not applicable | yes |

The global Cloud Project catalog is available to a signed-in user regardless of
the active folder. Contextual Project sections for an active local folder are
available only after canonical-remote resolution succeeds.

## Local Only

When actual Git state contains no canonical PuppyOne remote:

- explain that the project is not yet published to PuppyOne Cloud (it may
  already have another Git host);
- present the local repository and the not-yet-initialized Cloud destination as
  one explicit `Push` flow;
- offer one primary `Initialize and Push` action;
- do not call repository-context APIs;
- do not initiate a workspace-specific session restore until the user chooses
  Initialize and Push; a separately restored global account session may be reused;
- do not display Offline, permission, missing-Project, or repair errors;
- ignore stale historical Cloud-shaped config because it is not authority.

A GitHub-only repository and a repository with only a legacy secret-bearing
PuppyOne URL are both local-only for Cloud navigation.

## Initialize and Push to PuppyOne Cloud

First-time Cloud initialization is a single product action backed by a Git
workflow. The local repository must already have a named branch and at least
one commit:

```text
explicit Initialize and Push intent
  -> verify Git repository + named branch + existing HEAD
  -> sign in when required
  -> select the owning Organization explicitly
  -> main process records a durable publish operation
  -> idempotently create Cloud Project + operation credential
  -> add canonical puppyone remote without repointing an existing remote
  -> push captured HEAD SHA to the canonical Cloud main branch
  -> reconcile remote state and complete the operation
  -> open the hosted Project
```

The operation never stages files or creates a commit on the user's behalf.
Staged, unstaged, and untracked changes remain local; only the existing commit
history is pushed. A repository without a commit or a checkout without a named
branch is stopped before any Cloud Project is created and directs the user to
Source Control.

The page shows waiting-for-sign-in, Organization selection,
initializing/pushing, and failure states. An interrupted operation shows
phase-specific Resume and Abandon actions after a window reload or process
restart. Abandon is available only before Cloud accepts content and never
deletes user commits or working-tree changes.
It does not expose Project creation, credential issuance, or remote setup as
separate first-run tasks, and clicking Initialize and Push must never be
implemented as navigation back to the page that is already open. The flow
arrow is labelled `Push`, not `Git push`; Git is the implementation mechanism,
not an extra user decision.

Electron main owns the operation state, idempotency key, Git mutations, and
raw credential. The Renderer only supplies the selected Organization and
renders the public coordinator state. See
[Cloud Project Publish Coordinator](cloud-publish-coordinator.md).

## Local + Cloud

```text
canonical remote
  -> exact Project/root-or-Scope target
  -> current account Project authorization
  -> Project content, readiness, history, and allowed Cloud features
```

The remote does not authorize the user. Desktop sends the parsed structured
target to Cloud and Cloud evaluates the current JWT. Project capabilities in
the response control navigation and actions.

If the account lacks access, the Project or Scope was deleted, the host is
wrong, or remotes conflict, Desktop retains full local access and shows a
specific recovery state. It never guesses from a config Project ID.

## Cloud Only

The global catalog can open a Project without a local folder. “Open locally”
asks the user for a destination, issues a user Git credential, configures the
canonical remote, and then opens the folder. The resulting local workspace is
ordinary Git state; Cloud stores no record of the destination folder.

## Add Cloud Git remote

The operation is target-centric:

```text
select Project/root-or-Scope target
  -> authorize current ProjectGrant
  -> issue one user-owned Git credential
  -> configure canonical Git remote
  -> store credential through OS-protected Git credential flow
  -> refresh actual Git status
```

No local path or workspace instance is sent to the credential endpoint. If
local configuration fails after issuance, Desktop attempts to revoke only the
new credential.

## Remove Cloud Git remote

This action removes the local PuppyOne remote and local sync/backup preference
that names it. The folder immediately becomes Local Only. It does not call a
server folder API and does not imply deletion of the Cloud Project.

User Git credentials have their own lifecycle. Removing one local remote does
not revoke every credential the user may use on other clones or machines.

## Scope UX

A Project-root remote exposes the whole canonical Project repository. A scoped
remote exposes a server-defined path/exclude/mode view. Scope context is shown
only when the Scope belongs to the Project in the URL and the current account
may read the Project. Desktop never clones a synthetic root Scope.

## Backup and source-of-truth preferences

Workspace config may choose a primary remote, watched branch, backup remote,
and sync source of truth. These are local product preferences, not Cloud
identity. Git config remains authoritative for whether a canonical remote
currently exists.

## Error presentation

| Condition | Presentation |
|---|---|
| No canonical remote | Local-only card, no error |
| Resolving | Bounded loading state |
| Signed out | Sign-in guidance |
| 403 | Current account lacks access |
| 404 | Project or Scope no longer exists |
| Wrong host | Remote-host repair guidance |
| Multiple canonical targets | Git remote conflict guidance |
| Temporary network failure | Retry, keep local files usable |
| Session generation changed | Silent internal retry |

Internal exception strings, Electron rejection wrappers, and
`SESSION_CHANGED` are never user-visible copy.

## Security and persistence invariants

- Cloud session secrets stay in Electron main.
- Git secrets stay in a main-only OS-backed secret vault and out of URLs,
  plaintext operation journals, workspace JSON, Renderer memory/persistence,
  and logs.
- Shared workspace config contains no Cloud authorization, Project ID, server
  checkout ID, device ID, or folder identity.
- `workspaceInstanceId` is local-only and exists for window/cache identity.
- An inactive recent folder cannot be mutated through renderer Git/config IPC.
- A canonical remote is a locator; current authorization is always checked.
- Git RuntimeGrant and human ProjectGrant remain separate.

## Acceptance matrix

1. Open a GitHub-only repository: Local Only, zero Cloud context calls.
2. Open a canonical Project-root clone while authorized: Project content opens.
3. Open a canonical scoped clone: exact Scope context opens.
4. Remove the PuppyOne remote: view becomes Local Only without a Cloud error.
5. Sign in as another account without access: local files remain usable and a
   permission recovery state appears.
6. Rotate session during resolution: request retries; no internal text appears.
7. Configure a remote and force local setup failure: newly issued credential is
   compensated by best-effort revocation.
8. Open a signed-out Local Only project: no passive Cloud request; click
   Initialize and Push once, complete browser sign-in, then
   create/configure/push automatically.
9. Initialize a repository with dirty working-tree state: push the existing
   HEAD while leaving staged, unstaged, and untracked changes untouched.
10. Attempt initialization without HEAD or from detached HEAD: stop before
    creating a Cloud Project.
11. Downgrade a user role: existing Git credential becomes read-only on the next
   request.
12. Lose the Project-create response, restart Desktop, and Resume: reuse the
    same Project and credential; do not create duplicates.
13. Lose the Push response after the server accepts it: reconcile the exact
    remote SHA and finish without pushing a second Project.
14. Add or repoint `puppyone` concurrently: stop with a remote conflict and do
    not overwrite the remote or push to an unexpected target.
15. Start from a feature branch, publish it to Cloud `main`, commit again, and
    use ordinary Desktop Push: update `puppyone/main` successfully.
