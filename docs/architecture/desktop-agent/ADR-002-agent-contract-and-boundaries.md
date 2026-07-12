# ADR-002: Shared Agent contract and enforced module boundaries

Date: 2026-07-11. Status: accepted and implemented.

ADR-005 supersedes ADR-003 and reaffirms the original multi-runtime purpose of
this contract. The dependency boundaries remain accepted. Production Chat may
register multiple native Agent backends, while shared Core, application and UI
code stay backend-neutral.

## Context

The first provider-neutral slice had the correct process boundary, but the
Renderer owned DTO types while Electron main used independent ad-hoc checks.
The Core Registry also imported OpenCode and Codex implementations. Those
choices worked for two runtimes but allowed protocol drift and required a Core
edit for every new runtime.

## Decision

Use one process-neutral contract package and one production composition root.

```text
shared/agent-contract
  +-- TypeScript DTO contract
  +-- IPC request/response parsers
  +-- event envelope validator
  +-- runtime inspection/capability validator

runtime/Registry + Port                 concrete runtimes
          ^                                    |
          | definitions injected              |
          +--------- bootstrap ----------------+
```

Electron main parses and strips every Agent IPC request before workspace or
file authorization, and validates every service response before it crosses the
bridge. Normalized events and runtime inspection results are validated at their
own boundaries. Constants and TypeScript unions are checked for drift.

`AgentRuntimeRegistry` and `AgentRuntimeHost` are pure Core. Only
`bootstrap/create-agent-runtime-host.mjs` imports concrete definitions. The
current production root still registers only the managed OpenCode definition;
ADR-005 requires it to register every production-ready native Agent backend.
Definitions own discovery, adapter construction and resource cleanup.

Renderer code follows:

```text
feature index -> ui -> application -> domain -> shared contract
```

Electron main follows:

```text
IPC -> application/use cases -> domain + runtime ports
bootstrap -> concrete infrastructure + ports
```

The build runs `scripts/check-agent-architecture.mjs` to reject reversed
imports, React in application/main layers, concrete providers in Registry,
legacy UI locations and cross-feature deep imports.

The only provider-named default outside a concrete runtime is the isolated v1
journal migration adapter. Old journals omitted a runtime id because the
original product supported only Codex. Current application/domain/UI code
receives the migrated id and never contains that historical default.

## Consequences

Benefits:

- malformed or additive privileged Renderer fields do not reach use cases;
- response and event drift fails near the responsible boundary;
- the process seam can be replaced in tests without changing product layers;
- UI, state synchronization and projection can evolve independently;
- written dependency rules are executable CI policy.

Costs:

- the mixed TypeScript/ESM repository keeps runtime schemas and TypeScript DTOs
  as colocated representations rather than compiling Electron main from TS;
- schema vocabulary synchronization requires a contract test;
- adapters must accurately advertise capabilities and implement action methods.

Migrating Electron main to a bundled TypeScript build may later generate both
representations from one schema, but that build-system change is not required
to preserve the boundary adopted here.
