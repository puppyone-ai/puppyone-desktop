# Desktop Terminal Architecture

Status: current implementation contract. This document describes the
multi-session Terminal and the local-Agent launcher architecture that current
code must implement and preserve. Structured per-file Agent activity has an
implemented foundation; its canonical architecture is
[Local Agents and Agent file activity](desktop-agent/local-agents-and-file-activity.md).

Native Session Groups and tab-drag splitting are an accepted next-version
extension, not yet current behavior. Their normative Group model, recursive
layout, Runtime reparenting, interaction boundary, non-goals, and release gates
live in
[Terminal Session Groups and Split Layout](desktop-terminal/session-groups-and-split-layout.md)
and
[ADR-002](desktop-terminal/decisions/ADR-002-native-terminal-groups-and-split-layout.md).
Until that target lands, statements below about one active Session describe the
current tabs-only projection.

## 1. Product contract

Terminal is a persistent PTY workspace, not a command runner and not a second
Agent Chat. A new terminal session begins in a selector and starts only after
the user chooses either:

- a locally installed coding Agent; or
- the user's normal shell.

When an Agent is selected, the user's shell remains the stable PTY host and the
Agent is its first foreground command. Exiting the Agent returns to the same
shell. The user can then run arbitrary commands, start development servers,
launch another Agent, or exit the shell normally.

The product invariants are:

1. Opening Terminal or creating a new session never starts a process by
   itself.
2. The launcher offers an Agent action only when a trusted main-process locator
   found a locally executable candidate.
3. Discovery never blocks application startup or waits for account, model, or
   protocol inspection.
4. The Renderer sends a closed launcher ID, never a command or executable
   path.
5. The main process resolves and validates the executable again at launch.
6. One session owns one stable xterm runtime and one PTY for its whole
   lifetime. Transient status UI overlays it rather than remounting it.
7. Terminal and Agent Chat remain separate products and security boundaries.
8. Adding a terminal-native Agent extends immutable catalogs and presentation
   metadata; it does not add another scanner, IPC route, or PTY lifecycle.
9. PTY output may drive a coarse busy signal, but only a structured native
   Hook/plugin event may create exact per-file Agent attribution.

## 2. System topology

```text
Workspace auxiliary panel
  |
  +-- RightTerminalPanel                         Renderer composition root
        |
        +-- TerminalSessionHeader                shared session chrome only
        +-- TerminalLauncher                     no process ownership
        +-- TerminalSessionHost                  stable per-session boundary
              +-- TerminalSessionView            xterm DOM attachment
              +-- startup overlay                temporary presentation
        |
        +-- useTerminalSessions                  session reducer/controller
        +-- useTerminalAgentLocator              lightweight availability
        +-- TerminalRuntimeRegistry              one runtime per session ID
                  |
                  v typed preload IPC
        terminal:agents-locate + agents-progress / create / input / resize / close
                  |
                  v
Electron main process
  +-- TerminalAgentLocator                       filesystem-only discovery
  +-- TerminalAgentLaunchResolver                launch-time authority
  +-- TerminalService                            PTY lifecycle and ownership
  +-- TerminalShellHost                          shell + first foreground Agent
                  |
                  v
               node-pty
```

The preload bridge is a narrow transport. It contains no discovery, routing,
command construction, caching, or lifecycle decisions.

The accepted split target inserts a Renderer-owned `TerminalWorkbench` and
`TerminalGroupViewport` between the Header and stable Session hosts. Group IDs,
split nodes, ratios, drop intent, and focused-pane state remain above preload;
the main process continues to know only sender-owned Terminal Session IDs.

### 2.1 Implemented semantic-activity extension

The activity path is a side channel alongside, not inside, PTY output:

```text
Native Agent TUI
  +-- PTY bytes -> TerminalService -> xterm
  |
  +-- native Hook/plugin event
        -> terminal-agent/activity provider adapter
        -> provider-neutral main Agent Activity broker
        -> typed workspace-relative activity IPC
        -> desktop-agent-presence external store
        -> Editor / Explorer / Terminal presentation
```

Provider-specific Hook registration and payloads terminate in
`electron/main/terminal-agent/activity`. Workspace claim policy and public
projection live in the neutral `electron/main/agent-activity` domain. The
Renderer consumes them through the independent `desktop-agent-presence`
feature, so Editor never imports Terminal implementation code. See the
[implemented source layout](desktop-agent/local-agents-and-file-activity.md#source-layout).

## 3. Renderer source ownership

```text
src/features/desktop-terminal/
  controller/
    useTerminalSessions.ts             session orchestration
    useTerminalAgentLocator.ts         discovery lifecycle and stale guards
  infrastructure/electron/
    terminalAgentLocatorClient.ts      typed bridge adapter
  model/
    terminalLaunchers.ts               closed public launcher catalog + derived ID type
    terminalAgentAvailability.ts       sanitized availability DTO/state
    terminalLauncherPresentation.ts    generic primary/overflow policy
    terminalSessionHeader.ts           shared rail/overflow presentation projection
    terminalSessionHeaderLayout.ts     pure adaptive Header density policy
    terminalSessions.ts                pure session reducer
    terminalPath.ts                    path presentation only
  runtime/
    terminalRuntime.ts                 one stable xterm runtime
    terminalRuntimeRegistry.ts         runtime identity and deferred disposal
    terminalActivity.ts                normalized title/output activity signal
    terminalAppearance.ts              terminal theme projection
  ui/
    RightTerminalPanel.tsx             feature composition root
    TerminalLauncher.tsx               selector and recovery UI
    TerminalSessionHost.tsx            stable mount + transient overlay
    TerminalSessionView.tsx            xterm attachment and file drop
    session-header/
      TerminalSessionHeader.tsx        composition and stable-capacity boundary
      TerminalSessionTab.tsx           memoized tab presentation
      TerminalSessionOverflowMenu.tsx  hidden-session navigation menu
      TerminalSessionHeaderStatus.tsx  runtime activity subscription + visual
      terminalSessionHeaderIds.ts      tab/panel accessibility ID contract
      useTerminalSessionHeaderLayout.ts stable capacity measurement adapter
      useTerminalSessionHeaderController.ts roving focus + activation motion
      terminal-session-header.css      Header-owned geometry and interaction styles
```

Rules:

- UI components receive state and callbacks; they do not call Electron APIs.
- The controller is the only layer that combines discovery and UI lifecycle.
- Domain/model files contain no React, Electron, xterm, or native-process code.
- The Session Header receives immutable session summaries. It neither creates
  runtimes nor mutates session state; all actions leave through callbacks.
- Rail tabs and overflow rows consume the same pure presentation projection, so
  status, Agent identity, path, and accessible labels cannot diverge.
- A `TerminalRuntime` is keyed by session ID, never by active-tab position.
- Switching tabs changes visibility and focus; it does not recreate xterm or
  the PTY.

## 4. Main-process source ownership

```text
electron/main/
  local-executable-resolver.mjs             shared filesystem-only primitive
  local-agent-candidates/                   shared bounded product locations
  ipc/terminal-ipc.mjs                 validate route and authorize workspace
  terminal-service.mjs                 PTY session application service
  terminal-shell-host.mjs              platform-safe shell command serialization
  terminal-agent/
    terminal-agent-catalog.mjs         trusted candidates + identity policy
    terminal-agent-candidate-resolver.mjs shared resolution composition
    terminal-agent-identity.mjs        bounded ambiguous-name verification
    terminal-agent-locator.mjs         filesystem-only availability scan/cache
    terminal-agent-launch-resolver.mjs authoritative launch-time re-resolution
```

The locator and launch resolver may share immutable executable descriptors,
but they have different authority:

- Locator results are advisory presentation data.
- Launch resolution is authoritative and always runs again.
- The locator never returns native paths or commands to the Renderer.
- Agent Chat inventory and capability probes are not dependencies of the
  Terminal launcher.

The implemented Agent Activity foundation preserves this split. Hook compatibility
and enrollment are evaluated only after launchability is known or when the user
explicitly enables activity. They cannot delay locator discovery or hide a
launchable Agent.

## 5. Session state and identity

The session reducer owns serializable UI state:

```text
selecting -> starting -> running -> exited
                  |          |
                  +-> selecting on recoverable launch failure
```

A session stores its stable ID, ordinal, launcher identity, lifecycle status,
and presentation error. The workspace path is the visible tab title; the Agent
identity is shown by the leading official product icon. Runtime objects, xterm
instances, DOM nodes, timers, disposables, and PTY handles never enter React
state or persisted preferences.

`TerminalRuntimeRegistry` owns runtime identity. A session close removes the
reducer record immediately and disposes its runtime once. Closing the panel
does not implicitly close sessions. Window teardown closes every PTY owned by
that window.

## 6. New-session and launcher lifecycle

Creating a terminal tab creates a `selecting` session only. No Shell and no
Agent is launched at this point.

```text
create tab
  -> render launcher immediately
  -> request lightweight Agent availability asynchronously
  -> show available Agent actions when the lightweight snapshot resolves
  -> user selects launcher ID
  -> session becomes starting
  -> stable xterm runtime mounts underneath startup overlay
  -> main process resolves executable and creates PTY
  -> meaningful Agent output or bounded reveal timeout
  -> session becomes running; overlay is removed
```

The startup overlay hides shell echo and blank startup frames, but data is
still delivered to the mounted xterm buffer. It is released on a meaningful
terminal-display signal or a bounded safety timeout; it must never be an
unconditional animation delay.

If launch fails, the runtime is closed and the same session returns to the
selector with an inline error. A black or permanently empty terminal is not a
valid error state.

The selector has a stable block-start anchor rather than vertically centering a
content box whose height changes during discovery. Incremental Agent results
grow downward from that anchor; they must not recenter the entire Terminal
surface. Before the first result, the detecting row occupies the same geometry
as one Agent action. Once any Agent action exists, loading and recovery status
becomes an assistive live-region announcement outside normal layout. Explicit
refresh preserves all keyed action nodes and animates only the fixed-size
refresh affordance, so starting or completing a scan cannot add and remove a
transient row.

## 7. Local Agent discovery

Terminal discovery answers one question only:

> Can this known executable be safely resolved to a local regular executable
> file right now?

It combines deterministic product-configured candidates with one shared
bounded search context built from `PATH`, Volta, asdf, NVM and known
user/system installation directories. It may canonicalize the file, verify
that it is a regular executable, record a native-only identity fingerprint and
verify bounded read-only product evidence for ambiguous basenames.

It must not run:

- account or authentication checks;
- model listing;
- native Agent protocol initialization;
- Chat capability discovery;
- provider or credential inspection;
- unbounded login-shell startup;
- renderer-provided commands.

Version, account, model, and protocol concerns belong to the selected product
after Terminal starts it, or to Agent Chat's independent runtime discovery.
See
[Local Agents architecture](desktop-agent/local-agents-and-file-activity.md#3-local-agents-architecture)
for the shared discovery, visibility, and launch boundary.

## 8. Shell-hosted Agent execution

The PTY always spawns the platform's trusted user shell. For an Agent launch,
the main process writes one safely serialized foreground command into that
shell after startup.

```text
node-pty
  -> user shell (stable PTY root)
       -> exec path selected by trusted catalog
       -> Agent runs in foreground
       -> Agent exits
       -> same shell prompt remains usable
```

This gives users normal terminal freedom: an Agent can run child tools and
development commands, and the shell remains available after the Agent exits.
The architecture does not force the Agent to become the PTY root process.

Command serialization is platform-specific and treats the canonical
executable path and fixed catalog arguments as data. Renderer strings are never
interpolated. The launch resolver rechecks executable identity immediately
before constructing the shell-host request.

## 9. Stable rendering and remount isolation

One live session has exactly one xterm instance. `TerminalSessionHost` mounts
`TerminalSessionView` for the runtime's lifetime and layers startup UI above
it. Status changes must not conditionally replace the xterm subtree.

This prevents:

- data listeners targeting an abandoned xterm instance;
- focus moving to another terminal after a tab update;
- multiple sessions sharing transient hover/menu state;
- startup output disappearing between selector and running states;
- WebGL canvas or terminal measurement recreation on unrelated renders.

Session components are keyed by stable session ID. High-frequency terminal
data is written directly through the runtime and never flows through React
state. React state contains only low-frequency lifecycle summaries.

For native splitting, stable Session hosts must additionally live outside the
recursive split-tree ownership boundary and attach to layout slots before
paint. A Group move therefore changes metadata and DOM placement without
recreating the Session component, Runtime, xterm buffer, WebGL renderer, bridge
listeners, Agent activity identity, or PTY.

## 10. Geometry and resize pipeline

Sizing flows in one direction:

```text
DOM content box -> FitAddon -> xterm cols/rows -> PTY resize
```

The xterm geometry target remains padding-free. Visual inset belongs to the
outer terminal body. A `ResizeObserver` schedules coalesced fits; in the current
tabs-only projection, inactive or zero-size Sessions defer fitting until active.
The PTY receives exactly the same grid dimensions xterm uses.

The accepted split target replaces the single `active` meaning with
`presented` and `focused`: every Session in the active Group is presented and
fits independently, while only one receives requested keyboard focus. Split
admission and separator bounds derive from recursive character-grid minimums,
not a fixed pane count or the Editor's percentage clamp.

Every style affecting glyph metrics must exist before xterm measures the grid.
Changing font family, size, weight, letter spacing, padding, or Unicode width
rules requires a refit.

## 11. Character-grid width invariant

For every displayed character, rendered advance must equal
`wcwidth × cellWidth`. PTY-side wrapping, xterm's Unicode width table, CSS cell
measurement, and fallback-font glyph advance must agree.

The terminal keeps `text-spacing-trim: space-all`. Chromium's normal CJK
punctuation trimming can make xterm's repeated-character measurement differ
from contextual rendering, causing per-punctuation drift and right-edge
clipping. A terminal is a grid rather than typeset prose, so contextual
punctuation trimming is invalid here.

GPU rendering contains glyph overflow per cell; DOM fallback requires verified
measurement parity. Unicode width addons and renderer changes must be tested
against CJK punctuation, emoji, box drawing, and narrow panel widths.

## 12. Focus, tabs, and activity

In the current tabs-only projection, activating a Session updates only the
active Session ID, visibility, fit, and focus. Each Session owns its own runtime
listeners and DOM container. Hover, menu, loading, and error state are local to
the relevant component/Session.

In the accepted split target, activation first resolves the Session's owning
Group. Activating a same-Group Session changes focus while all split siblings
remain visible; activating another Group switches the complete arrangement.
The visual rail becomes an accessible Session switcher rather than claiming
that one selected tab controls the only visible tabpanel. Pointer tab movement
and HTML file/reference drops remain separate interaction channels.

Tab presentation rules:

- leading visual: selected Agent's official icon, or Shell icon;
- tab and overflow marks use a 14 px optical box inside a 28 px control; dense
  artwork such as Hermes may define a compact-only optical scale without
  changing the larger launcher presentation;
- title: workspace path leaf, with full path available accessibly;
- activity: a restrained 2 × 2 square-cell animation, never circular dots;
- no activity animation may cause tab width or title position to move.
- explicit activation animates the selected compact mark into a full tab while
  the previous full tab contracts; this short geometry transition is scoped to
  activation, never resize measurement, and respects reduced-motion settings.
- every tab reserves the same fixed 28 px leading icon cell in full and compact
  modes. Activation changes continuous width and opacity properties only; it
  must never switch alignment or padding values that make the icon jump.
- activation direction is an ideal-bounds contract, not an incidental Flexbox
  result. The pure layout model emits `inlineStart + width` for every rendered
  tab, and the UI interpolates both values with the same easing. When activation
  moves right, the destination's trailing edge stays fixed while its leading
  edge moves left; when activation moves left, its leading edge stays fixed
  while its trailing edge moves right.

The Header measures a stable full-width capacity container and subtracts the
create control from metrics shared with its CSS variables. It never measures the
content-sized rail that it is currently compressing. This one-way relationship
prevents layout feedback: expanding the panel can always restore compact or
overflow tabs to full tabs. The pure model then resolves three density levels:

1. **full** — every tab keeps its title; widths shrink evenly from the preferred
   width down to the readable full-tab minimum;
2. **compact** — the active tab stays full while inactive tabs become official
   brand/activity marks only; activating a compact mark makes it the full tab;
3. **overflow** — the active tab and as many nearest compact siblings as fit
   remain in stable session order, while all other sessions move into one
   accessible overflow menu.

The active session is never placed in overflow. The visible overflow window is
continuity-preserving: activating a tab already rendered in that window keeps
the same keyed DOM nodes and the same order. The new active tab expands in its
existing position and physically pushes its siblings while the previous active
tab contracts. Recomputing a nearest-session window on every active-ID change is
forbidden because it makes edge tabs disappear instead of move. The window is
repositioned only when the requested session is actually hidden, the capacity
class changes, or the session inventory changes.

Rendered tabs occupy absolute logical slots inside a relatively positioned rail
whose width also comes from the pure layout result. This follows Chromium's
`ideal_bounds` / `BoundsAnimator` principle: calculate every target rectangle
first, then move all existing views to those targets together. Flex reflow is
not an animation engine and must not decide the apparent expansion origin. See
[Chromium TabStrip](https://chromium.googlesource.com/chromium/src/+/e842ab5f98d917193d1737d2b38475b97969e111/chrome/browser/ui/views/tabs/tab_strip.cc).

Home/End and arrow-key tab navigation still operate on the complete session
order, so activating a hidden session moves the visible window around it. The
overflow menu supports focus restoration, Escape/outside dismissal, selection,
close actions, status text,
and the same live brand/activity mark as the rail. `ResizeObserver` updates only
the stable Header capacity; the pure model owns all visibility decisions,
avoiding DOM-width feedback loops and tab-count magic numbers.

The rail is content-sized and shrinkable, not a growing spacer. The new-session
control remains directly adjacent to the final visible tab or overflow control;
only tab compression and overflow consume width under pressure.

Keyboard navigation and activation motion terminate in one Header controller.
Home/End and directional keys use the complete logical session order, including
hidden sessions, and restore focus after the new visible window commits. The
activation callback is reference-stable so an active-ID change does not force
unrelated memoized tabs to render. Timers and pending focus frames are disposed
with the Header. Geometry duration is a single model-owned motion token consumed
by both the controller timer and Header CSS variable; JS and CSS timings may not
drift independently.

Activity is a runtime semantic, not a Codex-specific UI condition. The runtime
normalizes three sources into one low-frequency boolean:

1. the known `starting` session lifecycle;
2. bounded upstream terminal-title protocols, including Codex spinner frames
   and Cursor's explicit `Working`, `Planning`, shell-command and queue states;
3. a short debounced PTY-output pulse for Agents that do not publish a busy
   title, such as OpenCode, Pi or Hermes.

The output pulse emits React updates only when activity starts or settles; raw
PTY bytes continue to bypass React. Shell sessions do not use Agent activity.
Activating, focusing, fitting, or resizing a terminal can make a full-screen
CLI repaint its existing buffer even though no Agent turn is running. Runtime
marks these host-owned presentation transitions before touching the PTY and
suppresses only their short output echo; an explicit busy title remains
authoritative throughout that window. A tab switch therefore cannot manufacture
Agent activity from a focus or resize repaint.
The tab component consumes only `runtime.activity`, while
`TerminalSessionHeaderStatus` owns the common brand-mark/activity-grid switch.
Adding an Agent must not add a product branch to the tab UI.

This boolean is deliberately coarse. It answers whether an Agent session appears
busy, not which file it accessed. The accepted semantic-activity architecture
adds a second, structured projection keyed by workspace-relative path. Exact
read/write presence requires a native Hook/plugin path and remains unavailable
when an Agent exposes only terminal output. PTY pulses, terminal-title text, and
workspace watcher timing must never be promoted to exact file attribution. See
[Agent file activity architecture](desktop-agent/local-agents-and-file-activity.md#4-agent-file-activity-architecture).

## 13. Performance contract

- Application startup never awaits Terminal Agent discovery.
- Opening the selector renders before IPC discovery resolves.
- Locator work is filesystem-only, bounded, supersedable, and parallel across
  known products; all products share one directory snapshot per scan.
- Uncached scans publish request-correlated, path-free incremental results.
- Discovery status never changes launcher geometry once actions are visible;
  incremental actions enter locally from a stable block-start anchor.
- Main-process memory cache prevents repeated scans for additional tabs.
- Fresh cached data returns immediately; expired data triggers a new scan.
- Main-only diagnostics record cold-scan duration and cache behavior against a
  50 ms target without exposing telemetry or native paths.
- Slow Agent capability probes are forbidden from this path.
- PTY bytes bypass React rendering and are written directly to xterm.
- Agent PTY output is reduced to debounced activity transitions before React;
  no byte stream is copied into component state.
- The accepted file-activity path is also low-frequency: native frames remain
  in main, public events are bounded, and one external Renderer store publishes
  only affected file selectors. It is not part of the Editor keystroke path.
- Inactive sessions remain mounted but do not receive focus or redundant fits.
- Header presentation items are memoized from immutable session summaries;
  active-ID changes preserve unaffected tab props and callback identities.
- Visible overflow tabs retain their keyed DOM identity across local activation;
  switching tabs changes geometry rather than mounting a different window.
- Resize observation targets stable Header capacity. It never observes a tab
  width that the same layout calculation is changing.

Manual refresh is a recovery affordance, not the normal freshness mechanism.

## 14. Security boundary

The Renderer can request only a known launcher ID. The main process owns:

- the closed product catalog;
- executable names and known candidate directories;
- canonical path and regular-file/executable validation;
- identity revalidation at launch;
- workspace authorization and `cwd` confinement;
- environment construction and bounded path augmentation;
- platform-safe command serialization;
- PTY ownership by `webContents` sender.

For semantic activity, main additionally owns the private local ingest endpoint,
short-lived source-session tokens, provider payload schemas, canonical target
containment, claim expiry, and public redaction. Hook events are untrusted
advisory telemetry and can affect presentation only.

Discovery responses contain only sanitized launcher IDs and timestamps. They do
not expose executable paths, environment values, credentials, account state,
or arbitrary native errors. Incremental events add only bounded counts and a
validated request correlation ID.

## 15. Verification gates

Every change to this domain must cover:

1. locator tests proving that discovery performs no version/auth/protocol
   command;
2. cache, explicit refresh, stale request, and failure-result tests;
3. launch resolver tests proving closed IDs and launch-time revalidation;
4. shell-host lifecycle tests proving Agent exit returns to the shell;
5. reducer/runtime tests proving per-session isolation and single disposal;
6. component tests for detecting, available, none-found, geometry-neutral
   refresh, keyed-action retention, starting, and recoverable error states;
7. Session Header tests for full/compact/overflow projection, shrink-to-expand
   recovery, continuity-preserving visible windows, keyed-node retention,
   roving keyboard focus, activation-only motion, and shared labels;
8. architecture-boundary checks preventing Renderer commands or Agent Chat
   inventory imports;
9. xterm geometry/CJK regression coverage;
10. TypeScript, localization, lint, production build, and diff checks;
11. shared search-context, ambiguous-identity, incremental-result, diagnostics,
    and future-catalog overflow tests.

Its independent gates are defined in
[Agent activity verification contract](desktop-agent/local-agents-and-file-activity.md#verification-contract).
The next-version Group/split feature has additional model, Runtime-identity,
drag-cancellation, resize, accessibility, and real-Chromium gates in
[Terminal Session Groups and Split Layout](desktop-terminal/session-groups-and-split-layout.md#21-verification-and-acceptance-matrix).

## 16. Domain boundaries

- Workspace owns the auxiliary panel, not Terminal session internals.
- Agent Chat owns typed native Agent sessions, account/model readiness,
  approvals, transcripts, and provider integrations.
- Terminal owns PTY sessions and can start a local Agent only as a foreground
  terminal command.
- Terminal Agent activity adapters own native Hook/plugin edges. The neutral
  Agent Activity broker owns process-local workspace claims. Editor and Explorer
  consume only the cross-surface presence contract.
- Source Control owns repository truth after Terminal or Agent edits files.
- Appearance may select terminal session presentation. Desktop App > Agent Portal
  may explicitly manage reversible Hook enrollment, but Settings never owns live
  terminal/activity state.

## 17. References

- [Terminal architecture home](desktop-terminal/README.md)
- [Terminal Session Groups and Split Layout](desktop-terminal/session-groups-and-split-layout.md)
- [ADR-002: Native Terminal Groups and Split Layout](desktop-terminal/decisions/ADR-002-native-terminal-groups-and-split-layout.md)
- [Local Agents and Agent file activity](desktop-agent/local-agents-and-file-activity.md)
- [Terminal Rendering Remediation History](desktop-terminal/rendering-remediation-history.md)
- [Desktop Agent Architecture](desktop-agent/README.md)
- xterm.js: <https://xtermjs.org/>
- `@xterm/addon-fit`: geometry calculation
- `@xterm/addon-webgl`: cell-bounded GPU rendering
- `@xterm/addon-unicode11`: modern Unicode width tables
