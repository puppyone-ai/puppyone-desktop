import { describe, expect, it } from "vitest";
import {
  getDesktopTelemetryDisclosure,
} from "../shared/desktop-telemetry-contract.mjs";
import {
  createDesktopDailyActiveEvent,
  isDesktopTelemetryEvent,
} from "../electron/main/telemetry/domain/daily-active-event.mjs";

const validEvent = () => createDesktopDailyActiveEvent({
  activityDay: "2026-08-27",
  anonymousId: `m1_${"a".repeat(43)}`,
  appVersion: "0.3.10",
  architecture: "arm64",
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  osMajor: "15.6.1",
  platform: "darwin",
});

describe("Desktop telemetry public contract", () => {
  it("projects a fixed daily-active payload without workspace or account fields", () => {
    const event = validEvent();

    expect(event).toEqual({
      schema_version: 1,
      event_id: "123e4567-e89b-42d3-a456-426614174000",
      event: "desktop_daily_active",
      activity_day: "2026-08-27",
      anonymous_id: `m1_${"a".repeat(43)}`,
      properties: {
        app_version: "0.3.10",
        platform: "darwin",
        architecture: "arm64",
        os_major: "15",
        notice_version: 1,
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/path|prompt|account|email|remote|repository/i);
    expect(isDesktopTelemetryEvent(event)).toBe(true);
  });

  it("rejects payloads with unregistered fields", () => {
    const event = validEvent();
    expect(isDesktopTelemetryEvent({ ...event, workspace_path: "/private/project" })).toBe(false);
    expect(isDesktopTelemetryEvent({
      ...event,
      properties: { ...event.properties, locale: "en-US" },
    })).toBe(false);
  });

  it("rejects timestamps and invalid calendar days", () => {
    expect(() => createDesktopDailyActiveEvent({
      activityDay: "2026-08-27T07:00:00.000Z",
      anonymousId: `m1_${"a".repeat(43)}`,
      appVersion: "0.3.10",
      architecture: "arm64",
      eventId: "123e4567-e89b-42d3-a456-426614174000",
      osMajor: "15",
      platform: "darwin",
    })).toThrow(/activity day/);
    expect(isDesktopTelemetryEvent({ ...validEvent(), activity_day: "2026-02-30" })).toBe(false);
  });

  it("publishes the complete event disclosure from the shared contract", () => {
    const disclosure = getDesktopTelemetryDisclosure();
    expect(disclosure.events).toHaveLength(1);
    expect(disclosure.events[0]).toMatchObject({
      name: "desktop_daily_active",
      identifierRotation: "Calendar month",
    });
    expect(disclosure.neverCollected).toContain("file contents");
  });
});
