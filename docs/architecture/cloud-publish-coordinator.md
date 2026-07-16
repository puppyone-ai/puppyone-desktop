# Cloud Project Publish Coordinator

`Initialize and Push` publishes one existing local Git commit to a new
PuppyOne Cloud Project. It is a recoverable operation coordinated by Electron
main. It is not a registration of a folder, checkout, computer, or device.

## System boundary

```text
Renderer                         Electron main                    Cloud control plane
--------                         -------------                    -------------------
choose Organization       --->  PublishCoordinator        --->   idempotent Project create
show state / actions      <---  durable operation state    <---   idempotent credential issue
Resume or Abandon         --->  Git + secret ownership     --->   initialization Abandon
                                      |
                                      | exact SHA + canonical URL
                                      v
                               Git smart HTTP
                                      |
                                      v
                            frozen Version Engine data plane
```

The Version Engine remains the authority for Git objects, refs, the Project
root, push admission, merge policy, history, audit, and write follow-up. The
Publish Coordinator neither duplicates those rules nor introduces a second
content path.

## Authorities

| Fact | Authority |
|---|---|
| Organization choice | explicit user choice; auto-selection is allowed only when exactly one Organization is available |
| Project identity | Cloud control-plane response, keyed by the publish operation |
| Local repository identity | worktree-specific Git common-dir/git-dir identity resolved by Electron main |
| Cloud repository locator | exact canonical Project-root Git URL |
| Human authorization | current Cloud session and server-side `ProjectGrant` |
| Git authorization | operation-owned Git credential and server-side `RuntimeGrant` |
| Commit to publish | immutable local HEAD SHA captured before Cloud mutation |
| Accepted remote state | `ls-remote` result for the canonical Cloud branch |

The Renderer is a view/controller client. It does not own an operation ID,
credential, Git mutation, or recovery decision.

## Durable operation, not Binding

The short-lived publish journal exists only to finish or abandon an explicit
user mutation after a process crash. It is stored under the repository's
worktree-specific Git administrative directory and is bound to:

- operation ID and journal schema version;
- repository/worktree identity;
- Cloud API and Git origins;
- authenticated user and explicit Organization;
- captured branch and commit SHA;
- created Project and canonical remote, once known;
- opaque secret-vault reference and credential ID, never plaintext secret;
- current phase and last typed recoverable error.

Writes use a mode-`0600` temporary file, file sync, atomic rename, and parent
directory sync. A completed or successfully abandoned operation removes both
the journal and operation secret. Shared `.puppyone/config.json` contains none
of this state.

This record must never become a durable checkout inventory. Cloud never sees a
local path, worktree identity, journal ID distinct from the mutation's
idempotency key, device ID, or computer ID.

## State machine

```text
none
  -> prepared
  -> project-created
  -> credential-issued
  -> remote-configured
  -> pushed
  -> completed -> journal removed

any incomplete phase
  -> recoverable-error -> Resume
  -> compensation-pending -> Abandon retry
  -> abandoned -> journal and secret removed
```

Every forward step is idempotent:

- Project creation and Git credential issuance use the same UUID operation key
  in endpoint-specific idempotency namespaces.
- The server durably replays the original result for the same canonical
  payload and rejects key reuse with a different payload.
- Remote creation is add-only. Resume accepts an existing remote only when its
  URL exactly equals the journal's canonical URL.
- Push validates the expected remote URL, branch, and SHA while holding the
  repository mutation lock.
- An uncertain push result is reconciled with `ls-remote`. Matching expected
  SHA means success; a different remote head is a conflict and is never force
  overwritten.
- Upstream configuration is repeatable and occurs only after accepted remote
  state is known.

## Preflight and mutation order

Before the first Cloud mutation, main verifies a named branch, existing HEAD,
stable repository identity, known immutable server policies such as unsupported
Git LFS pointers and merge-tip rejection, and absence of a canonical remote
conflict. Dirty index and worktree state is allowed because only the captured
commit is pushed.

The coordinator then performs:

```text
prepare durable intent
  -> create Project in explicit Organization
  -> obtain operation credential in main-only secret storage
  -> add exact canonical Project-root remote
  -> push captured SHA to Cloud main
  -> reconcile remote ref
  -> configure upstream
  -> resolve normal Cloud Project context
```

Ordinary later Pull, Push, and Sync derive PuppyOne hosting from the canonical
remote and upstream. Workspace preference files may tune behavior but cannot
decide repository identity.

## Credential boundary

The raw credential is generated and consumed in Electron main. At rest it is
protected through an OS-backed secret-vault abstraction. The journal stores
only an opaque reference; the Renderer, logs, error payloads, workspace config,
and Git remote URL never contain the secret.

Abandon revokes only the credential owned by the publish operation. It removes
the local remote only if its current URL still exactly matches the
operation-owned canonical URL. It never edits, stages, commits, resets, stashes,
or discards user files.

## Recovery presentation

- No journal and no canonical remote: Local Project with `Initialize and Push`.
- Journal present: show phase-specific `Resume` and `Abandon`; do not fall
  through to a Project Settings route.
- Push reconciled as accepted: finish and open Project content.
- Remote changed or remote head diverged: show a typed conflict and preserve
  both local and Cloud history.
- Abandon not allowed because Cloud already accepted content: keep the Project
  and offer normal repair/open actions.
- Session generation changes: retry internally and never show
  `SESSION_CHANGED`.

## Non-negotiable invariants

- There is no Cloud folder/device/checkout Binding.
- Project creation requires an explicit Organization boundary.
- No raw Git credential crosses into the Renderer or plaintext journal.
- No fresh publish overwrites or repoints an existing remote.
- No push occurs without exact canonical URL and immutable SHA validation.
- No retry creates a second Project or operation credential.
- No compensation deletes a Project after an accepted push.
- No publish implementation changes Version Engine semantics.
