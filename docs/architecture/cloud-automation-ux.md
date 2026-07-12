# Cloud Automation UX and Architecture

**Status:** Active product and architecture contract.

This document defines what Cloud Automation is as a product, the user
experience it must deliver, and the technical architecture that backs it. It
complements [Automation and Plugin Domain
Boundary](automation-plugin-domain-boundary.md), which owns the
Automation-versus-Plugin separation, and [Local and Cloud
UX](local-and-cloud-ux.md), which owns where Automation appears in the Project
shell.

## 1. Product definition

Automation is the Cloud capability that keeps a project's knowledge current by
pulling content from external information sources — Google Docs, Google
Sheets, Gmail, Calendar, Search Console, web pages, and future providers —
into a folder of the Cloud project, on a manual, scheduled, or realtime
trigger.

One sentence for every surface, dialog, and empty state to agree on:

> **An Automation watches one external source and keeps one project folder up
> to date.**

What Automation is not:

- It is not project-to-project sync. The source is always external to
  PuppyOne; the destination is always a folder inside the current Cloud
  project.
- It is not two-way. The shipped direction is `inbound`; the source is never
  mutated.
- It is not a local Plugin, a viewer, or an Access transport. Those domains
  are separated by the [Automation and Plugin Domain
  Boundary](automation-plugin-domain-boundary.md).

Every piece of Automation copy must communicate the `source → folder`
relationship. The landing-page template cards already do this well with the
source-icon → folder-icon route mark; the rest of the experience must keep
that mental model instead of abandoning it after the first screen.

## 2. The user-experience contract

These are product requirements, not implementation suggestions. A change that
violates one of them is a regression even if it ships more capability.

### 2.1 One catalog, one creation flow

The landing page catalog **is** the source picker. There is exactly one place
where a user chooses a source:

- Clicking a template card opens the configuration step for that source
  directly.
- The generic `New` action opens the same chooser experience the catalog
  provides — it must never present a second, differently-styled list of the
  same sources as an extra dialog step.
- From the configuration step the user can always go back and switch the
  source without losing the dialog, regardless of how they entered.

### 2.2 Connection state is a first-class citizen

For providers that require account authorization (OAuth), the flow is
connection-first and never dead-ends:

- Before configuration, the app shows the user's **real** connection status
  for that provider (connected account/workspace, or not connected). Static
  provider metadata is not a substitute for the user's actual state.
- If not connected, the flow presents a `Connect` step: it opens the
  provider's authorization page in the browser, shows a "waiting for
  connection" state, and automatically resumes the flow once the server
  reports the connection — no manual refresh, no starting over.
- The user must never reach a state where they can create an Automation whose
  first run is guaranteed to fail with an authorization error, and must never
  face a permanently disabled Create button with no in-flow path forward.

### 2.3 Pick resources, don't paste IDs

When a provider can enumerate the user's resources (documents, folders,
sheets, mailboxes), configuration presents a searchable picker backed by the
provider-resources API. Typing raw resource IDs into a text field is a
fallback for providers with no enumeration support, not the default
experience.

### 2.4 Humans don't write cron

Trigger selection offers presets — `Manual`, `Hourly`, `Daily at a time`,
`Weekly on a day` — with a `Custom` escape hatch for cron. The chosen trigger
is always echoed back in plain language ("Runs every weekday at 09:00,
Singapore time"). Timezone is a selector, not a free-text field. Invalid
schedules block creation with an inline explanation.

### 2.5 The destination is a real folder

The target is chosen from the project's folder tree (with the
provider-derived default preselected), and the final path is previewed before
creation. Free-text entry remains available for new folders, with
normalization shown live.

### 2.6 Creation has an echo

Creating an Automation immediately shows its consequence: the server queues an
initial run at creation time, and the UI surfaces that run's status — the new
row appears highlighted with live state ("Syncing… → 12 files imported") or a
readable failure. The dialog never just closes silently into an unchanged
page.

### 2.7 Manage means manage

The management surface for an existing Automation can:

- edit the trigger, source configuration, and destination;
- show run history — recent runs with time, result, and error details — and
  the next scheduled run;
- run, pause, resume, and delete, with each action labeled;
- confirm deletion inside the app's own dialog language. Native
  `window.confirm` is not part of this product's vocabulary.

### 2.8 Page hierarchy follows ownership

Once the user has Automations, "Your automations" is the primary content at
the top of the page and the catalog collapses into a secondary "Add more
sources" section. The catalog-as-hero layout is the empty state, where it is
excellent, not the permanent state.

### 2.9 Dialog fundamentals

All Automation dialogs close on `Escape`, trap focus, receive initial focus,
and keep a stable width across internal steps. Icon-only buttons carry
accessible names and tooltips.

## 3. Pre-ISSUE-031 implementation assessment

Historical baseline: `src/features/automation/` before ISSUE-031. The first
screen (catalog, category tabs, route marks) met the contract; the rest did
not. ISSUE-031 implemented the contract in `puppyone-desktop@2f5e120`; this
table remains as the traceable problem statement rather than a description of
the current code:

| Contract | Historical behavior |
| --- | --- |
| 2.1 One creation flow | `CloudNewAutomationDialog` contains a second source-picker step that duplicates the catalog; the dialog width jumps between steps; template entry hides the Back button. |
| 2.2 Connection-first | The desktop never queries OAuth status. Its `requiresCloudConnection` predicate keys on `creation_mode === "bootstrap"`, which no current datasource provider sets, so OAuth providers show `Ready` and create connections whose first run fails with an authorization error. |
| 2.3 Resource picker | Config fields render as raw text inputs; users paste provider IDs by hand. The server's provider-resources API is unused. |
| 2.4 No raw cron | Schedule is a bare five-part cron input; timezone is free text. |
| 2.5 Folder picker | Target path is a bare text input. |
| 2.6 Creation echo | The create response's `execution_result` is discarded; the dialog closes with no feedback. |
| 2.7 Manage | The manage dialog is read-only apart from run/pause/delete; the trigger pill is a dead `<button>`; delete uses `window.confirm`; run history endpoints are unused; two header buttons are unlabeled icons. |
| 2.8 Hierarchy | The catalog always renders above "Your automations". |
| 2.9 Fundamentals | `DesktopDialog` has no Escape handling or focus trap; only the manage dialog closes on Escape via an ad-hoc listener in the view. |

## 4. Technical architecture

### 4.1 Component ownership

```text
src/features/automation/
  DesktopCloudAutomationView.tsx   route view: session/project gates, provider
                                   specs fetch, detail-row selection, sidebar
  AutomationPage.tsx               landing page: catalog, categories, rows
  AutomationDialogs.tsx            create + manage dialogs
  AutomationControls.tsx           reusable source/resource, trigger, and
                                   project-folder editors
  AutomationTemplateCard.tsx       shared catalog/chooser source card
  automationTemplates.ts           catalog blueprints joined to live specs
  automationRequest.ts             create-request construction, run modes
  automationDomain.ts              row building, provider classification
```

`src/lib/cloudApi.ts` is the single transport adapter. It owns the legacy
`/integrations/*` HTTP base (see the domain-boundary doc); feature code never
sees those strings.

### 4.2 Server capabilities the desktop builds on

The Cloud service already exposes everything the Section 2 contract needs.
The desktop adapter is the missing piece, not the server:

| Capability | Endpoint (behind the adapter) |
| --- | --- |
| Provider specs | `GET /integrations/connectors` |
| User OAuth status per provider | `GET /oauth/{slug}/status` → `connected`, `workspace_name`, `connection_id` |
| Start OAuth | `GET /oauth/{slug}/authorize` → provider authorization URL (server-issued state; callback is handled by the Cloud web app) |
| Disconnect | `DELETE /oauth/{slug}/disconnect` |
| Resource enumeration | `GET /integrations/providers/{provider}/resources?q&cursor&resource_type` — searchable, cursor-paginated, includes `authorized` |
| Create + initial run | `POST /integrations/connections` — queues an initial sync and returns `execution_result` |
| Edit | `PATCH /integrations/connections/{id}`, `PATCH /integrations/connections/{id}/trigger` |
| Run history | `GET /integrations/connections/{id}/runs`, `GET /integrations/runs/{run_id}`, `GET /integrations/failed-runs?project_id` |
| Run / pause / resume / delete | `POST .../refresh`, `POST .../pause`, `POST .../resume`, `DELETE .../{id}` |

Provider naming: connector provider keys use underscores (`google_docs`);
OAuth route slugs use hyphens (`google-docs`). The adapter owns this mapping
in exactly one place.

### 4.3 Creation flow state machine

The create experience is a linear wizard whose steps are derived from the
provider spec plus live OAuth status:

```text
enter (template or chooser)
  -> [auth != none && !connected]  connect
        opens browser via authorize URL
        polls oauth status until connected (with cancel)
  -> configure
        resource picker (provider-resources API) or config fields
        trigger presets + destination folder
  -> create
        POST connection; surface execution_result
  -> done
        row appears highlighted with live run state
```

Rules:

- OAuth status is fetched for the open wizard and re-read on the next open;
  the connect step polls only while visible.
- The wizard never blocks on static spec fields that do not reflect user
  state.
- Closing the dialog during `connect` is safe; reopening re-reads status and
  skips the step if the connection completed meanwhile.
- Failure surfaces in place — creation errors, enqueue failures
  (`503` from the initial-run queue), and authorization failures each render
  a distinct, actionable message.

### 4.4 Data and refresh model

- Provider specs live in the route view's session-bound renderer state. OAuth
  statuses live only for the open wizard and are re-read whenever it opens;
  neither is persisted. Project-folder reads may use the shared bounded Cloud
  cache where appropriate, but connection status is intentionally fresh at
  the authorization gate.
- Connection rows continue to derive from the aggregate Cloud data
  (`scopes + connectors`); a targeted post-create refresh keeps the page
  consistent without a full aggregate reload.
- Run history is fetched lazily when the manage surface opens, not as part of
  the page load.

### 4.5 Boundaries that stay fixed

- The desktop never stores provider secrets or OAuth tokens; the OAuth
  callback lands in the Cloud web app, and the desktop only polls status.
- Automation code does not import Plugin code and vice versa
  (`npm run check:boundaries` enforces this).
- Product vocabulary is `Automation`; `/integrations` and `/workflows` remain
  transport-compatibility strings confined to `cloudApi.ts` and
  `getCloudAutomationWebPath()`.

## 5. Verification scenarios

1. **Template fast path.** Signed in, Google connected: click a template card
   → configure directly (no source step), pick a document from the picker,
   accept the default daily schedule, create → dialog closes, new row appears
   highlighted with its initial run state.
2. **OAuth gate.** Google not connected: the same card shows the connect step
   first; authorizing in the browser resumes the wizard automatically; cancel
   leaves no created connection.
3. **No dead ends.** For every provider the catalog offers, either creation
   can complete in the desktop flow or the flow states exactly what is
   missing and where to do it — a permanently disabled Create button is a
   failed scenario.
4. **Manage round-trip.** Open an existing Automation → change its schedule
   preset → the next-run summary updates; run history lists the previous runs
   with results.
5. **Delete.** Deleting asks for confirmation inside the dialog, never via a
   native popup, and states that project files stay in place.
6. **Keyboard.** Every Automation dialog opens with focus inside, traps Tab,
   and closes on Escape without side effects.
7. **Hierarchy.** With ≥1 automation, "Your automations" renders above the
   catalog; with none, the catalog hero renders.
