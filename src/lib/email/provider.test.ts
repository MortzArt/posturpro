import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider is the ONLY module that constructs the Resend SDK. These tests
 * mock `resend` entirely — NO test performs a real network send (AC-9). They
 * cover: dev-preview short-circuit (flag + missing key), live send success,
 * provider-error isolation, and the missing-key swallow.
 */
vi.mock("server-only", () => ({}));

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const ENV_KEYS = ["EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_OWNER_ADDRESS", "EMAIL_DEV_PREVIEW"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  sendMock.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

const INPUT = { to: "c@test.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

async function importProvider() {
  return import("./provider");
}

describe("sendEmail dev-preview (AC-8)", () => {
  it("short-circuits when EMAIL_DEV_PREVIEW=1 (no network)", async () => {
    process.env.EMAIL_DEV_PREVIEW = "1";
    process.env.EMAIL_API_KEY = "re_live_key";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { sendEmail } = await importProvider();
    const result = await sendEmail(INPUT);
    expect(result).toEqual({ ok: true, preview: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("PREVIEW"));
  });

  it("short-circuits when EMAIL_API_KEY is absent (no network)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { sendEmail } = await importProvider();
    const result = await sendEmail(INPUT);
    expect(result).toEqual({ ok: true, preview: true });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("sendEmail live send", () => {
  beforeEach(() => {
    process.env.EMAIL_API_KEY = "re_live_key";
    process.env.EMAIL_FROM_ADDRESS = "from@test.com";
    process.env.EMAIL_OWNER_ADDRESS = "owner@test.com";
  });

  it("delivers via the provider and returns ok on success", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
    const { sendEmail } = await importProvider();
    const result = await sendEmail(INPUT);
    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "from@test.com", to: "c@test.com", subject: "Hi", text: "Hi" }),
    );
  });

  it("passes replyTo through when supplied", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_2" }, error: null });
    const { sendEmail } = await importProvider();
    await sendEmail({ ...INPUT, replyTo: "reply@test.com" });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "reply@test.com" }));
  });

  it("returns a typed failure on a provider error (never throws)", async () => {
    sendMock.mockResolvedValue({ data: null, error: { name: "rate_limit", message: "slow down" } });
    const { sendEmail } = await importProvider();
    const result = await sendEmail(INPUT);
    expect(result).toEqual({ ok: false, reason: "rate_limit: slow down" });
  });

  it("returns a typed failure when the SDK throws (never throws)", async () => {
    sendMock.mockRejectedValue(new Error("network down"));
    const { sendEmail } = await importProvider();
    const result = await sendEmail(INPUT);
    expect(result).toEqual({ ok: false, reason: "network down" });
  });
});

describe("sendEmail partial config (AC-7/AC-13)", () => {
  it("swallows a missing EMAIL_FROM_ADDRESS as a typed failure", async () => {
    process.env.EMAIL_API_KEY = "re_live_key";
    // EMAIL_FROM_ADDRESS intentionally absent → getEmailEnv throws → swallowed.
    const { sendEmail } = await importProvider();
    const result = await sendEmail(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("EMAIL_FROM_ADDRESS");
    }
    expect(sendMock).not.toHaveBeenCalled();
  });
});
