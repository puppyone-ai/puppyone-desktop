# Desktop Sidebar Architecture

**Status:** Accepted and implemented by ISSUE-035.

This document is the architecture home for every desktop sidebar and narrow
panel surface. It defines composition, ownership, directory boundaries, state,
styling, performance, and verification. It does not redefine feature-specific
Git, Cloud, Agent, or Explorer behavior.

Related focused contracts:

- [Desktop Sidebar View Stack](desktop-sidebar-view-stack.md) owns keep-alive
  behavior when the active left workspace surface changes.
- [Desktop Sidebar Scroll Lists](desktop-sidebar-scroll-lists.md) owns scroll
  area, list, row, gutter, and scrollbar geometry.
- [Explorer Tree Lifecycle](explorer-tree-lifecycle.md) owns file-tree loading,
  expansion, motion, and indentation.
- [Desktop Agent Architecture](desktop-agent/README.md) owns the right Agent
  panel's provider, session, and transcript behavior.
- [Git and Source Control Architecture](git/README.md) owns Source Control
  state and operations.
- [Desktop Repository Layout](repository-layout.md) owns the repository-wide
  feature, package, platform, and public-entry rules.

This document intentionally uses text diagrams rather than Mermaid so the
architecture remains readable in source form and in every Markdown viewer.

## 1. Scope and terminology

The product has three different narrow-surface roles. They share geometry and
interaction primitives, but not routing or business lifecycle.

| Role | Examples | Lifecycle | Owner |
|---|---|---|---|
| Left workspace sidebar | Data, Git, Cloud, Access, Automation, Plugins, Settings | Mutually exclusive workspace surface; Data Explorer is kept alive | App Shell surface stack |
| Right auxiliary panel | Agent Chat, Terminal | May coexist with any workspace surface | Auxiliary panel host |
| Feature-internal secondary pane | Git history/detail split, a nested resource browser | Exists only inside one feature | That feature |

The word **Sidebar** in component names refers to a visual narrow surface. It
does not imply that every sidebar participates in the same router or store.

## 2. Resolved architectural pressure

ISSUE-035 removed the ownership defects that motivated this architecture:

1. `DesktopWorkspaceContent.tsx` now resolves one typed surface and projects
   that instance into both the sidebar and main outlets.
2. Navigation visibility and route availability now come from the same
   capability-filtered registry contribution.
3. Canonical root, scroll, list, row, action, resize, and virtual-list behavior
   lives in `packages/shared-ui`; Desktop-only compositions live in
   `src/components/sidebar`. Source Control no longer owns shared geometry.
4. Settings navigation/model, Settings main sections, App Shell navigation,
   and Source Control sections/resources/layout hooks have focused modules.
5. The CSS cascade is declared once as
   `reset -> tokens -> primitives -> patterns -> features -> overrides`.
6. Git, Cloud History, and other scalable Sidebar lists consume one shared
   virtualization threshold and mounted-row budget.
7. `AuxiliaryPanelHost` owns right-panel geometry without placing Agent or
   Terminal in the left Workspace Surface Registry.

Architecture checks reject regressions in these boundaries. Product behavior
remains Feature-owned; the migration did not create a global Sidebar store.

## 3. Architectural decision

PuppyOne uses a two-axis sidebar architecture:

```text
Horizontal reuse axis
    Shared Sidebar Kernel
    ├── tokens and geometry
    ├── root / scroll area / list
    ├── group / section / row
    ├── actions / empty and status states
    ├── resize behavior
    ├── virtualization behavior
    └── accessibility behavior

Vertical ownership axis
    Feature-owned sidebar compositions
    ├── Data Workspace
    ├── Source Control
    ├── Cloud
    ├── Access
    ├── Automation
    ├── Plugins
    └── Settings
```

All reusable geometry flows horizontally through the Sidebar Kernel. Business
models, queries, commands, selection, and presentation flow vertically inside
their feature. The project must not create one giant `features/sidebars/`
directory that groups unrelated business domains by visual shape.

The dependency direction is one-way:

```text
Desktop App Shell
    |
    v
Workspace Surface Registry
    |
    v
Feature public entry / surface adapter
    |
    v
Feature sidebar composition
    |
    v
Desktop sidebar patterns
    |
    v
Process-neutral Shared UI primitives
```

Forbidden reverse or lateral dependencies:

```text
Shared UI primitive  -X->  App Shell or feature business code
Feature sidebar      -X->  another feature's sidebar implementation
Feature stylesheet   -X->  ownership of shared root/row/list classes
App Shell            -X->  feature controller internals
```

## 4. System composition

The final desktop composition is:

```text
DesktopWorkspaceShell
|
├── DesktopTitlebar
|
├── WorkspaceSidebarHost
|   ├── WorkspaceNavigation
|   └── SidebarViewStack
|       ├── persistent Data Explorer frame
|       └── active WorkspaceSurface.sidebar
|
├── MainViewOutlet
|   └── active WorkspaceSurface.main
|
└── AuxiliaryPanelHost
    ├── RightAgentPanel
    └── RightTerminalPanel
```

The left host and right auxiliary host are siblings. The right host may reuse
Sidebar Kernel tokens, scroll areas, resize handles, and header geometry, but it
does not register as a left workspace surface and does not inherit the Data
Explorer keep-alive lifecycle.

Feature-internal secondary panes sit below their feature, not below either
global host:

```text
SourceControlMainView
└── SourceControlHistoryLayout
    ├── CommitListPane
    └── CommitDetailPane
```

## 5. Workspace Surface Registry

### 5.1 Responsibility

The registry is the declarative source of truth for left workspace surfaces.
It associates a stable surface id with navigation metadata, availability,
lifecycle policy, and a feature-owned adapter that supplies the sidebar and
main view.

```ts
export type WorkspaceSurfaceId =
  | "data"
  | "git"
  | "cloud"
  | "access"
  | "automation"
  | "plugins"
  | "settings";

export type WorkspaceSurfaceContribution = {
  id: WorkspaceSurfaceId;
  navigation: WorkspaceSurfaceNavigation;
  availability: (context: WorkspaceSurfaceContext) => boolean;
  lifecycle: {
    sidebar: "keep-alive" | "on-demand";
    main: "keep-alive" | "on-demand";
  };
  create: (context: WorkspaceSurfaceContext) => WorkspaceSurfaceInstance;
};

export type WorkspaceSurfaceInstance = {
  sidebar: ReactNode;
  main: ReactNode;
};
```

The exact type names may change during implementation, but the ownership
boundary must not.

### 5.2 Registry constraints

- The registry contains metadata and typed feature adapters, not API clients,
  controller state, arbitrary callbacks, or mutable feature stores.
- Each feature exports its contribution through its public `index.ts`.
- The App Shell composes contributions and selects one resolved surface.
- Sidebar and main content are produced from the same resolved instance. They
  cannot drift into two independent routing condition trees.
- Availability is derived from explicit capabilities such as workspace kind,
  authentication, or feature flags. Hidden navigation and route availability
  use the same result.
- Adding a workspace surface changes its feature contribution and the registry
  composition; it does not add another ternary branch to the shell.

The registry must not become a service locator. Feature hooks/controllers are
created in a feature adapter or a feature boundary and passed to the feature's
own presentation components as a focused view model.

## 6. Implemented repository layout

This is the implemented ownership tree. It intentionally creates directories
only where there is a real responsibility; simple Features remain compact.

```text
src/
├── features/
│   ├── app-shell/
│   │   ├── navigation/
│   │   │   ├── navigationModel.tsx
│   │   │   ├── types.ts
│   │   │   ├── DesktopNavigationItems.tsx
│   │   │   ├── DesktopSidebarTopNavigation.tsx
│   │   │   ├── DesktopSidebarRailNavigation.tsx
│   │   │   ├── DesktopSidebarFooterNavigation.tsx
│   │   │   ├── DesktopWorkspaceSurfaceActionButton.tsx
│   │   │   └── index.ts
│   │   ├── auxiliary/
│   │   │   ├── AuxiliaryPanelHost.tsx
│   │   │   └── index.ts
│   │   └── workspace-surfaces/
│   │       ├── workspaceSurfaceTypes.ts
│   │       ├── workspaceSurfaceRegistry.ts
│   │       ├── WorkspaceSurfaceOutlet.tsx
│   │       ├── useWorkspaceSurfaceContent.tsx
│   │       └── index.ts
│   │
│   ├── source-control/
│   │   ├── SourceControlWorkspaceSurface.tsx
│   │   ├── SourceControlSidebar.tsx
│   │   ├── sidebar/
│   │   │   ├── SourceControlSidebarSections.tsx
│   │   │   ├── SourceControlResourceLists.tsx
│   │   │   ├── sourceControlSidebarTypes.ts
│   │   │   └── useGitSidebarPanelLayout.ts
│   │   └── index.ts
│   │
│   ├── settings/
│   │   ├── SettingsWorkspaceSurface.tsx
│   │   ├── sidebar/
│   │   │   ├── SettingsSidebar.tsx
│   │   │   ├── settingsSidebarModel.ts
│   │   │   └── index.ts
│   │   ├── main/
│   │   │   ├── AccountSettingsView.tsx
│   │   │   ├── EditorSettingsViews.tsx
│   │   │   ├── FileSettingsViews.tsx
│   │   │   ├── GeneralSettingsView.tsx
│   │   │   ├── RepositorySettingsViews.tsx
│   │   │   └── ThemePreview.tsx
│   │   └── index.ts
│   │
│   └── <simple-feature>/
│       └── public entry plus focused Sidebar/Main modules as needed
│
├── components/
│   └── sidebar/
│       ├── SidebarSurface.tsx
│       ├── SidebarGroup.tsx
│       ├── SidebarStatusRow.tsx
│       ├── SidebarHeader.tsx
│       └── index.ts
│
└── styles/
    ├── cascade.css
    └── sidebar/
        └── patterns.css

packages/shared-ui/src/
├── sidebar/
│   ├── SidebarRoot.tsx
│   ├── SidebarScrollArea.tsx
│   ├── SidebarList.tsx
│   ├── SidebarRow.tsx
│   ├── SidebarIconButton.tsx
│   ├── SidebarEmptyState.tsx
│   ├── SidebarResizeHandle.tsx
│   ├── VirtualSidebarList.tsx
│   ├── useVirtualSidebarWindow.ts
│   ├── virtualizationPolicy.ts
│   ├── classNames.ts
│   └── index.ts
└── styles/
    └── sidebar-primitives.css
```

### 6.1 Why there are two shared levels

`packages/shared-ui/src/sidebar/` contains process-neutral primitives. They
cannot import Electron, App Shell, Cloud, Git, Agent, localization product
routes, or product-specific controller code.

`src/components/sidebar/` contains Desktop product patterns assembled from
those primitives: product navigation groups, surface headers, product status
rows, and shared narrow-panel composition. It may consume renderer-level
localization and product tokens, but not a feature's domain model.

Feature directories contain semantics. `SourceControlSection`,
`CloudProjectRow`, or `SettingsNavigationModel` never belongs in either shared
level.

Simple features do not need artificial `application/` and `domain/` folders.
Those layers are introduced only when they contain real policies or use cases.
The existing Agent structure is a valid example for a complex feature, not a
mandatory empty-folder template.

## 7. Component responsibilities

### 7.1 Primitive layer

Primitives own:

- DOM semantics and ARIA plumbing;
- geometry, overflow, focus rings, disabled state, and logical-direction CSS;
- scroll-edge observation and stable scrollbar gutter behavior;
- pointer and keyboard resize behavior;
- virtual-window mechanics independent from feature row data.

Primitives do not own:

- feature labels, icons, counts, API calls, or commands;
- selected Git paths, Cloud projects, Settings routes, or Agent sessions;
- product routing and workspace availability.

### 7.2 Pattern layer

Desktop patterns own recurring product compositions such as:

```text
SidebarSurface
├── optional SidebarHeader
├── SidebarScrollArea
│   └── SidebarList
│       ├── SidebarGroup
│       ├── SidebarSection
│       └── SidebarNavigationRow / SidebarStatusRow
└── optional footer or resize boundary
```

Patterns expose named slots and typed variants. They must not rely on DOM
position selectors such as `span:last-child` to infer which child is the label.

### 7.3 Feature layer

A feature sidebar owns:

- mapping its feature view model into groups, sections, and rows;
- business actions and confirmation workflows;
- selection and expansion that have feature meaning;
- feature-specific empty, loading, error, and capability states;
- local visual semantics that do not change shared geometry.

Feature sidebars consume components through public entries. They do not copy
the primitive markup and class contract into every domain.

## 8. State and lifecycle ownership

State must live at the narrowest authority that can keep it correct:

| State | Owner |
|---|---|
| Active workspace surface and navigation placement | App Shell |
| Surface availability and lifecycle policy | Workspace Surface Registry |
| Data Explorer keep-alive frame | Sidebar View Stack |
| Sidebar width and persisted collapsed/open preference | Shell/presentation preference boundary |
| Scroll, resize drag, focus, and virtual window | Shared primitive/pattern |
| Feature data loading, commands, selection, and errors | Feature application/controller |
| Local expanded group or open row menu | Feature sidebar composition |
| Agent/Terminal right-panel session state | The corresponding auxiliary feature |

There is no global `allSidebarState` store. A central store would couple
unrelated feature lifecycles and turn the registry into mutable application
state. Persisted values must have stable keys scoped by workspace and, where
appropriate, account.

### 8.1 Keep-alive rules

- Data Explorer remains mounted when another left workspace surface is active.
- Hidden keep-alive frames preserve measured geometry with the established
  visibility contract and cannot receive pointer or keyboard focus.
- A tab/surface switch is not a file-tree expansion event.
- Other surfaces default to on-demand mounting unless they demonstrate a
  measured restoration cost or hold unsaved local presentation state.
- Right auxiliary panels follow their own lifecycle and never trigger left
  workspace surface restoration.

## 9. Styling architecture

### 9.1 Ownership

Shared Sidebar Kernel styles live with the shared layer that owns the
corresponding component. A Feature stylesheet cannot own or redefine the
canonical `.po-sidebar-*` primitive or `.po-desktop-sidebar-*` pattern classes.
The retired `.desktop-tool-sidebar*` compatibility family must not return.

Feature styles may:

- define scoped semantic accents and domain-specific layouts;
- set documented CSS custom-property extension points;
- style feature components below a feature root.

Feature styles may not:

- redefine shared row height, padding, scroll compensation, or focus behavior;
- target another feature's classes;
- depend on being imported after another feature's stylesheet;
- use unscoped selectors to repair a shared primitive.

### 9.2 Cascade order

The stylesheet entry establishes a deterministic cascade:

```css
@layer reset, tokens, primitives, patterns, features, overrides;
```

- `tokens`: theme and product role variables.
- `primitives`: process-neutral root/list/row/action behavior.
- `patterns`: Desktop surface/group/header compositions.
- `features`: domain-scoped styles.
- `overrides`: exceptional platform or accessibility overrides only; it is not
  a dumping ground for feature fixes.

The migration may keep the current external CSS toolchain. CSS Modules are not
required, but ownership and scope are required.

### 9.3 TSX and dynamic styles

- Static style rules live in CSS files, not template strings or embedded
  `<style>` elements in TypeScript.
- Inline `style` is limited to runtime measurements and documented CSS custom
  properties, for example a drag-computed pane width or virtual-row offset.
- Reusable visual variants are explicit component props/data attributes and
  CSS selectors, not ad hoc inline style objects.
- Shared geometry has one token source. Feature aliases may map to it but may
  not fork the value.

### 9.4 Visual contract

The canonical measurements remain defined by product tokens and the scroll-list
contract, including:

- `12px` effective inline row edge;
- `8px` outer block list edge;
- shared row height, radius, typography, icon-label gap, and action sizes;
- one frame divider owned by the shell and quieter dividers owned by internal
  groups/sections;
- stable scrollbar gutter independent from host OS scrollbar settings.

Logical properties (`padding-inline`, `inset-inline`, `margin-block`) are
mandatory for shared geometry so RTL does not require a parallel stylesheet.

## 10. Performance architecture

Sidebar interaction runs on the renderer main thread and must stay responsive
while editors and previews are active.

1. Registry selection is metadata lookup, not a place to load feature data.
2. Expensive features use lazy module boundaries at the feature adapter.
3. Row renderers receive stable ids and focused view models. Controller objects
   and unrelated shell state must not invalidate every row.
4. Lists that can grow beyond 200 rows use the shared virtual list. The shared
   virtual window mounts at most 120 rows; row content remains Feature-owned.
5. Scroll handlers use passive events and at most one animation-frame update.
6. Resize observers classify or measure containers; they do not drive row-level
   width compensation.
7. Surface switches preserve the Data Explorer subtree and must not repeat file
   loading, expansion motion, or expensive editor initialization.

Performance benchmarks and regression tests are retained as product gates. A
visual refactor is not allowed to remove them to make the migration pass.

## 11. Accessibility and localization

- Active navigation uses semantic selection/current state and a stable
  accessible name.
- Groups and sections have accessible labels without duplicating visible text
  for screen readers.
- Icon-only actions require `aria-label` and `title`; visible labels are not
  replaced by tooltips where space permits.
- Keyboard users can reach rows, menus, and resize handles without entering a
  hidden keep-alive frame.
- Resize handles expose separator semantics, orientation, current value, and
  keyboard increments.
- Focus returns predictably after a menu/dialog closes and after a surface is
  removed.
- Long English, Simplified Chinese, German, and RTL pseudo-locale labels truncate or
  wrap according to the component contract without horizontal page overflow.
- Shared components consume localized strings from callers; Shared UI does not
  hard-code product copy.

## 12. Testing and enforcement

The implemented architecture uses four complementary test levels:

```text
Architecture checks
    dependency direction, public entries, CSS ownership, file budgets

Primitive component tests
    semantics, keyboard, focus, scroll, resize, virtualization

Feature contract tests
    model-to-row mapping, actions, loading/error/empty states

Visual and performance matrix
    every surface at supported widths/themes/text sizes/directions/list sizes
```

Minimum visual matrix:

| Dimension | Required values |
|---|---|
| Sidebar width | narrow supported minimum, default, wide |
| Theme | light, dark |
| Text size | small, default, large |
| Direction | LTR, RTL |
| Content | empty, loading, error, long labels, overflowing list |
| Scale | normal list and at least 1,000 rows for scalable surfaces |

Boundary automation must reject:

- imports between feature sidebar implementation directories;
- shared sidebar classes defined in a feature stylesheet;
- direct feature-internal imports that bypass a feature public entry;
- static embedded CSS in sidebar TS/TSX;
- reintroduction of surface-selection ternary chains in the App Shell;
- unvirtualized rendering above the agreed scalable-list threshold.

The repository verification baseline is:

```bash
npm test
npm run lint
npm run check:shared-ui
npm run check:boundaries
npm run build
```

The executable guard is `scripts/check-sidebar-architecture.mjs`, included by
`npm run check:boundaries`. Component and contract coverage lives in
`tests/sidebarPrimitives.test.tsx`, `tests/workspaceSurfaceRegistry.test.ts`,
`tests/sidebarArchitecture.test.ts`, and the existing Sidebar/Git/Cloud/RTL
regression suites. Performance benchmarks remain in the repository.

## 13. Completed migration sequence

The migration preserved product behavior and landed in dependency order:

```text
1. Lock current behavior with rendered and visual contracts
2. Establish shared primitive ownership and cascade layers
3. Introduce the Workspace Surface Registry and one resolved outlet
4. Migrate simple feature sidebars
5. Extract Settings sidebar/model from Settings main view
6. Decompose and migrate Source Control
7. Align auxiliary panels with shared geometry without merging lifecycles
8. Add boundary checks, remove compatibility selectors, update focused docs
```

All compatibility aliases were removed in the same migration. New components
consume the canonical public entries and class contracts directly.

## 14. Invariants

These statements are enforced after ISSUE-035:

- The App Shell selects one typed workspace surface; it does not understand
  feature row/actions or maintain parallel sidebar/main route trees.
- Left workspace sidebars and right auxiliary panels share primitives but have
  independent routing and lifecycle.
- The Data Explorer remains mounted across left surface switches and cannot be
  interacted with while hidden.
- Shared root/list/row/group/action geometry is not owned by Git or any other
  feature.
- Feature sidebars import no other feature sidebar implementation.
- Shared UI imports no product feature or Electron authority.
- Static sidebar CSS is external to TS/TSX and has deterministic layer order.
- Scrollbar, resize, focus, RTL, and virtualization behavior are implemented
  once and exercised across all consumers.
- Feature business behavior remains feature-owned and is exposed through a
  focused public adapter/view model.
- Adding a new workspace surface does not require editing nested conditional
  rendering in `DesktopWorkspaceContent`.

## 15. Implementation map

The following paths are the source of truth for future changes:

| Responsibility | Canonical implementation |
|---|---|
| Process-neutral Sidebar primitives | `packages/shared-ui/src/sidebar/` |
| Primitive CSS | `packages/shared-ui/src/styles/sidebar-primitives.css` |
| Desktop product patterns | `src/components/sidebar/` |
| Pattern CSS and cascade order | `src/styles/sidebar/patterns.css`, `src/styles/cascade.css` |
| Left surface metadata/capabilities/lifecycle | `src/features/app-shell/workspace-surfaces/workspaceSurfaceRegistry.ts` |
| Single resolved surface wiring | `useWorkspaceSurfaceContent.tsx`, `WorkspaceSurfaceOutlet.tsx` |
| Data keep-alive projection | `src/features/app-shell/DesktopDataWorkspaceSurface.tsx` |
| Right auxiliary geometry/lifecycle | `src/features/app-shell/auxiliary/AuxiliaryPanelHost.tsx` |
| Navigation placements/model | `src/features/app-shell/navigation/` |
| Settings adapter/sidebar/main split | `src/features/settings/SettingsWorkspaceSurface.tsx`, `sidebar/`, `main/` |
| Source Control adapter/composition split | `src/features/source-control/SourceControlWorkspaceSurface.tsx`, `sidebar/` |
| Shared scalable-list policy | `packages/shared-ui/src/sidebar/virtualizationPolicy.ts` |
| Architecture enforcement | `scripts/check-sidebar-architecture.mjs` |

Runtime measurements use documented CSS custom properties only. Static style
rules remain in CSS. Shared primitives contain no Feature, App Shell, Electron,
or product-controller dependency. The Registry contains declarative metadata
and typed adapter dispatch only; it does not retain controller instances or
mutable state.
