CREATE TABLE IF NOT EXISTS telemetry_event_receipts (
  event_id TEXT PRIMARY KEY NOT NULL,
  expires_on TEXT NOT NULL CHECK (
    length(expires_on) = 10
    AND substr(expires_on, 5, 1) = '-'
    AND substr(expires_on, 8, 1) = '-'
  )
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_telemetry_event_receipts_expires_on
  ON telemetry_event_receipts (expires_on);

CREATE TABLE IF NOT EXISTS telemetry_daily_active (
  activity_day TEXT NOT NULL CHECK (
    length(activity_day) = 10
    AND substr(activity_day, 5, 1) = '-'
    AND substr(activity_day, 8, 1) = '-'
  ),
  anonymous_id TEXT NOT NULL CHECK (length(anonymous_id) BETWEEN 35 AND 67),
  app_version TEXT NOT NULL CHECK (length(app_version) BETWEEN 1 AND 80),
  platform TEXT NOT NULL CHECK (length(platform) BETWEEN 1 AND 32),
  architecture TEXT NOT NULL CHECK (length(architecture) BETWEEN 1 AND 32),
  os_major TEXT NOT NULL CHECK (length(os_major) BETWEEN 1 AND 7),
  notice_version INTEGER NOT NULL CHECK (notice_version >= 1),
  PRIMARY KEY (activity_day, anonymous_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS telemetry_monthly_active (
  activity_month TEXT NOT NULL CHECK (
    length(activity_month) = 7
    AND substr(activity_month, 5, 1) = '-'
  ),
  anonymous_id TEXT NOT NULL CHECK (length(anonymous_id) BETWEEN 35 AND 67),
  first_activity_day TEXT NOT NULL,
  last_activity_day TEXT NOT NULL,
  app_version TEXT NOT NULL CHECK (length(app_version) BETWEEN 1 AND 80),
  platform TEXT NOT NULL CHECK (length(platform) BETWEEN 1 AND 32),
  architecture TEXT NOT NULL CHECK (length(architecture) BETWEEN 1 AND 32),
  os_major TEXT NOT NULL CHECK (length(os_major) BETWEEN 1 AND 7),
  notice_version INTEGER NOT NULL CHECK (notice_version >= 1),
  PRIMARY KEY (activity_month, anonymous_id),
  CHECK (first_activity_day <= last_activity_day)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_telemetry_monthly_active_last_day
  ON telemetry_monthly_active (last_activity_day);

CREATE TABLE IF NOT EXISTS telemetry_rollups (
  period_kind TEXT NOT NULL CHECK (period_kind IN ('day', 'month')),
  period_start TEXT NOT NULL,
  metric_name TEXT NOT NULL CHECK (metric_name = 'active_installations'),
  dimension_name TEXT NOT NULL CHECK (
    dimension_name IN ('all', 'app_version', 'platform', 'architecture', 'os_major')
  ),
  dimension_value TEXT NOT NULL,
  metric_value INTEGER NOT NULL CHECK (metric_value >= 0),
  computed_day TEXT NOT NULL,
  PRIMARY KEY (
    period_kind,
    period_start,
    metric_name,
    dimension_name,
    dimension_value
  )
) WITHOUT ROWID;
