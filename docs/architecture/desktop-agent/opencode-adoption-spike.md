# Archived OpenCode adoption spike

Status: archived research evidence; not an implementation specification.

The original spike compared an OpenCode HTTP/SSE sidecar, ACP stdio and direct
package adoption. It was useful for selecting a managed OpenCode kernel for the
first-party `PuppyOne Agent`, but its intermediate sidecar recommendation and
point-in-time performance numbers are retired.

Current decisions:

- [ADR-005](ADR-005-multi-native-agent-backends.md) defines multi-native Agent
  product routing;
- [ADR-006](ADR-006-native-harness-adapters-and-acp.md) selects ACP stdio for
  both OpenCode-backed routes;
- [ADR-004](ADR-004-managed-agent-engine-distribution.md) defines bundling,
  integrity, isolation and rollback for PuppyOne Agent only;
- [OpenCode upgrade runbook](opencode-upgrade-runbook.md) owns release evidence;
- `benchmarks/performance/agent-chat.bench.ts` owns current performance evidence.

The audited upstream provenance remains:

```text
Source audit checkout  anomalyco/opencode@9976269ab1accfc9f9dc98a4a688c516934de422
License                MIT
```

Historical comparison details remain available in Git history. They must not
be copied into current design or release instructions.
