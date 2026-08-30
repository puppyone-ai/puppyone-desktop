# ADR-002: Native Terminal Groups and Split Layout

Date: 2026-08-30. Status: accepted and implemented on the Desktop integration
branch.

## Context

Puppyone Terminal currently owns multiple independent Session tabs but presents
only one Session at a time. The right auxiliary panel can now grow to the live
workbench maximum while the Editor retains its minimum-width contract. Users
need to use that space for simultaneous Shell, development-server, test, log,
and native Agent sessions.

The requested interaction follows the Cursor mental model: drag an existing
Terminal Session tab onto the right or bottom of a visible Terminal, see an
explicit drop preview, and keep both live processes visible. Puppyone also
needs left and top placement and mixed nested axes.

The existing Editor already proves recursive split-tree geometry, edge drop
intent, pointer-synchronous resize, lifecycle cancellation, and persistent host
reparenting. It does not prove Terminal process semantics. Editor leaves
reference reopenable documents; Terminal leaves own live PTYs, xterm buffers,
focus, measured character grids, and user-visible process termination.

The installed Cursor 3.17.8 implementation was inspected as a reference. It
separates `TerminalInstance`, `TerminalGroup`, and `TerminalGroupService`; only
the active Group is visible, all instances in it are presented, tab-to-terminal
drops move an existing instance into the target Group, and Unsplit extracts it
into a separate Group. Its split container is currently a location-dependent,
one-axis sequence. Puppyone requires a recursive two-axis layout.

## Decision

Puppyone implements native Terminal splitting with four independent
architectural authorities:

1. the Session catalog owns stable Session identity and low-frequency launcher
   lifecycle summaries;
2. Terminal Groups own top-level selection and one recursive split tree whose
   leaves are unique Session IDs;
3. `TerminalRuntimeRegistry` owns exactly one stable xterm Runtime per launched
   Session ID; and
4. Electron `TerminalService` continues to own exactly one sender-authorized
   `node-pty` per launched Session ID.

Only one Group is active. Every Session in the active Group is presented, while
one Session is focused. The global Session rail remains the navigation and drag
source. Session panes do not receive local tab bars.

Dragging a Session onto a visible pane edge performs an atomic renderer-only
state transformation:

```text
extract source Session leaf
  -> collapse redundant source ancestors / empty source Group
  -> insert same leaf at target left/right/top/bottom edge
  -> activate target Group
  -> focus moved Session
```

The operation sends no process create, close, input, or replay request. Changed
pane geometry may independently produce the existing resize IPC for each
presented Session.

Puppyone extracts only neutral split-tree structure, drop geometry,
persistent-host, interaction-termination, and resize-preview contracts from the
Editor implementation. Terminal does not import Editor domain types,
components, styles, persistence, or Working Copy behavior. The existing Editor
public API remains an adapter over any neutral extraction.

Terminal tab movement uses a custom pointer session. It does not reuse the
HTML file/reference drop channel already owned by `TerminalSessionView`.

The complete normative target is
[Terminal Session Groups and Split Layout](../session-groups-and-split-layout.md).

## Implemented release boundary

The implemented release slice includes:

1. visible Session-tab pointer drag;
2. left/right/top/bottom pane-edge drops;
3. cross-Group Session movement;
4. nested within-Group movement and reorder;
5. pointer and keyboard split resizing;
6. explicit Unsplit into a standalone Group;
7. deterministic close/collapse behavior;
8. in-memory preservation across auxiliary-panel hide/show and Terminal/Chat
   switching;
9. zero Runtime/PTY restart for every layout operation; and
10. preservation of existing file/reference drops.

Cross-application drag, cross-window drag, native detached Terminal windows,
process revival across application restart, multi-Session drag, and Terminal
movement into Editor are excluded.

## Runtime consequences

Runtime presentation is separated from focus:

```text
presented -> visible in active Group and eligible for fit/resize
focused   -> command target and requested keyboard focus
```

Every presented Runtime owns an independent `ResizeObserver -> FitAddon -> PTY
resize` path. Focusing one split sibling cannot make another visible sibling
skip fitting.

Persistent Session hosts live outside recursive split-tree ownership. Layout
slots attach those same hosts before paint. Moving a Session therefore
preserves the Runtime, xterm object, buffer, WebGL/DOM renderer, bridge
listeners, scrollback, Agent activity identity, and PTY.

## Geometry consequences

Split validity and separator bounds derive from the Terminal character-grid
minimum and recursive child constraints. The current native PTY lower bound of
20 columns and 8 rows is part of that calculation. Puppyone does not ship an
arbitrary fixed pane-count limit or reuse Editor's fixed percentage clamp as
the Terminal correctness rule.

Pointer movement previews CSS geometry outside React and commits one durable
ratio on release. Direct manipulation has no layout transition.

## Accessibility consequences

A strict tablist assumes one selected tab controls the only visible tabpanel.
That stops being true when one Group presents multiple Sessions. The visual Tab
rail will therefore become an accessible Session switcher, with one focused
selection and separate labelled pane regions. Every pointer move has a
command-based equivalent, and separators expose keyboard control and measured
ARIA values.

## Persistence consequences

Group and split state remains memory-only for this release. Current Session IDs
are ephemeral and Electron exposes no process attach/revival authority.
Persisting layout JSON now would create stale references and tempt the Renderer
to recreate an ID whose main-process creation path replaces an existing PTY.

Persistent layout may be reconsidered only with a separate persistent-process
identity, attach authorization, stale-state parser, and atomic restore design.

## tmux decision

tmux is not the split authority or a required dependency.

A tmux-owned screen would give Puppyone one outer xterm while tmux draws its own
character-grid panes, preventing independent Puppyone pane DOM, drag targets,
scroll presentation, focus semantics, and xterm ownership. A deep control-mode
integration would add a second layout authority, server lifecycle, stale
environment, cross-platform installation, close-ownership, Agent-activity, and
reconnection problems without reducing implementation complexity.

Users remain free to run tmux inside any native Puppyone Session. A future
optional attach launcher is a separate product capability and cannot change the
native Group model.

## Consequences

Benefits:

- Cursor-familiar direct manipulation without coupling to Cursor internals;
- true two-axis Puppyone layout in the right auxiliary panel;
- no process restart or output loss when a Session moves;
- one clear process owner and close contract per Session;
- reusable, domain-neutral geometry shared with Editor;
- independent xterm sizing, scrolling, links, theme, and accessibility per
  visible Session; and
- cross-platform behavior with no external multiplexer requirement.

Costs:

- the former global `activeSessionId` reducer became a Group-aware workbench
  model;
- Header semantics and active/visible presentation need to be separated;
- multiple visible WebGL/xterm instances increase rendering and resize test
  surface;
- split admission needs recursive measured minimums rather than one ratio
  clamp;
- tab drag needs robust cancellation and click suppression; and
- process persistence remains unavailable until a separate lifecycle project
  is accepted.

## Rejected alternatives

### Reuse the Editor Pane model directly

Rejected. It encodes Editor names, document assignment, reopenability, and
persistence semantics. A Terminal Session is a live process identity and cannot
be duplicated across leaves or replaced as a normal document reference.

### Put every Session in one global split tree

Rejected. A user needs multiple standalone terminal arrangements and the
ability to switch one complete split arrangement as a unit. Without Groups,
activating a hidden Session would have to replace an arbitrary visible leaf or
make every Session permanently visible.

### Give every Terminal pane its own local tab bar

Rejected for this interaction. The requested drag source is the existing global
Session rail and Cursor's ownership model groups instances behind that rail.
Pane-local tab bars would duplicate navigation chrome, consume vertical space,
and change the current Session mental model.

### Mirror one Session into two panes

Rejected. One xterm Runtime has one writable input/focus/size authority. Two
views would disagree about PTY dimensions, selection, scrollback, and keyboard
focus. Splitting always moves an existing unique Session or creates a new
Session through a separately defined command.

### Restart a Session after layout movement

Rejected. It can lose commands, servers, Agent state, scrollback, and user data,
and violates process ownership. A move is metadata-only.

### Use tmux as the implementation

Rejected for the reasons in the tmux decision above. tmux remains compatible
user software, not a Puppyone layout dependency.

### Copy Cursor's one-axis terminal split container

Rejected. Puppyone explicitly requires right and bottom placement in the same
Group. The shared recursive tree already supports mixed axes.

### Use native HTML Drag and Drop for Session movement

Rejected. Terminal already uses that channel for external/workspace file drops.
A custom pointer session avoids payload collision, preserves the visible target
Group while dragging an inactive tab, and reuses established lifecycle
cancellation and native pointer-passthrough coordination.

### Persist ephemeral Group JSON immediately

Rejected. There is no corresponding persistent PTY/attach identity. Restoring
layout without restoring process truth would create misleading empty or
replacement Sessions.

### Limit the feature to a fixed number of panes

Rejected as the primary correctness policy. Valid capacity derives from live
character-cell geometry and recursive minimum size. Future resource warnings
may be explicit, but an arbitrary count does not make an invalid small pane
usable.
