import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createDesktopDailyActiveEvent } from "../shared/desktop-telemetry-event.mjs";
import { createD1TelemetryRepository } from "../cloudflare/desktop-telemetry/src/d1-telemetry-repository.mjs";

describe("Cloudflare D1 Desktop telemetry repository", () => {
  it("writes idempotent receipt, daily-active, and monthly-active statements", async () => {
    const db = createD1Fixture();
    const repository = createD1TelemetryRepository({ db });
    const event = createDesktopDailyActiveEvent({
      activityDay: "2026-08-27",
      anonymousId: `m1_${"c".repeat(43)}`,
      appVersion: "0.3.10",
      architecture: "arm64",
      eventId: "123e4567-e89b-42d3-a456-426614174000",
      osMajor: "15",
      platform: "darwin",
    });

    await expect(repository.ingest([event], new Date("2026-08-27T18:00:00.000Z"))).resolves.toEqual({
      acceptedEventIds: [event.event_id],
    });
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(3);
    expect(normalizeSql(db.batches[0][0].sql)).toContain("insert or ignore into telemetry_event_receipts");
    expect(db.batches[0][0].bindings).toEqual([event.event_id, "2026-09-04"]);
    expect(normalizeSql(db.batches[0][1].sql)).toContain("insert or ignore into telemetry_daily_active");
    expect(db.batches[0][1].bindings).toEqual([
      "2026-08-27",
      event.anonymous_id,
      "0.3.10",
      "darwin",
      "arm64",
      "15",
      1,
    ]);
    expect(normalizeSql(db.batches[0][2].sql)).toContain("on conflict (activity_month, anonymous_id)");
    expect(db.batches[0][2].bindings[0]).toBe("2026-08");
    expect(JSON.stringify(db.batches[0])).not.toMatch(/sent_at|ip_address|user_agent|account/i);
  });

  it("rolls up the previous UTC day and month before applying bounded retention", async () => {
    const db = createD1Fixture();
    const repository = createD1TelemetryRepository({ db });

    await expect(repository.rollupAndPrune(new Date("2026-09-01T00:17:00.000Z"))).resolves.toEqual({
      computedDay: "2026-09-01",
      rolledUpDay: "2026-08-31",
      rolledUpMonth: "2026-08",
    });
    expect(db.batches[0]).toHaveLength(15);
    expect(db.batches[0].slice(-3).map((statement) => statement.bindings)).toEqual([
      ["2026-09-01"],
      ["2026-07-29"],
      ["2026-07-02"],
    ]);
    expect(db.batches[0].filter((statement) => (
      normalizeSql(statement.sql).includes("insert or replace into telemetry_rollups")
    ))).toHaveLength(10);
  });

  it("defines exact unique sets without network or workspace columns", async () => {
    const migration = await fs.readFile(new URL(
      "../cloudflare/desktop-telemetry/migrations/0001_initial.sql",
      import.meta.url,
    ), "utf8");

    expect(migration).toContain("PRIMARY KEY (activity_day, anonymous_id)");
    expect(migration).toContain("PRIMARY KEY (activity_month, anonymous_id)");
    expect(migration).toContain("telemetry_rollups");
    expect(migration).not.toMatch(/ip_address|user_agent|email|account|workspace|repository/i);
  });
});

function createD1Fixture() {
  const batches = [];
  return {
    batches,
    prepare(sql) {
      return {
        sql,
        bind(...bindings) {
          return Object.freeze({ sql, bindings: Object.freeze(bindings) });
        },
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

function normalizeSql(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
