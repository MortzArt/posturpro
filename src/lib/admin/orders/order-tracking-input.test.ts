/**
 * `order-tracking-input` unit tests (T12 AC-11/12). Pure parse/validate — bounds
 * + trims each field; an EMPTY tracking number is VALID (ship-without-tracking →
 * the shipped email renders `trackingNumber: null`, AC-12); the optional URL must
 * be a plausible http(s) URL or empty.
 */
import { describe, expect, it } from "vitest";
import {
  parseTrackingInput,
  TRACKING_NUMBER_MAX_LENGTH,
  TRACKING_URL_MAX_LENGTH,
} from "./order-tracking-input";

const valid = { trackingNumber: "1Z999", carrier: "DHL", trackingUrl: "https://dhl.com/track/1Z999" };

describe("parseTrackingInput — happy path", () => {
  it("accepts + trims a full tracking entry", () => {
    const result = parseTrackingInput({
      trackingNumber: "  1Z999  ",
      carrier: "  DHL  ",
      trackingUrl: "  https://dhl.com/1  ",
    });
    expect(result).toEqual({
      ok: true,
      values: { trackingNumber: "1Z999", carrier: "DHL", trackingUrl: "https://dhl.com/1" },
    });
  });

  it("accepts an http (not just https) tracking URL", () => {
    const result = parseTrackingInput({ ...valid, trackingUrl: "http://example.com/t" });
    expect(result.ok).toBe(true);
  });
});

describe("parseTrackingInput — empty tracking number allowed (AC-12)", () => {
  it("normalizes an empty tracking number to null (ship without tracking)", () => {
    const result = parseTrackingInput({ trackingNumber: "", carrier: "", trackingUrl: "" });
    expect(result).toEqual({
      ok: true,
      values: { trackingNumber: null, carrier: null, trackingUrl: null },
    });
  });

  it("normalizes a whitespace-only tracking number to null", () => {
    const result = parseTrackingInput({ trackingNumber: "   ", carrier: "DHL", trackingUrl: "" });
    expect(result).toMatchObject({ ok: true, values: { trackingNumber: null, carrier: "DHL" } });
  });
});

describe("parseTrackingInput — bounds", () => {
  it("rejects an over-long tracking number with a field error", () => {
    const result = parseTrackingInput({
      ...valid,
      trackingNumber: "x".repeat(TRACKING_NUMBER_MAX_LENGTH + 1),
    });
    expect(result).toEqual({ ok: false, field: "trackingNumber", error: "too-long" });
  });

  it("accepts a tracking number exactly at the max length (boundary)", () => {
    const result = parseTrackingInput({
      ...valid,
      trackingNumber: "x".repeat(TRACKING_NUMBER_MAX_LENGTH),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an over-long carrier", () => {
    const result = parseTrackingInput({ ...valid, carrier: "y".repeat(200) });
    expect(result).toEqual({ ok: false, field: "carrier", error: "too-long" });
  });

  it("rejects an over-long tracking URL", () => {
    const longUrl = "https://x.com/" + "a".repeat(TRACKING_URL_MAX_LENGTH);
    const result = parseTrackingInput({ ...valid, trackingUrl: longUrl });
    expect(result).toEqual({ ok: false, field: "trackingUrl", error: "too-long" });
  });
});

describe("parseTrackingInput — URL validation", () => {
  it("rejects a non-http(s) URL scheme (javascript:)", () => {
    const result = parseTrackingInput({ ...valid, trackingUrl: "javascript:alert(1)" });
    expect(result).toEqual({ ok: false, field: "trackingUrl", error: "url-invalid" });
  });

  it("rejects a malformed URL string", () => {
    const result = parseTrackingInput({ ...valid, trackingUrl: "not a url" });
    expect(result).toEqual({ ok: false, field: "trackingUrl", error: "url-invalid" });
  });

  it("rejects an ftp URL scheme", () => {
    const result = parseTrackingInput({ ...valid, trackingUrl: "ftp://x.com/file" });
    expect(result).toEqual({ ok: false, field: "trackingUrl", error: "url-invalid" });
  });
});
