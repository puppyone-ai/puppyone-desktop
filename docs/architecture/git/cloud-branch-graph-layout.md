# Cloud Branch Graph Layout

Architecture home: [Git and Source Control Architecture](README.md).

## Requirement

The desktop Cloud `Branches` page must render a compact Git history graph from
an authoritative topology source. A mapped local repository uses Git's own
topology ordering/prefixes. A Cloud-only project uses the backend's stable,
topologically ordered `parent_ids` + refs snapshot. Neither path may implement
lane lifetime in React component state.

## Final Architecture

The graph layout has three layers:

1. Topology comes from either `local-api/workspace.mjs` (`readGitHistory` calls
   stock `git log --graph --topo-order` and returns `graph_prefix` plus
   continuation prefixes) or the Cloud History read API (signed ref snapshot,
   child-before-parent commits, `parent_ids`, and refs).
2. `src/features/cloud/graph/model.ts` is the public adapter.
   `gitTopology.ts` converts Git prefixes; `cloudTopology.ts` maps the server
   DAG; `shared.ts` owns colors, labels, ref markers, and ref-only rows. These
   pure modules may decide lanes, but React components may not.
3. `src/features/cloud/sections/BranchesSection.tsx` renders the graph
   lines and commit rows. It owns SVG drawing only; it must not decide lane
   order, merge routing, or branch lifetime.

Local `parent_ids` remain metadata because Git prefixes are the stronger local
source. Cloud `parent_ids` are authoritative graph facts and may be mapped only
inside the pure `cloudTopology.ts` policy, never inside JSX.

Branch refs are product state, not just commit topology. If Git collapses a
branch head onto an existing ancestry line, the model should still expose a
small branch-ref marker so the user can see that the branch exists at that
commit.

## Display Examples

The examples below use text diagrams to describe the intended visual output.
`H` is the current workspace `HEAD`, `●` is a commit, `│`, `/`, and `\` are
Git topology lanes, and `[ref]` means a branch/tag-like ref marker plus a row
label. `[ref x3]` means several refs of the same visual class point at the same
commit and should be grouped into one marker with a count.

### 1. Linear Current Branch

```text
H  Update desktop cloud and editor surfaces  [newmu]
│
●  desktop v0.0.1
│
●  Update config.json
```

Render this as one topology lane. The current `HEAD` commit may use the `H`
marker. Do not invent another branch lane just because the current branch has a
name; the row label already names it.

### 2. Remote Ref On The Same Head After Push

```text
H  Update desktop cloud and editor surfaces  [newmu] [origin/newmu]
│
●  desktop v0.0.1
```

This is the "after push" state: local and remote refs point to the same commit.
Use one commit node and one topology lane. Render remote/local refs as row
labels; if a non-current remote ref needs a graph marker, attach a compact ref
marker to the same node. Do not draw parallel lanes.

### 3. Local Branch Ahead Of Remote Before Push

```text
H  Local commit not pushed yet                [newmu]
│
●  Previous remote head                       [origin/newmu]
│
●  Shared ancestor
```

This is the "needs push" state. The remote ref marker belongs on the older
commit where `origin/newmu` still points. Do not draw a remote lane up through
the local-only commit, because the remote ref does not contain it yet.

### 4. Remote Branch Ahead Before Pull

```text
●  Remote commit not pulled yet               [origin/main]
│
●  Local head                                 [main]
│
●  Shared ancestor
```

This is the "needs pull" fast-forward state. Both refs are on the same topology
lane, but they point at different commits. The newer remote row gets the remote
ref marker; the older local row gets the local/current marker if it is selected.

### 5. Diverged Local And Remote Before Pull Or Push

```text
●  Remote-only commit                         [origin/main]
│
│ H  Local-only commit                        [main]
│ │
│/
●  Shared ancestor
```

This is a real branch topology. Render the side lane because Git reports two
visible commit chains. Do not collapse it into ref markers only.

### 6. Pull With Fast-Forward

Before:

```text
●  Remote commit                              [origin/main]
│
H  Local head                                 [main]
```

After:

```text
H  Remote commit                              [main] [origin/main]
│
●  Previous commit
```

Fast-forward pull does not create a merge node. The visual result is linear,
with both refs on the new head commit.

### 7. Pull Or Merge Commit

```text
H    Merge origin/main into main              [main]
|\
| ●  Remote-side commit                       [origin/main]
| │
● │  Local-side commit
|/
●    Shared ancestor
```

This is a merge commit with two parents. Preserve Git's continuation rows, such
as `|\`, `|/`, or `| |/`, so the merge bend is drawn from Git's graph output.
The UI must not create a custom curve from the merge message alone.

### 8. Feature Branch Merged By Pull Request

```text
●    Merge pull request #26 from puppyone-ai/ollie  [origin/main]
|\
| ●  Feature commit                                [origin/ollie]
| │
● │  Main commit before merge
|/
●    Shared ancestor
```

This is visually the same topology class as a local merge, but the row labels
come from remote refs and commit metadata. The graph should show the feature
lane only while feature commits are visible. Once the feature branch ref points
at a commit already on the main lane, it becomes a ref marker.

### 9. Rebase

Before rebase:

```text
●  main commit                                  [origin/main]
│
│ ●  feature commit B                           [feature]
│ ●  feature commit A
│/
●  old base
```

After rebase:

```text
●  feature commit B'                            [feature]
│
●  feature commit A'
│
●  main commit                                  [origin/main]
│
●  old base
```

Rebase rewrites commits and usually removes the merge lane from the visible
future history. Do not preserve the old side lane unless those old commits are
still reachable from visible refs.

### 10. Multiple Refs On One Commit

```text
●──▣  Release checkpoint                        [origin/main] [release] [backup/main]
│
●    Previous commit
```

When multiple non-current refs point at the same commit, use a grouped ref
marker, not a row of tiny unrelated dots. If several refs share the same visual
class, show a count marker such as `[remote x3]` in the graph and individual
labels in the row.

### 11. Remote-Only Branch

```text
●──▣  Remote branch head                        [origin/ollie]
│
●    Shared history
```

Remote-only branches are still branches. If their head commit is visible, show
the remote ref marker and label. Do not require a local branch to exist before
the ref appears.

### 12. Branch Head Outside The Visible Commit Window

```text
visible commit graph:
H  current work                                [newmu]
│
●  recent work

ref-only overflow:
▣  old-release -> 9ab12cd                      outside visible history
▣  experiment-x -> 1c90efa                     outside visible history
```

The branch must not silently disappear. If its head commit is outside the
visible all-branches history window, render it in a separate unresolved/ref-only
area or expand the all-branches window. It should not be forced into the commit
graph as a fake lane.

### 13. Dense VSCode-Style Multi-Lane History

```text
H      Update desktop cloud and editor surfaces       [newmu] [origin/newmu]
│
●      desktop v0.0.1
│
│ ●    Qubits (#1317)                                [origin/main]
│ |\
│ │ ●  Fix frontend editor package deployment (#1316) [origin/qubits]
│ │ |\
│ | |/
|/| |
● │ │  Fix frontend editor package deployment
│ ● │  Qubits (#1315)
│ |\|
│ │ ●  Newmu (#1314)
│ │ |\
│ | |/
|/| |
● │ │  Update desktop data editor workspace
● │ │  updated desktop
│ │ ●  chore: checkpoint workspace changes (#1313)
│ │ |\
│ | |/
|/| |
● │ │  chore: checkpoint workspace changes
│ │ ●  Newmu (#1312)
│ │ |\
│ | |/
|/| |
● │ │  Merge remote-tracking branch 'origin/qubits' into newmu
|\ \ \
● │ │ │ Finalize MCP runtime and access surface cleanup
● │ │ │ feat: refine access workspace surfaces
│ │ │ ● Feat/context entrypoints (#1311)
│ │ │/│
│ │/│ │
```

This is the baseline for "complex enough" rendering. The UI should look like a
compact Git graph: lanes can open, cross, merge, and compact as Git reports.
It must not degrade into one long blue lane plus isolated ref markers, and it
must not draw full-height parallel lanes for refs that are not active in that
part of history.

### 14. Stacked Pull Requests Into A Release Branch

```text
●    Release branch checkpoint                   [release/desktop]
|\
| ●  PR #103 feature commit                      [origin/feature/editor]
| │
● │  PR #102 merged into release
|\
| ●  PR #102 feature commit                      [origin/feature/cloud]
| │
● │  PR #101 merged into release
|/
●    Release base                                [origin/main]
```

Render repeated short side lanes. Each PR opens a lane only for its visible
feature commits and merge continuation. Do not keep old PR lanes alive after
Git compacts them.

### 15. Nested Feature Branch

```text
●      Merge feature/search into feature/editor   [feature/editor]
|\
| ●    Search polish                              [feature/search]
| │
| ●    Search prototype
│/
●      Editor base work
│
●      Mainline base                              [origin/main]
```

A branch can be based on another branch, not only on main. The graph should
show the nested side lane relative to its actual base. Do not redraw it as if
every feature branch started from `origin/main`.

### 16. Backmerge From Main Into A Feature Branch

```text
●    Merge origin/main into feature/editor        [feature/editor]
|\
| ●  Main hotfix                                  [origin/main]
| │
● │  Feature work before backmerge
│/
●    Shared base
```

Backmerge is a merge into the feature branch, not a feature merge into main.
The commit row label and current/ref labels decide the product meaning; the
graph remains the ordinary two-parent merge topology.

### 17. Feature Merged, Branch Ref Deleted

```text
●    Merge pull request #42 from feature/editor   [origin/main]
|\
| ●  Feature commit B
| ●  Feature commit A
|/
●    Previous main
```

If the feature branch ref was deleted after merge, keep the historical topology
because the commits are still reachable through the merge. Do not show a
feature ref marker or label if no ref currently points there.

### 18. Squash Merge

```text
●  Squash merge feature/editor (#42)              [origin/main]
│
●  Previous main

ref-only overflow, if the original feature branch still exists:
▣  feature/editor -> 91c2ab0                      not ancestor of squash commit
```

A squash merge creates a new linear commit on the target branch. The original
feature commits are not parents of the squash commit. Do not draw a side lane
from the squash commit unless those original commits are still visible through
their branch ref.

### 19. Revert A Merge

```text
●  Revert "Merge pull request #42"                [origin/main]
│
●    Merge pull request #42 from feature/editor
|\
| ●  Feature commit B
| ●  Feature commit A
|/
●    Previous main
```

Revert is a normal linear commit. It should not erase the earlier merge
topology from history, and it should not create a synthetic branch lane.

### 20. Cherry-Pick Across Branches

```text
●  Fix copied to release branch                   [release/desktop]
│
●  Release maintenance
│
│ ●  Original fix on main                         [origin/main]
│ │
│ ●  Main work
│/
●  Old shared base
```

Cherry-pick duplicates a patch as a different commit. Similar messages or file
changes do not imply a graph connection. Only Git ancestry should create lanes.

### 21. Force-Push After Rebase

Before fetch:

```text
●  Old feature commit B                           [feature] [origin/feature]
│
●  Old feature commit A
│
●  Base
```

After remote force-push and fetch:

```text
●  Rebased feature commit B'                      [origin/feature]
│
●  Rebased feature commit A'
│
●  New base                                       [origin/main]

ref-only overflow, if local branch still points at old commits:
▣  feature -> old-b                               divergent local ref
```

Do not join old and new histories with a fake line. If both refs remain
reachable, show two separate histories according to Git. If the old local head
is outside the visible graph, show it as ref-only.

### 22. Tag And Release Ref On A Commit

```text
●──▣  desktop v0.1.0 release                      [tag:v0.1.0] [origin/main]
│
●    Previous main
```

Tags and release refs behave like branch refs for display purposes, except they
are not current branches and should not create lanes. Group them with other
refs when they point at the same commit.

### 23. Detached Head

```text
H  Temporary inspection commit                    [detached]
│
●  Known branch head                              [origin/main]
│
●  Earlier commit
```

Detached `HEAD` is a workspace state, not a branch ref. Show the `H` marker on
the checked-out commit, and show real refs separately if they point at the same
or nearby commits.

### 24. Many Remote-Only Branch Heads Outside The Commit Graph

```text
visible commit graph:
H  current work                                  [newmu]
│
●  recent work

ref-only overflow:
▣3 origin/old-release, origin/staging, origin/prod-backup
▣2 origin/research-a, origin/research-b
▣  origin/one-off-fix
```

When the repo has many old remote-only branches, group ref-only rows by commit
and visual class. The graph should stay readable; do not append hundreds of
tiny disconnected dots. A future UI may add filtering, but until then the data
model must preserve those refs instead of dropping them.

## Product Rules

- The graph answers "how commits relate"; labels and ref markers answer "which
  branch names point here."
- A branch is visible as a topology lane only while it has visible commits or
  Git continuation rows distinct from the current lane.
- A branch whose head is an existing visible commit is visible as a ref marker,
  not as a synthetic full-height lane.
- A branch whose head is outside the visible history must still be represented
  as a ref-only item; branch refs should not vanish because of pagination.
- Ref markers should be visually stronger than a tiny dot: they need a short
  connector and a marker sized to read as "branch head", while remaining
  secondary to real commit nodes.
- The right-side row label is not enough by itself. The left graph must also
  show that a ref exists on that commit.
- Commit messages such as "merge", "pull", "rebase", "cherry-pick", or
  "revert" are metadata only. They may influence labels, but only Git ancestry
  may create topology lanes.
- Deleted branch refs must not be shown as current refs, but their commits stay
  in the graph if reachable.
- Squash, cherry-pick, and revert are linear graph operations unless Git
  ancestry says otherwise.
- Multiple refs pointing at the same commit should be grouped by visual class;
  avoid drawing one tiny marker per ref when the row already contains labels.

## Invariants

- Git graph topology comes from `git log --graph`, not from a custom React lane
  state machine.
- Continuation rows emitted by Git are preserved; dropping them causes merge
  curves and lane compaction to break.
- The all-branches history window must be larger than the current-branch
  history window, otherwise older branch heads disappear before the UI can
  label or mark them.
- Branch refs that share a commit line still need visible ref markers.
- Commit rows remain the only interactive rows. Graph-only continuation rows are
  presentational.
- The Branches section may change colors, density, or labels, but must keep the
  data-source boundary above.
