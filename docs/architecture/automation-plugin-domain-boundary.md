# Automation and Plugin Domain Boundary

**Status:** Active architecture contract.

PuppyOne has two deliberately independent extension domains. `Automation` is
the cloud product for connecting information sources and running imports or
synchronization. `Plugin` is the local desktop product for extending file
presentation. They share visual design tokens, but they do not share runtime
authority, storage, package identity, permissions, lifecycle, or delivery.

## 1. Product vocabulary

| Domain | Owns | Does not own |
| --- | --- | --- |
| Automation | Cloud provider authorization, source configuration, schedules/manual runs, project targets, execution status | Local viewer packages, local file rendering, Viewer Pack grants |
| Plugin | Local file preview contributions, signed Viewer Packs, local install/disable/uninstall state, sandboxed document reads | OAuth, Cloud credentials, sync jobs, remote project mutations |

`Integration` is retired as a product/domain name. The Cloud service still has
established `/integrations/*` HTTP routes and a `/workflows` web route. Those
strings are legacy transport compatibility only;
`src/lib/cloud/automationApi.ts` is the adapter allowed to know the old HTTP
base, `src/lib/cloudApi.ts` is its stable public facade, and
`getCloudAutomationWebPath()` owns the web-path compatibility detail. New UI,
state, types, tests, and documentation use `Automation`.

## 2. Source ownership and dependency direction

```text
src/features/automation/
    -> Cloud session + transport contracts
    -> shared Cloud presentation/data primitives
    -X src/features/plugins/
    -X electron/main/viewer-packs/

src/features/plugins/
    -> immutable preset Viewer Contract
    -> capability-gated viewerPacks preload bridge
    -X src/features/automation/
    -X Cloud transport and credentials

electron/main/viewer-packs/
    -> local workspace authority + sandbox/resource broker
    -X Cloud Automation
```

Automation is no longer implemented as an `Access` filter. It owns its page,
provider navigation, dialogs, domain classification, and styles under
`src/features/automation/`. Cloud Access may supply shared connector/scope read
models, but it cannot activate Plugin code and Plugin code cannot call those
Cloud models.

`scripts/check-automation-plugin-boundaries.mjs`, included in
`npm run check:boundaries`, rejects imports or authority references that cross
this line and rejects reintroducing the retired product name outside the two
explicit compatibility boundaries.

## 3. Storage and system of record

### Automation

- The Cloud service is the system of record for provider connections,
  authorization references, automation configuration, runs, status, and
  project mutations.
- The desktop renderer holds fetched Automation data in React state. The
  shared Cloud cache is bounded, session-namespaced, memory-only, and cleared
  when the session namespace changes.
- The Automation feature does not create a directory under Electron
  `userData`, does not persist provider secrets, and does not read Plugin
  registry state.
- OAuth and credential material remain owned by the Cloud/auth boundary; they
  are never copied into a Viewer Pack manifest or grant.

### Plugin

- Electron main is the system of record for external Viewer Packs.
- Host state lives only under `<userData>/viewer-packs/`, including the atomic
  registry, grants, quarantine, downloads, and content-addressed packages.
- The renderer consumes a main-issued snapshot and never scans or interprets
  that store directly.
- Plugin state is per machine and local only. It is not uploaded, synchronized,
  or represented as an Automation connection.

IDs are domain-qualified by ownership: remote Automation connection ids are
opaque Cloud ids; Plugin ids are reverse-domain package ids verified by the
local package authority. Code must never join or translate one into the other.

## 4. Runtime and security boundary

Automation executes through authenticated Cloud requests. It may mutate only
the remote project/scope authorized by that Cloud session. Plugin execution is
a sandboxed local `WebContentsView` with a main-derived workspace grant,
bounded document handles, no network permission in Viewer API v1, and no Cloud
session or credential surface.

Consequently:

- opening a local document never starts, authorizes, or installs Automation;
- running Automation never installs or activates a Plugin;
- disabling either feature does not mutate the other's state;
- uninstalling a Plugin cannot delete remote content;
- deleting Automation cannot touch `<userData>/viewer-packs` or local package
  bytes.

Any future bridge between these domains requires a separate architecture
decision, explicit user consent, a versioned capability, and independent
security review. Reusing current permissions implicitly is forbidden.

## 5. Lifecycle and migration rules

1. Product routes and labels use `automation` / `Automation`.
2. The old `integrations` route id is accepted only by
   `normalizeCloudSection()` long enough to migrate existing navigation state.
3. The existing HTTP and web paths remain compatible until the Cloud service
   publishes new routes. A server migration changes only the Automation
   transport adapter and web-path adapter, not Automation UI or domain types.
4. Plugin remains local-only even if an online catalog is added later. A
   catalog may distribute signed package bytes; it cannot become Automation or
   share Automation credentials.
5. Shared code is limited to presentation primitives and inert data types.
   Authority, persistence, commands, registries, and lifecycle stay separate.
