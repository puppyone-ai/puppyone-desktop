import { describe, expect, it } from "vitest";
import { createDesktopDailyActiveEvent } from "../shared/desktop-telemetry-event.mjs";
import {
  parseDesktopTelemetryRequest,
  TelemetryRequestError,
} from "../cloudflare/desktop-telemetry/src/ingest-contract.mjs";

const now = () => new Date("2026-08-27T12:00:00.000Z");

describe("Cloudflare Desktop telemetry ingest contract", () => {
  it("accepts the exact shared client schema without retaining the transport timestamp", async () => {
    const envelope = await parseDesktopTelemetryRequest(createRequest(createEnvelope()), { now });

    expect(envelope.events).toEqual([createEvent()]);
    expect(envelope.sentAt).toBe("2026-08-27T12:00:00.000Z");
    expect(envelope.events[0]).not.toHaveProperty("occurred_at");
    expect(envelope.events[0].properties).not.toHaveProperty("channel");
  });

  it("rejects arbitrary fields and activity timestamps", async () => {
    const event = createEvent();
    await expect(parseDesktopTelemetryRequest(createRequest(createEnvelope({
      events: [{ ...event, occurred_at: "2026-08-27T09:30:00.000Z" }],
    })), { now })).rejects.toMatchObject({
      status: 400,
      code: "invalid_events",
    });
    await expect(parseDesktopTelemetryRequest(createRequest(createEnvelope({
      events: [{ ...event, properties: { ...event.properties, channel: "stable" } }],
    })), { now })).rejects.toBeInstanceOf(TelemetryRequestError);
  });

  it("rejects future, stale, oversized, and non-JSON requests", async () => {
    await expect(parseDesktopTelemetryRequest(createRequest(createEnvelope({
      events: [createEvent({ activityDay: "2026-08-28" })],
    })), { now })).rejects.toMatchObject({ code: "activity_day_out_of_range" });
    await expect(parseDesktopTelemetryRequest(createRequest(createEnvelope({
      events: [createEvent({ activityDay: "2026-08-18" })],
    })), { now })).rejects.toMatchObject({ code: "activity_day_out_of_range" });
    await expect(parseDesktopTelemetryRequest(new Request("https://telemetry.puppyone.ai/v1/desktop/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "999999" },
      body: "{}",
    }), { now })).rejects.toMatchObject({ status: 413 });
    await expect(parseDesktopTelemetryRequest(new Request("https://telemetry.puppyone.ai/v1/desktop/events", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    }), { now })).rejects.toMatchObject({ status: 415 });
  });
});

function createEvent({ activityDay = "2026-08-27" } = {}) {
  return createDesktopDailyActiveEvent({
    activityDay,
    anonymousId: `m1_${"a".repeat(43)}`,
    appVersion: "0.3.10",
    architecture: "arm64",
    eventId: "123e4567-e89b-42d3-a456-426614174000",
    osMajor: "15",
    platform: "darwin",
  });
}

function createEnvelope(overrides = {}) {
  return {
    schema_version: 1,
    sent_at: "2026-08-27T12:00:00.000Z",
    events: [createEvent()],
    ...overrides,
  };
}

function createRequest(payload) {
  return new Request("https://telemetry.puppyone.ai/v1/desktop/events", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
}
