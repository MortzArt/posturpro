/**
 * Action-level tests for `submitContactForm` (T13 AC-11..AC-17, edges 4–7).
 *
 * This closes the seam S4 (ReviewFix) flagged as UNCOVERED: the thin branch-
 * mapping in `actions.ts` that turns a honeypot / validation / rate-limit /
 * relay outcome into a serializable `ContactFormState`. The guard, rate limiter,
 * and `sendContactRelay` dispatch are each unit-tested SEPARATELY; here we prove
 * the WIRING composes them in the right order and maps every result correctly.
 *
 * The dependency edges are mocked so the test is pure and env-independent:
 *   - `server-only`  → no-op (the action module imports the relay, which is
 *     `server-only`; mirrors `dispatch.test.ts` / `admin/actions.test.ts`).
 *   - `sendContactRelay` → a `vi.fn()` we drive per-case (success / {ok:false} /
 *     throw) so we never touch the network, env, or DB.
 *   - `clientIp` → a fixed IP so the rate-limit key is deterministic.
 *   - `checkContactRateLimit` → a `vi.fn()` we flip to prove the rate-limit gate.
 *
 * `submit-guard` is left REAL (it is pure) so the ordering invariants
 * (honeypot-before-validate, validate-before-ratelimit, trim/cap) are exercised
 * end-to-end through the action, not re-mocked away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendContactRelay = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendContactRelay: (...args: unknown[]) => sendContactRelay(...args),
}));

const clientIp = vi.fn();
vi.mock("@/lib/request/client-ip", () => ({
  clientIp: () => clientIp(),
}));

const checkContactRateLimit = vi.fn();
vi.mock("@/lib/contact/rate-limit", () => ({
  checkContactRateLimit: (...args: unknown[]) => checkContactRateLimit(...args),
}));

import { submitContactForm } from "./actions";
import { initialContactFormState } from "./contact-form-state";

/** Build a `FormData` for the contact fields (honeypot `website` defaults empty). */
function buildFormData(fields: {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  website?: string;
}): FormData {
  const fd = new FormData();
  fd.set("name", fields.name ?? "Ana");
  fd.set("email", fields.email ?? "ana@example.com");
  fd.set("subject", fields.subject ?? "");
  fd.set("message", fields.message ?? "Hola, tengo una pregunta.");
  fd.set("website", fields.website ?? "");
  return fd;
}

beforeEach(() => {
  sendContactRelay.mockReset().mockResolvedValue({ ok: true, sent: true });
  clientIp.mockReset().mockResolvedValue("203.0.113.5");
  checkContactRateLimit.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitContactForm — happy path (AC-11, AC-12)", () => {
  it("relays a valid submission and returns success WITHOUT preserved values", async () => {
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ subject: "Envíos", message: "¿A dónde envían?" }),
    );
    expect(result.status).toBe("success");
    // Success clears the form — no values echoed back (AC-12).
    expect(result.values).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();
    expect(sendContactRelay).toHaveBeenCalledTimes(1);
  });

  it("increments submissionId per call (idempotency-safe useActionState contract, AC-12)", async () => {
    const first = await submitContactForm(
      { status: "idle", submissionId: 4 },
      buildFormData({}),
    );
    expect(first.submissionId).toBe(5);
    const second = await submitContactForm(first, buildFormData({}));
    expect(second.submissionId).toBe(6);
  });

  it("passes trimmed fields to the relay and collapses a blank subject to null (dispatch contract)", async () => {
    await submitContactForm(
      initialContactFormState,
      buildFormData({ name: "  Ana  ", email: "  ana@example.com  ", subject: "   ", message: "  Hola  " }),
    );
    expect(sendContactRelay).toHaveBeenCalledWith({
      fromName: "Ana",
      fromEmail: "ana@example.com",
      subject: null, // blank optional subject → null, never "".
      message: "Hola",
    });
  });

  it("forwards a non-blank subject as a trimmed string", async () => {
    await submitContactForm(
      initialContactFormState,
      buildFormData({ subject: "  Garantía  ", message: "¿Cubre 2 años?" }),
    );
    expect(sendContactRelay).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Garantía" }),
    );
  });

  it("passes the message body VERBATIM (only trimmed) — the template escapes it (AC-17)", async () => {
    const hostile = "<script>alert(1)</script> & <b>bold</b>";
    await submitContactForm(
      initialContactFormState,
      buildFormData({ message: `  ${hostile}  ` }),
    );
    expect(sendContactRelay).toHaveBeenCalledWith(
      expect.objectContaining({ message: hostile }),
    );
  });
});

describe("submitContactForm — validation (AC-13, edge 7)", () => {
  it("returns invalid with fieldErrors + PRESERVED raw values and sends NOTHING", async () => {
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ name: "  ", email: "not-an-email", message: "  " }),
    );
    expect(result.status).toBe("invalid");
    expect(result.fieldErrors).toMatchObject({
      name: "nameRequired",
      email: "emailInvalid",
      message: "messageRequired",
    });
    // Raw (untrimmed) values echoed so the form keeps exactly what was typed.
    expect(result.values).toEqual({
      name: "  ",
      email: "not-an-email",
      subject: "",
      message: "  ",
    });
    expect(sendContactRelay).not.toHaveBeenCalled();
    // Validation precedes the rate-limit gate — no IP resolution on invalid input.
    expect(checkContactRateLimit).not.toHaveBeenCalled();
  });

  it("caps a 100k hostile message as messageTooLong before any send (edge 7)", async () => {
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ message: "x".repeat(100_000) }),
    );
    expect(result.status).toBe("invalid");
    expect(result.fieldErrors?.message).toBe("messageTooLong");
    expect(sendContactRelay).not.toHaveBeenCalled();
  });
});

describe("submitContactForm — rate limit (AC-14, edge 5)", () => {
  it("returns rate-limited with preserved values and sends NOTHING when the limiter denies", async () => {
    checkContactRateLimit.mockReturnValue(false);
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ name: "Ana", message: "Hola" }),
    );
    expect(result.status).toBe("rate-limited");
    expect(result.values).toEqual({
      name: "Ana",
      email: "ana@example.com",
      subject: "",
      message: "Hola",
    });
    expect(sendContactRelay).not.toHaveBeenCalled();
  });

  it("keys the limiter by the resolved client IP (best-effort per-IP throttle)", async () => {
    clientIp.mockResolvedValue("198.51.100.9");
    await submitContactForm(initialContactFormState, buildFormData({}));
    expect(checkContactRateLimit).toHaveBeenCalledWith("198.51.100.9");
  });
});

describe("submitContactForm — honeypot (AC-15, edge 6)", () => {
  it("returns a FAKE success with no send and no preserved values when the honeypot is filled", async () => {
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ website: "http://spam.example" }),
    );
    // Indistinguishable from a real success on the client.
    expect(result.status).toBe("success");
    expect(result.values).toBeUndefined();
    expect(sendContactRelay).not.toHaveBeenCalled();
    // Honeypot short-circuits BEFORE any validation or IP resolution (no oracle).
    expect(checkContactRateLimit).not.toHaveBeenCalled();
    expect(clientIp).not.toHaveBeenCalled();
  });

  it("fakes success even when the other fields are ALSO invalid (bot fills everything)", async () => {
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ name: "", email: "garbage", message: "", website: "x" }),
    );
    expect(result.status).toBe("success");
    expect(result.fieldErrors).toBeUndefined();
    expect(sendContactRelay).not.toHaveBeenCalled();
  });
});

describe("submitContactForm — relay failure mapping (AC-16, edge 4)", () => {
  it("maps a {ok:false} relay to a generic error + preserved values; raw reason NEVER surfaced", async () => {
    sendContactRelay.mockResolvedValue({ ok: false, reason: "owner address unavailable" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ name: "Ana", message: "Hola" }),
    );
    expect(result.status).toBe("error");
    expect(result.values).toEqual({
      name: "Ana",
      email: "ana@example.com",
      subject: "",
      message: "Hola",
    });
    // The raw provider reason is nowhere in the returned state (AC-16)...
    expect(JSON.stringify(result)).not.toContain("owner address unavailable");
    // ...but IS logged server-side with context.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("owner address unavailable"),
    );
  });

  it("catches a THROWN relay exception → generic error, never throws to the client", async () => {
    sendContactRelay.mockRejectedValue(new Error("socket hang up"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({ name: "Ana", message: "Hola" }),
    );
    expect(result.status).toBe("error");
    expect(result.values).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("socket hang up");
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("socket hang up"));
  });

  it("maps a non-Error thrown value to a generic error too (defensive)", async () => {
    sendContactRelay.mockRejectedValue("string failure");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await submitContactForm(
      initialContactFormState,
      buildFormData({}),
    );
    expect(result.status).toBe("error");
  });
});

describe("submitContactForm — gate ORDERING invariants", () => {
  it("checks honeypot → validation → rate-limit → relay, short-circuiting at the first tripped gate", async () => {
    // A valid submission reaches the relay only after passing every prior gate.
    await submitContactForm(initialContactFormState, buildFormData({}));
    expect(clientIp).toHaveBeenCalledTimes(1);
    expect(checkContactRateLimit).toHaveBeenCalledTimes(1);
    expect(sendContactRelay).toHaveBeenCalledTimes(1);
  });

  it("never resolves the IP or relays when validation fails (cheap gate first)", async () => {
    await submitContactForm(
      initialContactFormState,
      buildFormData({ email: "bad" }),
    );
    expect(clientIp).not.toHaveBeenCalled();
    expect(checkContactRateLimit).not.toHaveBeenCalled();
    expect(sendContactRelay).not.toHaveBeenCalled();
  });
});
