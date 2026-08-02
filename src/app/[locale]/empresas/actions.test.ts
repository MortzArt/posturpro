/**
 * Action-level tests for `submitQuoteForm` (T16 AC-5..AC-7, edges 1–4).
 *
 * Proves the thin branch-mapping in `actions.ts` composes the guard / rate-limit
 * / relay in the right ORDER and maps every outcome to the correct serializable
 * `QuoteFormState`. The guard, rate limiter, and `sendQuoteRelay` dispatch are
 * each unit-tested SEPARATELY; here we prove the WIRING.
 *
 * The dependency edges are mocked so the test is pure and env-independent:
 *   - `server-only`  → no-op (the action imports the relay, which is
 *     `server-only`; mirrors `dispatch.test.ts` / contact `actions.test.ts`).
 *   - `sendQuoteRelay` → a `vi.fn()` driven per-case (success / {ok:false} /
 *     throw) so we never touch the network, env, or DB.
 *   - `clientIp` → a fixed IP so the rate-limit key is deterministic.
 *   - `checkQuoteRateLimit` → a `vi.fn()` flipped to prove the rate-limit gate.
 *
 * `submit-guard` is left REAL (it is pure) so the ordering invariants
 * (honeypot-before-validate, validate-before-ratelimit, trim/cap, enum check)
 * are exercised end-to-end through the action, not re-mocked away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendQuoteRelay = vi.fn();
vi.mock("@/lib/email/dispatch", () => ({
  sendQuoteRelay: (...args: unknown[]) => sendQuoteRelay(...args),
}));

const clientIp = vi.fn();
vi.mock("@/lib/request/client-ip", () => ({
  clientIp: () => clientIp(),
}));

const checkQuoteRateLimit = vi.fn();
vi.mock("@/lib/quote/rate-limit", () => ({
  checkQuoteRateLimit: (...args: unknown[]) => checkQuoteRateLimit(...args),
}));

import { submitQuoteForm } from "./actions";
import { initialQuoteFormState } from "./quote-form-state";

/** Build a `FormData` for the quote fields (honeypot `company_url` defaults empty). */
function buildFormData(fields: {
  company?: string;
  name?: string;
  email?: string;
  phone?: string;
  teamSize?: string;
  needs?: string;
  company_url?: string;
} = {}): FormData {
  const fd = new FormData();
  fd.set("company", fields.company ?? "Acme SA");
  fd.set("name", fields.name ?? "Ana");
  fd.set("email", fields.email ?? "ana@acme.com");
  fd.set("phone", fields.phone ?? "");
  fd.set("teamSize", fields.teamSize ?? "11-50");
  fd.set("needs", fields.needs ?? "Necesitamos 20 sillas.");
  fd.set("company_url", fields.company_url ?? "");
  return fd;
}

beforeEach(() => {
  sendQuoteRelay.mockReset().mockResolvedValue({ ok: true, sent: true });
  clientIp.mockReset().mockResolvedValue("203.0.113.5");
  checkQuoteRateLimit.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitQuoteForm — happy path (AC-5, AC-6)", () => {
  it("relays a valid submission and returns success WITHOUT preserved values", async () => {
    const result = await submitQuoteForm(initialQuoteFormState, buildFormData());
    expect(result.status).toBe("success");
    expect(result.values).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();
    expect(sendQuoteRelay).toHaveBeenCalledTimes(1);
  });

  it("increments submissionId per call (useActionState contract)", async () => {
    const first = await submitQuoteForm(
      { status: "idle", submissionId: 4 },
      buildFormData(),
    );
    expect(first.submissionId).toBe(5);
    const second = await submitQuoteForm(first, buildFormData());
    expect(second.submissionId).toBe(6);
  });

  it("passes trimmed + enum-validated fields to the relay", async () => {
    await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({
        company: "  Acme SA  ",
        name: "  Ana  ",
        email: "  ana@acme.com  ",
        phone: "  5512  ",
        teamSize: "51-200",
        needs: "  Hola  ",
      }),
    );
    expect(sendQuoteRelay).toHaveBeenCalledWith({
      company: "Acme SA",
      fromName: "Ana",
      fromEmail: "ana@acme.com",
      phone: "5512",
      teamSize: "51-200",
      needs: "Hola",
    });
  });

  it("passes the needs body VERBATIM (only trimmed) — the template escapes it", async () => {
    const hostile = "<script>alert(1)</script> & <b>bold</b>";
    await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ needs: `  ${hostile}  ` }),
    );
    expect(sendQuoteRelay).toHaveBeenCalledWith(
      expect.objectContaining({ needs: hostile }),
    );
  });
});

describe("submitQuoteForm — validation (AC-7, edges 1 & 5)", () => {
  it("returns invalid with fieldErrors + PRESERVED raw values and sends NOTHING", async () => {
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ company: "  ", email: "not-an-email", needs: "  " }),
    );
    expect(result.status).toBe("invalid");
    expect(result.fieldErrors).toMatchObject({
      company: "companyRequired",
      email: "emailInvalid",
      needs: "needsRequired",
    });
    expect(result.values).toEqual({
      company: "  ",
      name: "Ana",
      email: "not-an-email",
      phone: "",
      teamSize: "11-50",
      needs: "  ",
    });
    expect(sendQuoteRelay).not.toHaveBeenCalled();
    // Validation precedes the rate-limit gate — no IP resolution on invalid input.
    expect(checkQuoteRateLimit).not.toHaveBeenCalled();
  });

  it("rejects a tampered team-size enum as teamSizeInvalid before any send (edge 1)", async () => {
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ teamSize: "9999-billion" }),
    );
    expect(result.status).toBe("invalid");
    expect(result.fieldErrors?.teamSize).toBe("teamSizeInvalid");
    expect(sendQuoteRelay).not.toHaveBeenCalled();
  });

  it("rejects an empty team-size as teamSizeRequired", async () => {
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ teamSize: "" }),
    );
    expect(result.status).toBe("invalid");
    expect(result.fieldErrors?.teamSize).toBe("teamSizeRequired");
  });

  it("caps a 100k hostile needs body as needsTooLong before any send (edge 5)", async () => {
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ needs: "x".repeat(100_000) }),
    );
    expect(result.status).toBe("invalid");
    expect(result.fieldErrors?.needs).toBe("needsTooLong");
    expect(sendQuoteRelay).not.toHaveBeenCalled();
  });
});

describe("submitQuoteForm — rate limit (AC-7, edge 4)", () => {
  it("returns rate-limited with preserved values and sends NOTHING when the limiter denies", async () => {
    checkQuoteRateLimit.mockReturnValue(false);
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ company: "Acme", needs: "Hola" }),
    );
    expect(result.status).toBe("rate-limited");
    expect(result.values).toMatchObject({ company: "Acme", needs: "Hola" });
    expect(sendQuoteRelay).not.toHaveBeenCalled();
  });

  it("keys the limiter by the resolved client IP", async () => {
    clientIp.mockResolvedValue("198.51.100.9");
    await submitQuoteForm(initialQuoteFormState, buildFormData());
    expect(checkQuoteRateLimit).toHaveBeenCalledWith("198.51.100.9");
  });
});

describe("submitQuoteForm — honeypot (AC-7, edge 2)", () => {
  it("returns a FAKE success with no send and no preserved values when the honeypot is filled", async () => {
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ company_url: "http://spam.example" }),
    );
    expect(result.status).toBe("success");
    expect(result.values).toBeUndefined();
    expect(sendQuoteRelay).not.toHaveBeenCalled();
    // Honeypot short-circuits BEFORE any validation or IP resolution (no oracle).
    expect(checkQuoteRateLimit).not.toHaveBeenCalled();
    expect(clientIp).not.toHaveBeenCalled();
  });

  it("fakes success even when the other fields are ALSO invalid (bot fills everything)", async () => {
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ company: "", email: "garbage", teamSize: "x", needs: "", company_url: "x" }),
    );
    expect(result.status).toBe("success");
    expect(result.fieldErrors).toBeUndefined();
    expect(sendQuoteRelay).not.toHaveBeenCalled();
  });
});

describe("submitQuoteForm — relay failure mapping (AC-6, edge 3)", () => {
  it("maps a {ok:false} relay to a generic error + preserved values; raw reason NEVER surfaced", async () => {
    sendQuoteRelay.mockResolvedValue({ ok: false, reason: "owner address unavailable" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ company: "Acme", needs: "Hola" }),
    );
    expect(result.status).toBe("error");
    expect(result.values).toMatchObject({ company: "Acme", needs: "Hola" });
    // The raw provider reason is nowhere in the returned state (AC-6)...
    expect(JSON.stringify(result)).not.toContain("owner address unavailable");
    // ...but IS logged server-side with context.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("owner address unavailable"),
    );
  });

  it("catches a THROWN relay exception → generic error, never throws to the client", async () => {
    sendQuoteRelay.mockRejectedValue(new Error("socket hang up"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await submitQuoteForm(
      initialQuoteFormState,
      buildFormData({ company: "Acme", needs: "Hola" }),
    );
    expect(result.status).toBe("error");
    expect(result.values).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("socket hang up");
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("socket hang up"));
  });

  it("maps a non-Error thrown value to a generic error too (defensive)", async () => {
    sendQuoteRelay.mockRejectedValue("string failure");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await submitQuoteForm(initialQuoteFormState, buildFormData());
    expect(result.status).toBe("error");
  });
});

describe("submitQuoteForm — gate ORDERING invariants", () => {
  it("checks honeypot → validation → rate-limit → relay, short-circuiting at the first tripped gate", async () => {
    await submitQuoteForm(initialQuoteFormState, buildFormData());
    expect(clientIp).toHaveBeenCalledTimes(1);
    expect(checkQuoteRateLimit).toHaveBeenCalledTimes(1);
    expect(sendQuoteRelay).toHaveBeenCalledTimes(1);
  });

  it("never resolves the IP or relays when validation fails (cheap gate first)", async () => {
    await submitQuoteForm(initialQuoteFormState, buildFormData({ email: "bad" }));
    expect(clientIp).not.toHaveBeenCalled();
    expect(checkQuoteRateLimit).not.toHaveBeenCalled();
    expect(sendQuoteRelay).not.toHaveBeenCalled();
  });
});
