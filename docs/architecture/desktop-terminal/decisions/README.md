# Terminal Architecture Decisions

This index records durable decisions for the Desktop Terminal domain. For the
current PTY and launcher implementation, start with
[Desktop Terminal Architecture](../../desktop-terminal-architecture.md). For
native Session Groups and tab-drag splitting, start with
[Terminal Session Groups and Split Layout](../session-groups-and-split-layout.md).
For semantic activity, start with
[Local Agents and Agent file activity](../../desktop-agent/local-agents-and-file-activity.md).
ADR numbering follows the shared PuppyOne documentation decision sequence; the
implemented ADR-001 outcome is maintained in that Agent activity document.

| Decision | Status | Role |
| --- | --- | --- |
| [Terminal Agent file activity architecture](../../desktop-agent/local-agents-and-file-activity.md#4-agent-file-activity-architecture) | Implemented | Keeps the native TUI, rejects PTY scraping for file attribution, and defines provider Hook adapters plus a neutral activity broker. |
| [ADR-002: Native Terminal Groups and Split Layout](ADR-002-native-terminal-groups-and-split-layout.md) | Accepted for next Desktop version; implementation pending | Keeps one live Runtime/PTY per Session, introduces Group-owned recursive split trees, defines tab-to-pane movement, and rejects tmux as the layout authority. |
