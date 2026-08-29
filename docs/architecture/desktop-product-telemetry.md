# Desktop product telemetry

PuppyOne Desktop treats product analytics as an explicit, versioned boundary.
The renderer never imports an analytics SDK and application features never send
arbitrary property bags. The Electron main process owns preference enforcement,
identifier rotation, local queuing, and transport.

## Directory boundary

```text
shared/
  desktop-telemetry-contract.mjs
  desktop-telemetry-event.mjs
  desktop-telemetry-distribution-contract.mjs

electron/main/telemetry/
  domain/
    daily-active-event.mjs
  application/
    desktop-telemetry-service.mjs
  infrastructure/
    atomic-json-file.mjs
    telemetry-preference-store.mjs
    telemetry-identity-store.mjs
    telemetry-queue-store.mjs
    telemetry-http-transport.mjs
  bootstrap/
    create-desktop-telemetry-host.mjs

electron/main/ipc/
  telemetry-ipc.mjs

cloudflare/desktop-telemetry/
  migrations/
    0001_initial.sql
  src/
    ingest-contract.mjs
    d1-telemetry-repository.mjs
    worker.mjs
    index.mjs
  wrangler.jsonc
```

- `shared` is the public event catalog, disclosure, and the single event
  constructor/validator used by both client and edge.
- `domain` preserves the Electron import boundary by re-exporting the shared
  event authority.
- `application` decides eligibility, frequency, consent-notice gating, retries,
  and deletion behavior.
- `infrastructure` owns private local files and the replaceable HTTP adapter.
- `bootstrap` wires the service to packaged Stable builds and foreground focus.
- `ipc` exposes settings controls without exposing storage or transport details.
- `cloudflare` validates the same schema, rate limits public writes, keeps exact
  short-lived active sets in D1, and creates long-lived aggregate counts.

## Privacy invariants

1. Development, unpackaged, and Internal builds never contribute to public
   product analytics.
2. A Stable build defaults to the `basic` preference, but sending stays dormant
   until the current notice has actually been presented by the product UI.
3. The first schema contains one event: `desktop_daily_active`, emitted at most
   once per UTC day after a PuppyOne window receives foreground focus.
4. A random 256-bit local secret derives an HMAC identifier scoped to the
   current calendar month. The secret and identifiers are never connected to a
   PuppyOne account, Git identity, hardware identifier, or another month.
5. Switching telemetry off deletes the pending queue and the local identity
   secret immediately.
6. Event construction is allowlisted. Workspace data, file paths, prompts,
   agent output, terminal text, and arbitrary error messages have no API path
   into the telemetry envelope.
7. The queue is bounded to 32 events and seven days. Retry logs contain only a
   status code and retryability flag, never the payload.
8. The Stable client pins a first-party HTTPS endpoint, and the production edge
   runs in `accept` mode. `discard` remains the emergency privacy kill switch.
9. D1 stores no IP address, User-Agent, account, or workspace column. Worker
   invocation logs are disabled.

## Product states

| Stored level | Notice seen | Eligible Stable build | Transport | Effective level |
| --- | --- | --- | --- | --- |
| `off` | any | any | any | `off` |
| `basic` | no | yes | configured | `off` (`notice-required`) |
| `basic` | yes | no | configured | `off` (`unpackaged-build` or `non-stable-build`) |
| `basic` | yes | yes | missing | `off` (`transport-unconfigured`) |
| `basic` | yes | yes | configured | `basic` |

The renderer can read this state before deciding whether to show the one-time
notice or the permanent Privacy & Data settings row.

## Ingestion contract

The client sends a bounded batch to a first-party HTTPS endpoint:

```json
{
  "schema_version": 1,
  "sent_at": "2026-08-27T08:00:00.000Z",
  "events": [
    {
      "schema_version": 1,
      "event_id": "uuid",
      "event": "desktop_daily_active",
      "activity_day": "2026-08-27",
      "anonymous_id": "monthly-hmac-id",
      "properties": {
        "app_version": "0.3.10",
        "platform": "darwin",
        "architecture": "arm64",
        "os_major": "15",
        "notice_version": 1
      }
    }
  ]
}
```

The edge service validates the same schema, rate limits abusive clients,
discard raw IP addresses and user-agent strings before durable storage, and
aggregate individual events on a documented retention schedule. The ingestion
URL is pinned to the first-party production route in
`shared/desktop-telemetry-distribution-contract.mjs`. Open-source clients cannot
hold a trustworthy secret, so telemetry is for product trends only and must
never authorize access, drive billing, or act as a security signal.

## Metrics

- DAU: distinct `anonymous_id` values with `desktop_daily_active` on a UTC day.
- Calendar MAU: distinct `anonymous_id` values during a calendar month.
- DAU/MAU: activity ratio for telemetry-enabled installations.

These are active installations, not people. Monthly identifier rotation is
intentional: it supports calendar DAU/MAU while preventing cross-month user
profiles or retention cohorts in the default-on analytics level.

## Edge lifecycle

- `telemetry_event_receipts` retains retry UUIDs for eight days.
- `telemetry_daily_active` uses `(activity_day, anonymous_id)` as its primary
  key and retains 35 UTC calendar days.
- `telemetry_monthly_active` uses `(activity_month, anonymous_id)` as its
  primary key and retains 62 UTC calendar days.
- `telemetry_rollups` stores only aggregate active-installation counts and has
  no pseudonymous identifier column.
- The 00:17 UTC Cron recomputes the previous day and its calendar month before
  pruning expired pseudonymous rows.

The edge exposes `paused`, `accept`, and `discard` modes. `paused` produces a
retryable response. `discard` validates and acknowledges events without
persisting them, providing a server-side emergency privacy kill switch that
does not require a Desktop release.
