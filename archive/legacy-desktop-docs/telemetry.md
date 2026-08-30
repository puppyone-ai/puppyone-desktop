# PuppyOne Desktop product analytics

PuppyOne Desktop is local-first. Basic product analytics are designed to count
active Stable installations without collecting work content or account
identity. Eligible Stable installations can send the single allowlisted event
to PuppyOne's first-party ingestion service after the product notice is shown.

For privacy-related questions, contact
[`guanqun.real@puppyone.ai`](mailto:guanqun.real@puppyone.ai).

## Event catalog

The Basic level contains one event: `desktop_daily_active`. An eligible Stable
installation can create it at most once per UTC calendar day while PuppyOne is
foregrounded.

```json
{
  "schema_version": 1,
  "event_id": "random UUID used for retry deduplication",
  "event": "desktop_daily_active",
  "activity_day": "2026-08-27",
  "anonymous_id": "monthly rotating pseudonymous installation identifier",
  "properties": {
    "app_version": "0.3.10",
    "platform": "darwin",
    "architecture": "arm64",
    "os_major": "15",
    "notice_version": 1
  }
}
```

The identifier is derived from a random local secret and the current calendar
month. It is stable only within that month. It is not connected to a PuppyOne
account, Git identity, hardware identifier, or identifier from another month.
It supports exact calendar-month active-installation counts, not cross-month
retention cohorts or exact rolling 30-day users.

## Data never included in the event

- Account identifiers, email addresses, or authentication credentials.
- File contents, file paths, repository paths, or Git metadata.
- Prompts, agent responses, terminal text, or arbitrary error messages.
- Hardware serial numbers, MAC addresses, or device fingerprints.
- IP addresses or full User-Agent strings.

Cloudflare necessarily processes network connection metadata at its edge. The
Worker does not read that metadata into the product event and does not write it
to D1. Worker invocation logs are disabled so request metadata is not retained
as a PuppyOne analytics record.

## Retention and aggregation

| Data | Retention |
| --- | --- |
| Event retry receipts | 8 days |
| Daily pseudonymous active rows | 35 calendar days |
| Monthly pseudonymous active rows | 62 calendar days |
| Aggregate counts without pseudonymous IDs | Long term |

Basic analytics can be turned off at any time in **Settings → Privacy**.
Turning it off deletes the local queue and local identity secret.
The edge retention job removes previously submitted pseudonymous rows on the
schedule above. The service cannot map a monthly identifier to a PuppyOne
account or a natural person.

## Metrics and limitations

- DAU is the exact number of distinct monthly identifiers active on a UTC day.
- Calendar MAU is the exact number active during a UTC calendar month.
- These numbers represent installations, not people. One person using two
  computers contributes two installations.
- Monthly identifier rotation intentionally prevents exact cross-month
  deduplication.

The versioned source contract lives in
[`shared/desktop-telemetry-contract.mjs`](../shared/desktop-telemetry-contract.mjs).
The implementation and architectural guarantees are documented in
[`docs/architecture/desktop-product-telemetry.md`](architecture/desktop-product-telemetry.md).
