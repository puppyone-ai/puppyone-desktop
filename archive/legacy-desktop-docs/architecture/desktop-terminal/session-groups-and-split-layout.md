# Terminal Session Groups and Split Layout

Status: implemented on the Desktop integration branch. This document is the
normative product, domain, interaction, lifecycle, and verification contract
for native Terminal splitting. Read it together with
[Desktop Terminal Architecture](../desktop-terminal-architecture.md).

## 1. Decision

Puppyone implements Terminal splitting as a native Desktop workbench
capability. A user drags an existing Terminal Session tab onto the left, right,
top, or bottom edge of a visible Terminal pane. The operation moves that live
Session into the target Terminal Group and changes only renderer-owned layout
metadata. It never clones, restarts, reparents at the OS-process layer, or
replays the command running in that Session.

The accepted model is:

```text
Terminal Session                  one user-owned PTY + one stable xterm runtime
        |
        v
Terminal Group                    one selectable arrangement of visible Sessions
        |
        v
recursive Split Tree              left/right/top/bottom geometry and ratios
```

Puppyone does not use tmux as the split implementation. tmux remains an
ordinary program that a user may run inside any Terminal Session. A future,
explicit `Attach tmux session` launcher may be considered independently, but it
must not become a dependency of native splitting.

The implementation reuses neutral split geometry, pointer-session, stable-host,
and resize principles already proven by Editor. It does not import Editor
business types, copy Editor components, or reinterpret a Terminal Session as an
Editor document.

## 2. Implemented scope

The feature is release-complete only when all ten capabilities below remain
implemented together:

1. a visible Terminal Session tab can be dragged;
2. a tab can be dropped on the left, right, top, or bottom edge of a visible
   Terminal pane;
3. a Session can move from one standalone Group into another Group;
4. a Session already in a split Group can be reordered or moved across nested
   split axes;
5. every split boundary supports pointer and keyboard resizing;
6. a split Session can be moved back into its own standalone Group through an
   explicit `Unsplit Terminal` command;
7. closing a Session removes only that Session, collapses its now-redundant
   split ancestors, and removes an empty Group;
8. closing the auxiliary panel or switching between Terminal and Agent Chat
   preserves live Sessions and the in-memory split arrangement;
9. moving, focusing, splitting, unsplitting, or resizing never recreates or
   closes a PTY/xterm runtime; and
10. the existing file/reference drop behavior inside Terminal remains intact.

The following are intentionally outside the current native split contract:

- dragging a Session between different Puppyone applications;
- dragging a Session between Desktop windows;
- detaching a Terminal into a new native window;
- dragging multiple selected Sessions as one operation;
- persisting or reviving PTY processes across application restart;
- using tmux, screen, WSL, or another multiplexer as the layout authority;
- mirroring one live Session into two panes;
- moving Terminal Sessions into the Editor workbench;
- remote/shared multi-client Terminal attachment; and
- a new command protocol for discovering or controlling arbitrary user
  multiplexers.

These are non-goals, not partially supported hidden paths. Public types and
UI copy must not imply that they work.

## 3. Product terminology

The implementation uses the following terms consistently:

- **Session** — stable product identity for one launcher lifecycle. After
  launch, it owns one `TerminalRuntime`, one xterm instance, and one PTY.
- **Runtime** — non-serializable renderer object that owns xterm addons, DOM
  attachment, bridge listeners, fitting, focus, scroll presentation, and PTY
  writes.
- **Group** — one top-level selectable arrangement of one or more Sessions. All
  Sessions in the active Group are presented simultaneously.
- **Session pane** — one split-tree leaf that presents exactly one Session.
  It is not a second tab container and never contains another local Session
  list.
- **Split node** — renderer-owned geometry metadata with direction, ratio, and
  two non-empty children.
- **Active Group** — the only Group projected into the visible Terminal
  viewport.
- **Focused Session** — the Session that owns command routing and requested
  keyboard focus inside the active Group.
- **Presented Session** — every Session in the active Group while the right
  auxiliary panel is open on Terminal. Presented and focused are different
  states.
- **Standalone Group** — a Group whose split tree contains one Session.
- **Unsplit** — extract one Session from a multi-Session Group and place it in a
  new standalone Group without stopping its process.

The top Session rail remains global. There are no Pane-local tab bars. A Group
is a domain ownership boundary, not necessarily a separate visual row.

## 4. Reference behavior and deliberate divergence

The architecture was checked against the installed Cursor 3.17.8 Desktop
bundle. Cursor/VS Code uses three separate authorities:

```text
TerminalInstance
  -> TerminalGroup
  -> TerminalGroupService
```

Its observable implementation contracts are:

- a Group owns an ordered set of live terminal instances;
- only the active Group is visible;
- every instance in that Group is visible in its split container;
- creating a split supplies the active terminal as `parentTerminal`;
- dragging a terminal entry serializes a terminal resource identity, not its
  screen contents or process command;
- dropping onto a terminal surface presents a split overlay and moves the
  existing instance before or after the target instance;
- moving an instance across Groups does not restart its process;
- `Unsplit Terminal` extracts an instance into a separate Group; and
- split sizes belong to Group layout metadata rather than terminal process
  state.

Puppyone adopts this Session/Group ownership model and live-instance move
semantics. It deliberately does not copy Cursor's current one-axis linear
split container. The requested Puppyone interaction supports right and down in
the same arrangement, so each Group owns a recursive two-axis tree.

Puppyone also does not copy Cursor's HTML Drag and Drop transport. The existing
Terminal body already uses HTML file/reference drops. A pointer-owned drag
session gives Puppyone deterministic gesture cancellation, precise four-edge
geometry, and no payload collision with shell path drops.

## 5. System topology

```text
Workspace auxiliary panel
  |
  +-- RightTerminalPanel                         Terminal composition root
        |
        +-- TerminalSessionHeader                global Session switcher/drag source
        +-- TerminalGroupViewport                active Group split projection
        |     +-- TerminalLayoutNode             recursive geometry only
        |     +-- TerminalSessionHostSlot        stable host attachment target
        |     +-- TerminalSplitResizeHandle      separator semantics/gesture
        |     +-- TerminalDropPreview            transient edge projection
        |
        +-- TerminalSessionHostLayer             flat, stable Session ownership
        |     +-- TerminalSessionHost            startup overlay + runtime view
        |     +-- TerminalLauncher               selecting Session presentation
        |
        +-- useTerminalWorkbench                 command/controller boundary
        +-- TerminalWorkbenchModel               pure Sessions + Groups reducer
        +-- TerminalRuntimeRegistry              one runtime per launched Session
        +-- TerminalTabMoveController            ephemeral pointer session
                  |
                  v typed preload IPC
          create / input / resize / close
                  |
                  v
Electron main process
  +-- TerminalService                            Session ID -> node-pty ownership
  +-- TerminalAgentLaunchResolver                launch-time executable authority
  +-- Terminal Agent Activity                    Session-ID keyed side channel
                  |
                  v
               node-pty
```

Group membership, split direction, ratios, drag previews, and focused pane are
renderer presentation state. They never enter `TerminalService`, preload IPC,
Agent activity payloads, or shell command construction.

The Electron process continues to own process truth. It must not trust a Group
or pane identity to authorize input, resize, or close. Those routes remain
keyed by the existing, window-owned Terminal Session ID.

## 6. Domain state

The serializable state has one Session catalog plus one Group catalog:

```ts
type TerminalSessionId = string;
type TerminalGroupId = string;
type TerminalSplitId = string;

type TerminalWorkbenchState = Readonly<{
  sessions: readonly DesktopTerminalSession[];
  groups: readonly TerminalGroupState[];
  activeGroupId: TerminalGroupId | null;
  nextOrdinal: number;
}>;

type TerminalGroupState = Readonly<{
  id: TerminalGroupId;
  root: TerminalGroupLayoutNode;
  focusedSessionId: TerminalSessionId;
}>;

type TerminalGroupLayoutNode =
  | Readonly<{
      kind: "session";
      sessionId: TerminalSessionId;
    }>
  | Readonly<{
      kind: "split";
      id: TerminalSplitId;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: TerminalGroupLayoutNode;
      second: TerminalGroupLayoutNode;
    }>;
```

A separate Pane ID is not needed for the target. Terminal leaves cannot be
empty and one Session cannot have multiple views, so the stable Session ID is
the semantic leaf identity. Split nodes retain their own IDs so resize state
and React geometry keys remain stable.

Runtime objects do not enter this state. The registry remains an independent,
manager-owned map:

```text
Session ID -> TerminalRuntime
```

A selecting launcher Session may occupy a leaf without a Runtime. Launching it
creates the Runtime under the same Session ID and does not change its Group or
leaf identity.

### 6.1 State invariants

Every reducer result must satisfy all of these invariants:

1. every Session catalog ID occurs in exactly one Group leaf;
2. every Group leaf references exactly one existing Session;
3. one Session ID never occurs twice, including across different Groups;
4. every Group contains at least one leaf;
5. every split has two non-empty children;
6. every split ID and Group ID is unique;
7. `activeGroupId` is null exactly when no Session exists;
8. a non-null active Group exists in `groups`;
9. `focusedSessionId` is a leaf of its own Group;
10. only the active Group can contain the globally focused Session;
11. tree traversal produces a deterministic Session order; and
12. layout actions never change Session lifecycle status or launcher identity.

Development builds and pure-model tests should expose one common invariant
assertion. Production parsing must fail closed to a valid single-Session Group
or an empty workbench rather than retaining a malformed tree.

## 7. Group and Session command semantics

### 7.1 Create a Session

The global `+` command creates a selecting Session in a new standalone Group
and activates that Group. It does not start a Shell or Agent. Existing launcher
deduplication policy may focus an already selecting Session, but it must also
activate that Session's owning Group.

```text
create Session
  -> add Session summary
  -> create Group with one Session leaf
  -> set active Group
  -> show launcher
```

A future explicit `Split New Terminal` command may create a new Session inside
the active Group, but that command is not required to implement tab-drag
splitting. It must not silently clone a foreground Agent. Its launcher/profile
policy requires a separate product decision.

### 7.2 Activate a Session

Activating a Session first finds its owning Group:

- if the Group is already active, keep the complete split arrangement visible,
  update that Group's `focusedSessionId`, and focus the requested Runtime;
- if the Group is inactive, switch the active Group, present every Session in
  that Group, then focus the requested Session after layout commit.

Activating a Session never assigns it into another Group and never hides its
split siblings.

### 7.3 Drag a standalone Session into a visible Group

```text
before
  Group A: A
  Group B: B

action
  move B to the right edge of A

after
  Group A: split(horizontal, A, B)
  Group B: removed
  active Group: A
  focused Session: B
```

The same Session ID and Runtime survive. There is no create, close, shell
write, or command replay IPC.

### 7.4 Move a Session within one Group

The command first extracts the source leaf and collapses its old parent. It then
inserts the same leaf at the requested edge of the target leaf. Existing
unaffected nodes and ratios remain unchanged.

Direct sibling reorders should preserve the existing split-node identity and
ratio when direction is unchanged. Dropping a leaf back into its current slot
returns the same state object. These rules prevent unnecessary geometry
replacement and make no-op gestures observable as no-ops.

### 7.5 Move a Session across Groups

The command is one atomic pure-state transaction:

1. locate source and target Groups from Session IDs;
2. extract the source leaf from its source Group;
3. collapse redundant source split ancestors;
4. remove the source Group if it became empty;
5. insert the source leaf at the target edge;
6. preserve all unaffected target ancestors and ratios;
7. activate the target Group; and
8. focus the moved Session.

Intermediate invalid state must never be published to React. In particular, a
Session cannot briefly exist in both Groups or no Group.

### 7.6 Unsplit

`Unsplit Terminal` is available only when the Session's Group contains more
than one leaf. It extracts the leaf, collapses the old tree, creates a new
standalone Group adjacent to the old Group in deterministic order, activates
the new Group, and focuses the Session.

Unsplit changes only Group/layout state. It does not restart the Shell or Agent
and does not reset xterm scrollback.

### 7.7 Close

The existing user confirmation remains the authority for stopping a live
Session. After confirmation:

1. remove the Session leaf;
2. collapse redundant split ancestors;
3. remove an empty Group;
4. choose a deterministic surviving focused Session and active Group;
5. remove the Session summary; and
6. dispose exactly that Session's Runtime/PTY once.

Closing one split Session must not close its siblings. Closing the final Session
returns to the existing empty Terminal launcher state.

A layout command never calls `runtimeRegistry.close`. Only the explicit close
transaction and terminal-wide teardown may dispose a Runtime.

## 8. Split-tree operations

Neutral split-tree infrastructure should expose small pure operations instead
of Terminal or Editor copying recursive mutation code:

```text
collectLeaves(root)
findLeaf(root, leafId)
insertLeafAtEdge(root, targetId, sourceLeaf, edge, splitId)
extractLeaf(root, leafId)
moveLeafToEdge(root, sourceId, targetId, edge)
updateSplitRatio(root, splitId, ratio)
map / validate / parse
```

Edge mapping is logical and independent from LTR presentation:

```text
left   -> horizontal + first
right  -> horizontal + second
top    -> vertical   + first
bottom -> vertical   + second
```

Shared operations own structural correctness only. Terminal owns Group removal,
Session membership, Runtime side effects, close confirmation, and focus
selection. Editor retains document assignment, Working Copy, resource
admission, and persistence policy through its own adapter.

### 8.1 Shared extraction strategy

The existing Editor API must not be broken to make this extraction. The safe
sequence is:

1. introduce a domain-neutral split-tree model under Shared UI;
2. preserve the current `EditorPaneLayout*` public API as an adapter over that
   model;
3. move existing Editor structural tests to run against the adapter and add
   direct neutral-model tests;
4. consume the neutral model from Terminal through Terminal-owned types; and
5. promote only interaction primitives whose contracts are genuinely shared.

Terminal must never import `EditorPaneLayoutState`, `moveEditorPane`,
`EditorPaneShell`, or Editor CSS classes.

## 9. Geometry and minimum-size policy

A split ratio alone is not a valid Terminal constraint. xterm and the main PTY
service have a character-grid contract. The current native service accepts no
fewer than 20 columns and 8 rows, so admission and resize constraints should be
derived from measured cell geometry plus owned chrome:

```text
minimum leaf width
  = 20 * current cell width
  + terminal inline inset
  + scrollbar interaction lane

minimum leaf height
  = 8 * current cell height
  + terminal block inset
  + any pane-owned chrome
```

The recursive minimum along an axis is:

```text
split in the measured axis:
  min(node) = min(first) + divider + min(second)

split across the measured axis:
  min(node) = max(min(first), min(second))
```

A requested edge split is rejected when the target leaf cannot provide two
usable children at commit time. The preview must visibly distinguish an
unavailable edge instead of promising an invalid drop.

Puppyone does not impose an arbitrary fixed maximum such as four panes. The
live geometry and character-grid minimum define capacity. If the outer
auxiliary panel is later forced below the preferred recursive minimum by a
small window, existing ratios compress proportionally as a degraded view;
the application must not silently change split direction, close a Session, or
mutate Group membership in response to outer resize.

Ratios are clamped against the measured first/second recursive minimums, not a
single global `15%–85%` constant. Double-clicking a separator restores the
closest valid 50/50 ratio.

## 10. Resize pipeline

Split resizing follows the same direct-manipulation contract as current
high-frequency pane resizing:

```text
pointer move
  -> animation-frame DOM/CSS preview outside React state
  -> each presented xterm ResizeObserver schedules at most one fit per frame
  -> xterm cols/rows change
  -> per-Session terminal:resize IPC
  -> per-Session node-pty.resize

pointer release
  -> commit one durable ratio to the split-tree model
```

Rules:

- no layout transition runs while the separator is directly controlled;
- React does not receive one ratio update per pointer event;
- the separator owns pointer capture and cancellation;
- Escape, blur, visibility loss, pagehide, pointer cancellation, lost capture,
  and unmount restore the committed ratio;
- keyboard arrows commit bounded increments;
- Home/End may move to valid minimum/maximum when exposed by the shared
  separator contract;
- `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` reflect the current
  measured bounds; and
- sibling xterms fit independently and send independent PTY sizes.

The right auxiliary-panel resize remains an outer layout authority. Internal
Terminal separators never change the auxiliary-panel width or the Editor's
minimum-width contract.

## 11. Stable Runtime and host architecture

A Session move must preserve all of these identities:

- `TerminalRuntime` object;
- xterm `Terminal` object;
- xterm buffer and scrollback;
- WebGL/DOM renderer where supported;
- PTY Session ID and main-process `node-pty` object;
- bridge data/exit listeners;
- Agent activity Session ID and claims;
- scrollbar state; and
- startup/exit lifecycle state.

The recursive layout tree therefore cannot own Session components directly.
Changing a split ancestor would otherwise allow React to unmount and recreate
the descendant subtree.

The implementation mirrors the proven persistent-host pattern:

```text
flat TerminalSessionHostLayer
  Session A -> stable detached/attached host A
  Session B -> stable detached/attached host B
  Session C -> stable detached/attached host C

active TerminalGroupViewport
  recursive slots attach those same hosts before paint
```

One stable host exists per Session ID. A layout slot reparents that host in a
layout effect. The Session component remains mounted through group switches,
sibling reorder, nested-axis movement, and split-node replacement.

`TerminalRuntime.mount(container)` remains defensive and may reattach an
existing xterm element, but ordinary layout movement should not depend on a
component unmount/mount cycle. Runtime disposal remains registry-owned.

### 11.1 Presented and focused are separate

The current single boolean must be split conceptually:

```ts
runtime.setPresented(presented: boolean): void;
runtime.setFocused(focused: boolean): void;
```

Equivalent method names are acceptable, but the semantics are mandatory:

- every Session in the active Group is presented when Terminal is the open
  auxiliary surface;
- only one Session is focused;
- every presented Runtime observes size and fits;
- a non-focused presented Runtime remains visible and accepts direct pointer
  focus;
- switching away from Terminal marks all Sessions unpresented but does not
  unmount or dispose them; and
- returning to Terminal presents the active Group, schedules valid fits, then
  restores requested focus.

A fit, resize, or presentation repaint may suppress host-generated activity
noise as the existing Runtime does. It must not manufacture Agent busy state.

## 12. Tab rail and Group presentation

The global Session rail continues to show the flattened, deterministic order of
all Group leaves. Group order comes first; split-tree leaf order is depth-first
`first` then `second` within each Group.

Visual states are distinct:

- **focused** — one selected Session in the active Group;
- **visible sibling** — another Session in the active Group, presented but not
  focused;
- **inactive** — a Session in another Group; and
- **drag source** — transient gesture state that disables activation motion and
  derived click behavior.

Only focused receives the selected-tab treatment. Visible siblings may use one
quiet, non-accent group indicator, but must not appear keyboard-focused or
selected. Group membership cannot be conveyed by color alone.

The existing full/compact/overflow capacity model remains useful, but its
semantic projection changes. Once more than one Session panel can be visible,
a strict WAI tablist is no longer correct: one selected tab no longer controls
the only visible tabpanel.

The rail is an accessible single-select Session switcher/listbox:

- the focused Session is `aria-selected`;
- roving keyboard navigation traverses the complete flattened Session order;
- activating an item applies the Group semantics in section 7.2;
- each visible Terminal pane is an independently labelled region;
- active Group membership is included in accessible descriptions where needed;
  and
- focus restoration remains deterministic after overflow/menu actions.

The visual Tab design may remain unchanged. ARIA must describe behavior rather
than preserve a component's historical name.

### 12.1 Overflow and non-pointer equivalence

The active Session remains outside overflow under the existing Header policy.
Visible rail items are direct pointer drag sources. Sessions reachable only
through overflow must still have a non-pointer command path that can:

- activate the Session;
- move it to the left/right/top/bottom of the currently focused visible
  Session when valid; and
- unsplit it when already grouped.

Pointer dragging directly from an overflow menu may be added only if the menu,
pointer capture, dismissal, and focus-restoration lifecycle is proven. It is
not required to make hidden Sessions operable because the command path is
normative.

## 13. Tab drag interaction

Terminal tab movement uses a feature-owned pointer session rather than native
HTML Drag and Drop.

### 13.1 Gesture lifecycle

```text
pointer down on Session select control
  -> remember source Session and current active Group
  -> capture pointer
  -> do not activate source yet

movement below threshold
  -> remain an ordinary pending press

movement >= 3 CSS px
  -> enter drag state
  -> suppress the browser-derived click
  -> create lightweight Session-chip preview in Desktop overlay root
  -> acquire native-surface pointer-passthrough lease

pointer move
  -> move preview outside React state
  -> elementFromPoint finds a visible Terminal pane
  -> pure edge geometry resolves drop intent
  -> target pane renders a half-pane preview

pointer up with valid intent
  -> atomically move Session
  -> release lease/capture/preview
  -> focus moved Session after layout commit

pointer up without drag
  -> activate Session normally
```

Starting a drag on an inactive Group's tab must not activate that Group. The
currently visible Group is the intended drop surface and must remain visible
until a successful drop or ordinary click completes.

The close button and overflow action buttons never initiate a drag. RTL changes
visual inline direction but not the logical `left`/`right` edge returned from
viewport geometry.

### 13.2 Drop geometry

The target is the nearest normalized pane edge, matching the Editor's direct
manipulation language:

```text
normalized distance to left/right uses pane width
normalized distance to top/bottom uses pane height
smallest distance wins
```

The preview covers the half that the moved Session will occupy. It is rendered
above xterm but remains non-interactive. A source dropped on itself with no
structural change is a no-op.

The preview is a lightweight title chip. Capturing the xterm/WebGL
surface is unnecessary, increases native complexity, and risks exposing
Terminal contents in transient image data.

### 13.3 Cancellation

The drag session is idempotently terminated by:

- Escape;
- pointer cancellation;
- lost pointer capture;
- window blur;
- document visibility loss;
- pagehide;
- component unmount; or
- a competing restarted Terminal drag.

Cancellation removes body classes, source markers, previews, target intent,
and native pointer-passthrough leases. A canceled drag cannot poison the next
ordinary tab click.

## 14. File and reference drops remain independent

`TerminalSessionView` currently accepts workspace/file references and writes
shell-quoted paths into the owning Runtime. Native Terminal tab movement must
not reuse or intercept that HTML data-transfer channel.

The two paths remain intentionally separate:

```text
pointer Session drag
  Session identity -> Group/layout reducer

HTML file/reference drop
  trusted source classification -> path resolution -> shell quoting -> PTY write
```

A Session drag never writes to a PTY. A file drop never changes Group
membership. Regression tests must exercise both after splitting, including a
file drop into a non-focused but visible Session pane.

## 15. Main-process and Agent boundaries

No new Electron Group or split IPC is required. Main continues to own:

```text
Session ID -> sender-owned node-pty
```

Renderer layout actions do not call `terminal:create`, `terminal:close`, or
`terminal:input`. Resize is the only expected process-side effect of changed
pane geometry, and each Session sends its own resulting cols/rows.

Terminal Agent activity remains keyed by Terminal Session ID. Moving a Session
does not issue a new activity token, close a claim, change provider identity,
or reinterpret a native Hook payload. Group and split IDs are presentation
metadata and must not enter activity authorization or public events.

Source Control remains watcher/query-owned. Moving a Session cannot become a
repository refresh signal; actual commands and file changes keep their existing
correctness path.

## 16. Persistence and workspace lifecycle

The current implementation keeps Terminal Group layout in memory only.

- Closing/reopening the right auxiliary panel preserves the workbench because
  the Terminal feature remains mounted.
- Switching to Agent Chat preserves the workbench and every Runtime.
- Switching workspace retires the old Terminal workbench through the existing
  workspace-keyed boundary and closes its PTYs.
- Closing the Desktop window closes all sender-owned PTYs.
- Restarting the application starts with no revived Terminal process or split
  tree.

Do not persist split JSON containing ephemeral Session IDs. The current main
process has no attach/revive contract and creating a duplicate Session ID
replaces the existing PTY. Layout persistence becomes valid only after a
separate persistent-process identity, attach authorization, stale-record
parser, and restore transaction are accepted and implemented.

## 17. Performance contract

- PTY bytes continue to bypass React and write directly to each xterm.
- The workbench reducer receives only low-frequency commands, never pointer
  move events or terminal output.
- Drag preview position and split-resize preview remain outside React state and
  are coalesced at most once per animation frame.
- One durable move/ratio commit occurs at gesture completion.
- Stable Session hosts prevent xterm, WebGL, buffer, scroll, and listener
  recreation during layout changes.
- Only the active Group is presented; inactive Group Runtimes stay alive but do
  not receive redundant fits or focus.
- All Sessions in the active Group fit independently because all are visible.
- Group/header projection derives from immutable summaries and stable callback
  identities.
- A Group switch may render low-frequency Shell state but must not route raw
  output through React.
- Drop target lookup is bounded to visible Session panes; it never scans the
  workspace tree or terminal buffer.
- No Terminal content screenshot is created for drag feedback.

A large number of live, inactive Sessions can still own PTYs and xterm buffers.
That is existing user-owned process state, not a reason to virtualize or dispose
a Session silently. Future resource warnings must be explicit product policy,
not an implicit layout cap.

## 18. Accessibility and localization

- Session switcher behavior must be operable without pointer drag.
- Every Session has a stable accessible name containing ordinal, launcher,
  workspace path, lifecycle status, and Group visibility where useful.
- Every visible pane is a labelled region and exposes whether it is focused.
- Every separator uses `role="separator"`, correct orientation, focusability,
  current value, bounds, arrow-key resize, and 50/50 reset.
- Drop previews are presentational and never announced as content.
- A valid command-based move announces the moved Session and destination.
- Invalid geometry leaves the command disabled with an explainable accessible
  reason; it does not fail silently after activation.
- Focus returns to the moved Terminal after a successful operation and to the
  originating Session control after cancellation when that control still
  exists.
- Long localized labels continue through existing full/compact/overflow policy.
- Logical CSS properties and LTR/RTL geometry tests are mandatory.
- Reduced motion disables derived tab geometry motion and drag-preview
  transitions, but not direct pointer tracking.

## 19. Source ownership

Current ownership is:

```text
packages/shared-ui/src/workbench/split-tree/
  splitTreeModel.ts                    pure structural operations
  splitDropGeometry.ts                 left/right/top/bottom mapping
  splitTreeConstraints.ts              recursive measured minimums
  index.ts                              process-neutral public entry

src/features/desktop-terminal/
  controller/
    useTerminalSessions.ts             Sessions + Groups commands and side effects
  model/
    terminalSessions.ts                lifecycle + Group reducer/invariants
    terminalSplitConstraints.ts        Terminal cell/chrome constraint adapter
    terminalTabMove.ts                 drop-intent value type
  interactions/
    useTerminalTabMoveDrag.ts          pointer session
    useTerminalSplitResizeGesture.ts   pointer-synchronous resize
    terminalTabMovePreview.ts          lightweight overlay chip
  layout/
    TerminalGroupViewport.tsx          active recursive projection
    TerminalSplitResizeHandle.tsx      Terminal separator adapter
    session-host/
      usePersistentTerminalSessionHosts.ts
      TerminalSessionHostSlot.tsx
  runtime/
    terminalRuntime.ts                 presented/focused split
    terminalRuntimeRegistry.ts         unchanged identity authority
  ui/
    RightTerminalPanel.tsx             composition only
    session-header/                    switcher, drag source, command fallback
```

Shared UI cannot import Terminal, Editor, React product composition, Electron,
or xterm. Terminal cannot import Editor feature modules. The App Shell continues
to know only that Terminal is one right auxiliary surface.

The native pointer-passthrough owner catalog gains a Terminal tab-move owner;
that is shared interaction coordination metadata, not Terminal business state.

## 20. Implementation sequence

### Phase 1: lock model behavior

1. Add pure failing tests for Group creation, activation, cross-Group move,
   nested move, direct sibling no-op, unsplit, close collapse, and invariant
   preservation.
2. Introduce the neutral split-tree structural model and preserve the existing
   Editor API through an adapter.
3. Add randomized command-sequence invariant tests with deterministic IDs.
4. Introduce `TerminalWorkbenchState` without changing the current visual
   layout.

### Phase 2: separate runtime presentation from focus

1. Split `setActive` into presented/focused semantics.
2. Make every presented Runtime fit from its own observer.
3. Add focus capture from each xterm pane back to Group state.
4. Prove sidebar hide/show and Chat/Terminal switching preserve Runtimes.

### Phase 3: stable Group viewport

1. Introduce the flat persistent Session host layer.
2. Render the active Group's recursive slots.
3. Add separators with DOM preview and one ratio commit.
4. Verify two and three simultaneous xterms send independent dimensions.

### Phase 4: Session tab movement

1. Add pointer-threshold and click-suppression behavior to visible Session tabs.
2. Add lightweight overlay preview and four-edge target geometry.
3. Add atomic cross-/within-Group move commands.
4. Add Unsplit and non-pointer move actions.
5. Update Header semantics from one-panel tablist to Session switcher.

### Phase 5: integration hardening

1. Preserve launcher/startup/error overlays in split leaves.
2. Preserve Agent availability and activity projections.
3. Preserve file/reference drops in every visible leaf.
4. Run real Chromium xterm/WebGL, rapid drag, resize, RTL, reduced-motion, and
   narrow/wide auxiliary-panel verification.
5. Run the full Desktop test, lint, boundary, TypeScript, and production-build
   baseline.

No phase may land a path that duplicates a Session Runtime or restarts a PTY to
make a layout test pass.

## 21. Verification and acceptance matrix

### 21.1 Pure model

Tests must prove:

- every command preserves all state invariants;
- cross-Group move removes an empty source Group;
- within-Group move extracts before insertion and never duplicates a Session;
- nested horizontal/vertical moves preserve unaffected ratios;
- direct sibling reorder preserves split identity where possible;
- current-slot drop returns the same state;
- unsplit creates one standalone Group with the same Session ID;
- close collapses every redundant ancestor;
- deterministic focus/group fallback after close; and
- malformed or duplicate persisted-looking input fails closed even though
  persistence is not yet enabled.

### 21.2 Runtime ownership

Tests must prove:

- one registry Runtime exists per launched Session;
- moving and unsplitting call neither create nor close;
- the same xterm object and host DOM node survive nested moves;
- startup-to-running transitions do not remount xterm;
- hiding the panel marks Sessions unpresented without disposal;
- showing the panel fits every active-Group Session;
- only the focused Session receives requested programmatic focus;
- closing one Session disposes exactly that Runtime; and
- Strict Mode cleanup/replay cannot destroy a retained Runtime.

### 21.3 Drag and layout interaction

Tests must prove:

- an inactive Session press does not switch Group before the drag threshold;
- an inactive Session ordinary click still switches Group;
- right and bottom targets produce different split directions;
- source-on-self and invalid-size drops are no-ops;
- Escape, blur, pagehide, hidden, pointer cancel, lost capture, and unmount clear
  every preview/body marker/lease;
- canceled drag does not swallow the next tab activation;
- split resize previews outside React and commits once;
- keyboard resize and double-click reset obey measured minimums;
- no direct manipulation transition lags behind the pointer; and
- activation-only Header motion is disabled during a drag.

### 21.4 Product integration

Tests must prove:

- multiple Sessions in one active Group are simultaneously visible;
- clicking a same-Group Session focuses it without hiding siblings;
- clicking another Group switches the complete arrangement;
- launcher, starting, running, exited, and recoverable-error Sessions can be
  moved without losing state;
- file and workspace-reference drops write only to the targeted visible
  Runtime, including a non-focused sibling;
- Agent activity remains keyed to the moved Session;
- closing a running split Session uses the existing safe confirmation;
- right auxiliary outer resize preserves the Editor's minimum-width contract;
  and
- workspace switch/window teardown retain current PTY security ownership.

### 21.5 Accessibility and real Chromium

The real Electron/Chromium gate must cover:

- Session switcher keyboard traversal across active and inactive Groups;
- non-pointer move and Unsplit commands;
- separator semantics and keyboard control;
- focus restoration after drop, command, menu, cancellation, and close;
- light/dark/Windows XP interface styles;
- LTR and RTL;
- reduced motion;
- default, narrow, and wide right auxiliary widths;
- mixed horizontal/vertical three-Session trees;
- rapid repeated tab movement without a WebGL context loss or blank xterm;
- rapid separator and outer-sidebar resize without stale PTY dimensions; and
- CJK, emoji, ANSI color, scrollbar, selection, link, and shell path-drop
  behavior in every visible leaf.

## 22. Release gate

The feature is not release-ready when only CSS displays two terminals. It is
release-ready only when:

- the Group/tree model and invariants are enforced;
- the Runtime/PTY identity tests prove zero restart on movement;
- all ten scoped capabilities in section 2 pass;
- non-pointer equivalents and separator accessibility pass;
- file/reference drops and Agent activity do not regress;
- real Chromium verifies xterm fit and rapid direct manipulation; and
- the complete Desktop repository baseline passes with production environment
  configuration.

If any of these gates fails, disable the complete split capability rather than
shipping a path that can lose a process, duplicate a Runtime, or misroute input.

## 23. Invariants

1. A Terminal Session is a live process identity, not a reusable document
   reference.
2. One Session owns one Runtime, one xterm, and one PTY for its lifetime.
3. One Session appears in exactly one Group leaf.
4. One active Group may present many Sessions; only one Session is focused.
5. Layout actions never create, close, restart, or write to a PTY.
6. Closing a Session is the only ordinary user action that disposes its Runtime.
7. Group/split state remains renderer presentation metadata.
8. Persistent Session hosts sit outside recursive layout ownership.
9. Every presented Session fits independently; focus does not gate visibility
   or resize correctness.
10. Pointer previews and resize previews stay outside durable React state.
11. Terminal tab dragging and file/reference dropping use separate interaction
    channels.
12. Editor and Terminal may share neutral geometry primitives, never business
    state or runtime components.
13. Native splitting has no tmux dependency.
14. Cross-application, cross-window, and process revival remain unsupported
    until separately accepted.
15. Geometry and character-grid constraints, not an arbitrary pane count,
    determine whether a split is valid.

## 24. References

- [Desktop Terminal Architecture](../desktop-terminal-architecture.md)
- [Local Agents and Agent file activity](../desktop-agent/local-agents-and-file-activity.md)
- [ADR-002: Native Terminal Groups and Split Layout](decisions/ADR-002-native-terminal-groups-and-split-layout.md)
- [Editor Workbench Boundaries](../editor/editor-workbench-boundaries.md)
- [Desktop Sidebar Architecture](../desktop-sidebar-architecture.md)
- xterm.js: <https://xtermjs.org/>
