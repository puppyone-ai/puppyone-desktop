const RECEIPT_RETENTION_DAYS = 8;
const DAILY_ACTIVE_RETENTION_DAYS = 35;
const MONTHLY_ACTIVE_RETENTION_DAYS = 62;

const DIMENSIONS = Object.freeze([
  Object.freeze({ name: "app_version", column: "app_version" }),
  Object.freeze({ name: "platform", column: "platform" }),
  Object.freeze({ name: "architecture", column: "architecture" }),
  Object.freeze({ name: "os_major", column: "os_major" }),
]);

export function createD1TelemetryRepository({ db }) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A D1 database binding is required.");
  }

  return Object.freeze({
    async ingest(events, receivedAt) {
      const receivedDay = toUtcDay(receivedAt);
      const receiptExpiryDay = addUtcDays(receivedDay, RECEIPT_RETENTION_DAYS);
      const statements = [];

      for (const event of events) {
        const properties = event.properties;
        const activityMonth = event.activity_day.slice(0, 7);
        statements.push(
          db.prepare(`
            INSERT OR IGNORE INTO telemetry_event_receipts (event_id, expires_on)
            VALUES (?1, ?2)
          `).bind(event.event_id, receiptExpiryDay),
          db.prepare(`
            INSERT OR IGNORE INTO telemetry_daily_active (
              activity_day,
              anonymous_id,
              app_version,
              platform,
              architecture,
              os_major,
              notice_version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          `).bind(
            event.activity_day,
            event.anonymous_id,
            properties.app_version,
            properties.platform,
            properties.architecture,
            properties.os_major,
            properties.notice_version,
          ),
          db.prepare(`
            INSERT INTO telemetry_monthly_active (
              activity_month,
              anonymous_id,
              first_activity_day,
              last_activity_day,
              app_version,
              platform,
              architecture,
              os_major,
              notice_version
            ) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT (activity_month, anonymous_id) DO UPDATE SET
              first_activity_day = MIN(first_activity_day, excluded.first_activity_day),
              last_activity_day = MAX(last_activity_day, excluded.last_activity_day),
              app_version = CASE
                WHEN excluded.last_activity_day >= last_activity_day THEN excluded.app_version
                ELSE app_version
              END,
              platform = CASE
                WHEN excluded.last_activity_day >= last_activity_day THEN excluded.platform
                ELSE platform
              END,
              architecture = CASE
                WHEN excluded.last_activity_day >= last_activity_day THEN excluded.architecture
                ELSE architecture
              END,
              os_major = CASE
                WHEN excluded.last_activity_day >= last_activity_day THEN excluded.os_major
                ELSE os_major
              END,
              notice_version = MAX(notice_version, excluded.notice_version)
          `).bind(
            activityMonth,
            event.anonymous_id,
            event.activity_day,
            properties.app_version,
            properties.platform,
            properties.architecture,
            properties.os_major,
            properties.notice_version,
          ),
        );
      }

      await db.batch(statements);
      return Object.freeze({ acceptedEventIds: Object.freeze(events.map((event) => event.event_id)) });
    },

    async rollupAndPrune(currentTime) {
      const currentDay = toUtcDay(currentTime);
      const targetDay = addUtcDays(currentDay, -1);
      const targetMonth = targetDay.slice(0, 7);
      const statements = [
        db.prepare(`
          DELETE FROM telemetry_rollups
          WHERE period_kind = 'day' AND period_start = ?1
        `).bind(targetDay),
        db.prepare(`
          DELETE FROM telemetry_rollups
          WHERE period_kind = 'month' AND period_start = ?1
        `).bind(targetMonth),
        createOverallRollupStatement(db, {
          source: "telemetry_daily_active",
          filterColumn: "activity_day",
          periodKind: "day",
          periodStart: targetDay,
          computedDay: currentDay,
        }),
        ...DIMENSIONS.map((dimension) => createDimensionRollupStatement(db, {
          source: "telemetry_daily_active",
          filterColumn: "activity_day",
          periodKind: "day",
          periodStart: targetDay,
          computedDay: currentDay,
          dimension,
        })),
        createOverallRollupStatement(db, {
          source: "telemetry_monthly_active",
          filterColumn: "activity_month",
          periodKind: "month",
          periodStart: targetMonth,
          computedDay: currentDay,
        }),
        ...DIMENSIONS.map((dimension) => createDimensionRollupStatement(db, {
          source: "telemetry_monthly_active",
          filterColumn: "activity_month",
          periodKind: "month",
          periodStart: targetMonth,
          computedDay: currentDay,
          dimension,
        })),
        db.prepare("DELETE FROM telemetry_event_receipts WHERE expires_on <= ?1").bind(currentDay),
        db.prepare("DELETE FROM telemetry_daily_active WHERE activity_day < ?1").bind(
          addUtcDays(currentDay, -(DAILY_ACTIVE_RETENTION_DAYS - 1)),
        ),
        db.prepare("DELETE FROM telemetry_monthly_active WHERE last_activity_day < ?1").bind(
          addUtcDays(currentDay, -(MONTHLY_ACTIVE_RETENTION_DAYS - 1)),
        ),
      ];

      await db.batch(statements);
      return Object.freeze({
        computedDay: currentDay,
        rolledUpDay: targetDay,
        rolledUpMonth: targetMonth,
      });
    },
  });
}

function createOverallRollupStatement(db, {
  computedDay,
  filterColumn,
  periodKind,
  periodStart,
  source,
}) {
  return db.prepare(`
    INSERT OR REPLACE INTO telemetry_rollups (
      period_kind,
      period_start,
      metric_name,
      dimension_name,
      dimension_value,
      metric_value,
      computed_day
    )
    SELECT ?1, ?2, 'active_installations', 'all', 'all', COUNT(*), ?3
    FROM ${source}
    WHERE ${filterColumn} = ?2
  `).bind(periodKind, periodStart, computedDay);
}

function createDimensionRollupStatement(db, {
  computedDay,
  dimension,
  filterColumn,
  periodKind,
  periodStart,
  source,
}) {
  return db.prepare(`
    INSERT OR REPLACE INTO telemetry_rollups (
      period_kind,
      period_start,
      metric_name,
      dimension_name,
      dimension_value,
      metric_value,
      computed_day
    )
    SELECT ?1, ?2, 'active_installations', ?3, ${dimension.column}, COUNT(*), ?4
    FROM ${source}
    WHERE ${filterColumn} = ?2
    GROUP BY ${dimension.column}
  `).bind(periodKind, periodStart, dimension.name, computedDay);
}

export function toUtcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid telemetry repository time is required.");
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid UTC day is required.");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
