# Experimental Git Auto Commit

Architecture home: [Git and Source Control Architecture](README.md).

## Status

- **Proposed.** No automatic Git mutation described in this document is current
  product behavior.
- The feature is unavailable unless the release capability, the global
  experimental opt-in, and the workspace-specific policy are all enabled.
- Every gate defaults to off. Shipping the implementation must not silently
  activate Auto Commit for an existing or newly opened workspace.

## Decision

PuppyOne will implement Auto Commit as a workspace-scoped autonomous service in
the Electron main process. It is daemon-like while an authorized workspace
window is alive, but it is not an operating-system daemon and does not continue
after the owning workspace window or application closes.

The Renderer is the control and presentation plane. It may expose settings and
render status, but it must not own the timer, run Git, compose a `stage` plus
`commit` sequence, or infer a commit candidate directly from filesystem events.
Electron main owns scheduling, workspace authority, durable recovery,
coordination with document persistence, and operation results. The local Git
kernel owns a bounded, verified transaction against one authorized worktree.

The first experimental scope is deliberately narrow:

- commit previously untracked, non-ignored regular workspace files only;
- commit to the current named branch;
- preserve tracked modifications, deletions, and every user-staged change;
- never initialize a repository, switch a branch, pull, push, publish, amend,
  reset broadly, stash, or bypass repository hooks;
- skip rather than guess whenever repository or recovery state is ambiguous.

Auto Commit is not Auto Save and it is not remote backup. Document Sessions
remain the authority for making editor state durable. Git records only bytes
that have crossed that durability boundary. A successful local commit remains
local until the user invokes an explicit Push or Publish action.

## Why this is not an external daemon

An OS-level helper would have to duplicate or remotely call all of the hardest
Desktop authorities:

- the active workspace grant owned by Electron main;
- the renderer-owned Document Session durability barrier;
- workspace watcher attribution and internal-write suppression;
- the Git operation coordinator and linked-worktree identity model;
- versioned preferences, upgrades, logging, crash recovery, code signing, and
  one-owner election across app versions.

It would also be able to commit while the editor has unsaved or conflicted
state that it cannot observe. That is the wrong default for an experimental
mutation feature.

The main-process service provides the useful daemon property—autonomous,
view-independent execution while the workspace is open—without creating a
second security and lifecycle boundary. The application service must still be
written against explicit ports for clocks, activity, durability, Git,
preferences, journals, and events. A future background helper may host the same
application service only after it gains an explicit background-consent model,
the same canonical workspace authority, and a cross-process owner lease. It is
not part of this proposal.

## Feature gates and consent

Auto Commit has three independent gates:

| Gate | Proposed key | Authority | Default | Meaning |
|---|---|---|---|---|
| Release availability | `gitAutoCommit` | main-readable build capability | `false` | This build is allowed to expose or execute the feature. |
| Experimental opt-in | `enableGitAutoCommit` | main-owned user preference, projected into Settings → Experimental | `false` | This user has opted into the experimental capability. |
| Workspace policy | `enabled` in the workspace Auto Commit preference | main-owned preference keyed by canonical worktree identity | `false` | Automatic mutations are allowed for this specific workspace. |

The effective rule is:

```text
effectiveEnabled = releaseAvailable
                && experimentalOptIn
                && workspacePolicy.enabled
```

The release gate must be authoritative in Electron main. Adding a Renderer-only
flag to `src/features/flags/` is insufficient because a stale or compromised
Renderer must not enable an autonomous mutation. Main exposes a read-only
capability snapshot to the Renderer and rejects configure/run requests when the
build capability is false.

`ExperimentalSettings.enableGitAutoCommit` is the user-facing projection, but
this field cannot rely only on Renderer `localStorage`. Its setter must be
acknowledged by a main-owned, schema-versioned preference store before the
service can activate. Turning the global experiment on reveals the Repository
setting; it does not enable any repository by itself.

The workspace policy is machine-local. It must not be written to
`.puppyone/config.json`, Git config, or another tracked file, because one user
must not silently enable autonomous commits for collaborators. The preference
store lives under application `userData`, uses atomic mode-`0600` writes, and is
keyed by a hash of canonical worktree/repository identity rather than a
Renderer-provided arbitrary path.

The initial policy schema is:

```text
schemaVersion: 1
enabled: false
scope: untracked-only
minimumIntervalMs: 300000
quietPeriodMs: 60000
```

Only `enabled` and a bounded interval need to be user-configurable initially.
`scope` is fixed to `untracked-only` for the experiment. Unknown schema fields
are ignored; an unsupported future schema fails closed and disables scheduling.

Disabling either opt-in immediately prevents new work. A transaction that has
not changed the index is cancelled. A transaction that has already changed the
index must finish its verified commit or execute journaled recovery before the
service becomes disabled; it must never abandon a half-owned index mutation.

## System boundary

```text
Settings / Source Control (Renderer)
              |
              | read capability, configure policy, render outcomes
              v
Authorized Auto Commit IPC
              |
              v
Electron main: GitAutoCommitService
  |           |             |                 |
  |           |             |                 +--> structured event sink
  |           |             +--> durable policy + transaction journal
  |           +--> DocumentDurabilityCoordinator
  +--> WorkspaceActivityPort + monotonic scheduler
              |
              v
Git transaction coordinator + cross-process lease
              |
              v
local-api/git/auto-commit.mjs
              |
              v
bounded Git CLI commands against one authorized worktree
```

The service is mounted when main assigns a canonical workspace to a window and
is disposed when that assignment is released. It is not mounted by entering the
Source Control view. Hiding the sidebar, switching the active editor, or losing
window focus must not destroy policy or runtime state.

One exact workspace remains owned by at most one PuppyOne window. Linked
worktrees may still share a Git common directory, so service identity includes
both the worktree-specific Git directory and common Git directory.

## Layer ownership

### Renderer control plane

The Renderer owns:

- the Experimental and Repository setting surfaces;
- an explicit confirmation that explains local commits and no automatic push;
- read-only presentation of runtime state, last outcome, blocked reason, and
  last successful commit;
- localized user-facing copy.

The Renderer does not own a long-running timer or a candidate path list. It
cannot submit a commit message, branch, ref, Git directory, or arbitrary set of
paths for an automatic run.

### Main-process application service

`GitAutoCommitService` owns:

- effective feature-gate evaluation;
- lifecycle for every currently authorized workspace;
- activity coalescing, monotonic deadlines, sleep/wake reconciliation, and
  low-priority single-flight execution;
- the Document Session durability barrier and workspace-write idle barrier;
- canonical repository/worktree identity resolution;
- durable transaction recovery and structured outcomes;
- notification of the existing Git refresh lifecycle after a settled mutation.

The service depends on ports rather than Electron globals so its scheduler and
recovery state machine can be tested without a BrowserWindow or wall clock.

### Local Git kernel

The local Git kernel owns:

- fresh status and repository-operation preflight;
- exact untracked candidate derivation from Git truth;
- path, count, size, nested-repository, and sensitive-file policy checks;
- index/ref fingerprints and optimistic external-Git guards;
- exact-path staging, commit execution, verification, and bounded cleanup;
- typed results that contain no credentials or untrusted raw command output.

New behavior belongs in a focused `local-api/git/auto-commit.mjs` module and is
composed by the `local-api/workspace.mjs` compatibility facade. It must not grow
as another orchestration block inside the facade.

## Activity and scheduling

Filesystem notifications are scheduling hints, never commit truth. The service
marks a workspace dirty when any of these occur:

- an editor-owned atomic save completes;
- an external workspace content event arrives;
- initial or focus reconciliation discovers untracked files;
- a previous safe skip requests a later retry;
- recovery clears an incomplete transaction and Git still reports candidates.

Git metadata events alone do not mark content dirty. This prevents the index and
ref writes produced by Auto Commit from scheduling another Auto Commit loop.
They continue to invalidate the normal Git snapshot.

The scheduler is deadline-based rather than an unconditional `setInterval`:

1. The first content activity records `dirtySince` and `lastActivityAt`.
2. A run is eligible no earlier than both the previous successful attempt plus
   `minimumIntervalMs` and the latest external activity plus `quietPeriodMs`.
3. Editor-owned durable atomic saves may advance content activity without being
   treated as a partially written file. External paths must satisfy the quiet
   period.
4. A monotonic clock determines elapsed time. Wall-clock time is display data
   only and cannot cause duplicate runs after a clock correction.
5. Sleep or event-loop suspension causes one reconciliation on resume; missed
   intervals are not replayed.
6. Only one run may be pending or active for a worktree. Further activity sets
   a dirty trailing flag.
7. A busy user Git operation wins. Auto Commit uses a low-priority try-when-idle
   acquisition and reschedules instead of queuing ahead of Stage, Commit,
   Checkout, Pull, or Push initiated by the user.

At application startup, an enabled workspace with existing untracked files is
scheduled after the normal interval; it is not committed immediately merely
because the app opened.

## Document durability barrier

Auto Commit records storage, not an editor model. Before Git preflight, main
requests a workspace-scoped Document Session drain with reason
`git-auto-commit` and waits for all main-owned workspace file writes to become
idle. The current close-only request/response coordinator should be generalized
into a reusable `DocumentDurabilityCoordinator`; Auto Commit must not imitate
the close protocol in a second implementation.

The barrier has these rules:

- it targets only Document Sessions backed by the active local workspace;
- it succeeds only after every candidate session has durably acknowledged its
  latest snapshot;
- conflict, unavailable source, persistence error, timeout, destroyed Renderer,
  or workspace-generation change returns a typed blocked result and no Git
  mutation begins;
- it does not freeze input. Main therefore captures a workspace content epoch
  after the barrier and verifies that the epoch is unchanged before committing;
- activity after the captured epoch aborts before ref mutation, safely recovers
  any exact-path staging, and schedules a trailing attempt.

This barrier is a prerequisite, not a UI convenience. Without it an external
daemon or Renderer timer could commit stale disk bytes while a newer editor
revision remains dirty or in flight.

## Runtime state machine

```text
disabled
   |
   v
idle <------------------------------+
   | content activity               |
   v                                |
waiting -- gate/policy off ------> disabled
   | deadline                       |
   v                                |
durability-check -- blocked ------> waiting/backoff
   |
   v
preflight -- safe no-op ----------> idle
   |                                ^
   v                                |
prepared -> staged -> committing -> verifying -> cooldown
                  \                    /
                   +--> recovering ---+
                            |
                            +--> blocked-needs-review
```

Runtime state is memory-only presentation state. Mutation recovery state is a
durable journal and cannot be reconstructed from a UI label.

Every transition carries a workspace generation. Results from a previous
A → B → A workspace assignment are discarded even when the canonical path is
the same. Dispose cancels waiting timers, durability requests, and pre-mutation
reads; it does not cancel an unsafe-to-abandon staged transaction.

## Git coordination prerequisite

The current process-local coordinator has separate worktree and repository lock
domains. Auto Commit changes both the index and the current branch ref, so the
coordinator must first gain an ordered multi-key lease such as:

```text
withLocks([worktree:<root>, repository:<commonDir>], operation)
```

Acquisition order is canonical and release order is reversed, preventing
deadlocks. Existing Git handlers must declare their real mutation domains:

- Stage, Unstage, and Discard: worktree;
- Commit: worktree plus repository;
- Checkout, Stash-and-Checkout, Pull, and operation Continue/Abort: worktree
  plus repository;
- Fetch, Push, Publish, and remote/config mutations: repository;
- status/history reads: wait for every relevant domain.

Auto Commit must not ship on top of two independent Renderer IPC operations or
an operation coordinator that cannot hold its complete mutation domain.

Process-local locks do not cover another Git client or another PuppyOne binary.
The auto transaction also holds a token-fenced cross-process lease rooted in the
Git common directory. External Git does not honor that lease, so Git-native
index/ref locks, captured HEAD/ref/index fingerprints, exact-path commit
semantics, and post-command verification remain mandatory.

## Transaction preflight

After durability and while holding the complete mutation lease, the kernel
reads fresh Git truth and requires all of the following:

- the feature and workspace policy are still effectively enabled;
- the authorized root still resolves to the captured worktree/common-dir
  identity;
- the repository is on a named local branch or a valid unborn named branch;
- no merge, rebase, cherry-pick, or revert is in progress;
- no conflict resources exist;
- status is complete (`didHitStatusLimit === false`);
- the real index has no staged user changes;
- at least one non-ignored untracked candidate exists;
- candidates pass bounded file-count and total-byte budgets;
- candidates are regular files or explicitly supported symlinks and are not a
  nested repository, submodule boundary, Git administrative path, socket,
  device, or other special file;
- known credential/private-key paths fail closed for manual review;
- Git author identity is valid;
- unattended commit signing is not required;
- the captured workspace content epoch has not changed.

Ignored files never become candidates. Empty directories are not Git objects
and therefore cannot be committed. The first experiment must not use
`git add --all`, because that would include tracked edits and deletions outside
the promised scope.

The initial bounded policy should be conservative and tested with real Git.
Exact numeric budgets are product constants, not user-controlled arbitrary
values. A budget skip reports candidate counts/bytes without logging file
contents.

## Durable transaction and crash recovery

Stage followed by Commit is not an atomic application transaction. A process
may crash after changing the index but before moving the branch. Therefore
Auto Commit requires a durable, worktree-specific journal before its first Git
mutation.

The journal lives under the worktree Git administrative directory, never in the
tracked workspace. It contains:

- schema version and random transaction ID;
- canonical worktree/common-dir identity hash;
- current branch ref and expected HEAD object, including an unborn-head marker;
- initial index fingerprint/tree identity;
- exact candidate paths and captured content epoch;
- current phase and staged index/tree fingerprint once known;
- resulting commit object once observed;
- timestamps for diagnosis, never file contents or credentials.

Journal writes use a mode-`0600` temporary file, file sync, atomic rename, and
parent-directory sync. The metadata watcher ignores journal churn as a direct
status trigger; the service emits one explicit repository invalidation after a
settled operation.

The transaction phases are:

```text
prepared
  -> exact paths staged
  -> staged state verified and journaled
  -> commit only the exact paths
  -> HEAD/ref and committed path set verified
  -> index/worktree reconciled
  -> journal removed
```

The commit command must name the exact candidate pathspec and exclude unrelated
index entries even if an external client races after preflight. It uses an
explicit stable English message such as `PuppyOne autosave: add 3 files`, runs
normal repository hooks, and never adds `--no-verify`. Repositories requiring
interactive commit signing are blocked rather than silently creating an
unsigned commit or waiting for an unattended prompt.

On failure before the branch ref changes, cleanup may unstage only the exact
Auto Commit paths and only when HEAD, index fingerprint, and journal phase prove
that those entries are still owned by this transaction. It must never run a
broad Reset, Restore, Checkout, Clean, or Stash. If ownership is ambiguous, the
index is preserved and the service enters `blocked-needs-review`.

Startup recovery follows this table:

| Journal observation | Recovery |
|---|---|
| `prepared`, HEAD/index still equal the captured baseline | Remove the no-mutation journal and reschedule. |
| staged fingerprint exactly matches the journal and HEAD is unchanged | Unstage only journal paths, verify baseline, remove journal, and reschedule from fresh status. |
| expected commit/ref movement is already visible and its path set matches | Reconcile status, record success, and remove the journal. |
| commit succeeded but hook or post-verification added unexpected state | Preserve history and index; report `blocked-needs-review`. Never rewrite or revert automatically. |
| HEAD, branch, index, repository identity, or path ownership is ambiguous | Preserve everything and report `blocked-needs-review`. |

Recovery runs before ordinary scheduling. Turning the experiment off does not
skip recovery of an already journaled mutation.

## Result contract and presentation

Main publishes one structured result:

```text
outcome: committed | no-op | skipped | failed | needs-review
reason: typed stable code
workspaceGeneration
commitId?: object id
pathCount?: bounded number
occurredAt
retryable
```

Raw stderr, credentials, full local paths, and file contents do not cross into
telemetry or generic logs. Renderer localization maps reason codes to copy.

Expected skips such as `no-untracked-files`, `user-staged-changes`,
`repository-operation-active`, `quiet-period`, or `git-busy` are not modal
errors. Settings shows last attempt and the next eligible time. Failures such as
missing identity, signing required, hook rejection, sensitive candidates, or
ambiguous recovery remain visible until the user resolves them or disables the
workspace policy.

The normal Git refresh lifecycle receives a structured ref/index invalidation
after commit, rollback, or recovery. The mutation result also carries a fresh
snapshot so the UI does not depend solely on a watcher to settle.

## Security and privacy

- Main derives repository paths from an authorized workspace; the Renderer
  never supplies a Git directory, journal path, ref, or automatic candidate.
- Candidate paths come from fresh porcelain status and pass the existing path
  policy before use as literal Git pathspecs.
- `.gitignore` remains the repository policy. An additional small deny policy
  blocks common credential/private-key paths for manual review; it is defense
  in depth, not a replacement for `.gitignore` or secret scanning.
- Filters and hooks execute under the existing bounded, non-interactive Git
  environment. Failure leaves a recoverable journaled state.
- Auto Commit never performs network I/O and never logs file contents, commit
  patches, credentials, or remote URLs.
- The service does not run for a workspace merely because a preference record
  exists; current release capability, current opt-in, and current main-owned
  workspace authorization are required on every attempt.

## Verification gates

Implementation is incomplete until all of these pass:

### Pure policy and scheduler tests

- all three gates default false and combine with logical AND;
- dirty coalescing, minimum interval, quiet period, sleep/resume, trailing work,
  and workspace generation isolation use a fake monotonic clock;
- disable and window/workspace disposal cancel only safe-to-cancel phases;
- user operations take priority over an eligible automatic run.

### Real-repository kernel tests

- only untracked exact paths are committed;
- tracked edits/deletions and pre-existing staged entries remain byte-for-byte
  and index-for-index unchanged;
- ignored, sensitive, nested-repository, oversized, special, conflicted,
  truncated-status, detached-head, and operation-in-progress cases fail closed;
- unborn branch and normal branch behavior are explicit;
- Unicode, spaces, leading dashes, renames, disappearing paths, symlinks, and
  clean filters use literal bounded pathspecs;
- author identity, signing requirements, hook success/failure/timeout, and
  commit-message behavior are covered;
- an external Git stage, commit, checkout, or ref move at each preflight boundary
  never causes unrelated content to be committed or discarded.

### Crash-injection recovery tests

- process interruption is injected after every journal and Git phase;
- exact owned staging is recoverable;
- observed successful commits are reconciled idempotently;
- ambiguous state never triggers broad cleanup or history rewrite;
- recovery runs even when the feature is subsequently disabled.

### Desktop integration tests

- Renderer-owned saves cross the durability barrier before Git begins;
- persistence conflict, timeout, workspace switch, renderer crash, and app quit
  prevent unsafe mutation;
- a hidden Source Control sidebar does not stop the main service;
- closing one workspace window does not affect another;
- no run occurs after the owning workspace is released;
- commit metadata invalidation refreshes Git without causing a scheduling loop;
- preference and journal writes are atomic, schema-versioned, and private.

Architecture checks should reject a Renderer `setInterval` for Auto Commit,
direct Renderer composition of Stage plus Commit, broad `git add --all`, and an
automatic Push/Publish path.

## Delivery order

1. Generalize the Git operation coordinator to ordered multi-domain leases and
   classify existing operations by their real mutation domains.
2. Generalize the Document Session close flush into the reusable workspace
   durability coordinator and expose a main-owned workspace content epoch.
3. Implement the focused Git kernel, durable journal, recovery, and real-repo
   crash-injection tests with no scheduler or UI.
4. Implement the main-process service, monotonic scheduler, policy store, and
   structured result stream.
5. Add the release capability and main-owned experimental/workspace preferences,
   all default off.
6. Add Experimental and Repository settings plus non-modal status presentation.
7. Enable the release availability flag only in intended development/internal
   builds. Stable builds remain unavailable until the recovery and verification
   gates are complete.

## Explicit non-goals for the first experiment

- automatic Push, Publish, Pull, Fetch, Sync, branch creation, or branch switch;
- commits while no PuppyOne workspace window owns the repository;
- an OS login item, launch agent, service, helper process, or external daemon;
- committing tracked modifications or deletions;
- a hidden snapshot ref or separate local-history product;
- automatic repository initialization or Git identity configuration;
- bypassing hooks, signing policy, conflicts, status limits, or sensitive-file
  review;
- rewriting, squashing, amending, or garbage-collecting automatic commits.

If product requirements later demand commits while PuppyOne is closed, that is
a separate background-execution project. It must preserve the same transaction
kernel and journal while adding explicit background consent, installation and
upgrade ownership, one-owner election with Desktop main, and a policy for the
absence of a live Document Session durability authority.
