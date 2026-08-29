# PuppyOne Desktop telemetry edge

This Cloudflare Worker accepts the single public Desktop telemetry event,
enforces the shared schema, and maintains exact active-installation sets in D1.
It is deliberately deploy-safe: `TELEMETRY_MODE` defaults to `paused`, the D1
identifier is a non-existent sentinel, and the Stable Desktop endpoint remains
unset elsewhere in the repository.

## Runtime boundary

- `POST /v1/desktop/events` accepts one versioned batch of at most 16 events.
- `GET /healthz` reports only the operational mode.
- The Worker does not read or persist IP, User-Agent, account, repository, or
  workspace information.
- `INGEST_RATE_LIMITER` is keyed by the monthly rotating pseudonymous ID.
- D1 primary keys make daily and calendar-month active counts exact.
- The scheduled handler runs at 00:17 UTC to roll up the previous day/month and
  delete expired pseudonymous rows.
- Wrangler usage metrics and dependency instrumentation are disabled for this
  project in addition to Worker invocation logs.

## Operational modes

| Mode | Behavior |
| --- | --- |
| `paused` | Returns retryable `503`; default for every new deployment. |
| `accept` | Validates, limits, and persists accepted events. |
| `discard` | Validates and acknowledges events without persisting them. Emergency privacy kill switch. |

## Local verification

From the repository root:

```bash
npm run test:desktop-telemetry
npm run check:boundaries
npx wrangler dev --config cloudflare/desktop-telemetry/wrangler.jsonc
```

The checked-in sentinel database ID is suitable only for code review and local
configuration validation. Do not deploy it.

## Provisioning checklist

These commands are intentionally not run by repository builds:

```bash
npx wrangler whoami
npx wrangler d1 create puppyone-desktop-telemetry
npx wrangler d1 migrations apply puppyone-desktop-telemetry \
  --remote \
  --config cloudflare/desktop-telemetry/wrangler.jsonc
npx wrangler deploy --config cloudflare/desktop-telemetry/wrangler.jsonc
```

After `d1 create`, replace the sentinel `database_id` with the returned ID.
Keep the mode `paused` during migration and smoke testing. Configure the
`telemetry.puppyone.ai` custom domain only after the Worker is verified.

## Activation gates

Do not change `TELEMETRY_MODE` to `accept` or configure the Stable Desktop
endpoint until all of the following are true:

1. Migrations and malformed-request tests pass against a non-production Worker.
2. Worker invocation logs are confirmed disabled and no request body is logged.
3. The public telemetry disclosure and product notice are published.
4. The Settings opt-out is available in the same Stable release.
5. The privacy contact `guanqun.real@puppyone.ai` is monitored.
6. D1 contains no IP address, User-Agent, account, or workspace columns.
7. `paused`, `discard`, rate-limit, duplicate, offline-batch, and Cron behavior
   have all been smoke tested.

Only then set the client endpoint to
`https://telemetry.puppyone.ai/v1/desktop/events`, deploy the Stable release,
and change the Worker to `accept`.
