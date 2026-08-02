/**
 * Unit tests for the pure quote-form submission guards (T16 AC-4, AC-7, edges 1
 * & 5). Trim-then-validate, length caps, email shape, team-size enum membership,
 * control-char strip, honeypot.
 */
import { describe, expect, it } from "vitest";
import {
  validateQuoteSubmission,
  isQuoteHoneypotTripped,
} from "./submit-guard";
import {
  QUOTE_COMPANY_MAX,
  QUOTE_NAME_MAX,
  QUOTE_EMAIL_MAX,
  QUOTE_PHONE_MAX,
  QUOTE_MESSAGE_MAX,
  QUOTE_TEAM_SIZES,
} from "@/lib/config";

const okEmail = "manager@acme.com";
const okTeamSize = "11-50";
const okNeeds = "Necesitamos 20 sillas ergonómicas.";

/** Validate a submission with sensible defaults, overriding only what's given. */
function validate(
  overrides: Partial<{
    company: string;
    name: string;
    email: string;
    phone: string;
    teamSize: string;
    needs: string;
  }> = {},
) {
  return validateQuoteSubmission(
    overrides.company ?? "Acme SA",
    overrides.name ?? "Ana López",
    overrides.email ?? okEmail,
    overrides.phone ?? "",
    overrides.teamSize ?? okTeamSize,
    overrides.needs ?? okNeeds,
  );
}

describe("validateQuoteSubmission", () => {
  it("accepts a valid submission and returns trimmed values", () => {
    const result = validateQuoteSubmission(
      "  Acme SA  ",
      "  Ana  ",
      `  ${okEmail}  `,
      "  5512345678  ",
      "11-50",
      "  Hola  ",
    );
    expect(result.ok).toBe(true);
    expect(result.fieldErrors).toEqual({});
    expect(result.values).toEqual({
      company: "Acme SA",
      name: "Ana",
      email: okEmail,
      phone: "5512345678",
      teamSize: "11-50",
      needs: "Hola",
    });
  });

  it("treats a blank optional phone as valid (empty string)", () => {
    const result = validate({ phone: "   " });
    expect(result.ok).toBe(true);
    expect(result.values?.phone).toBe("");
  });

  it("flags whitespace-only required fields as required (trim BEFORE length)", () => {
    const result = validateQuoteSubmission("   ", "   ", "   ", "", "", "   ");
    expect(result.ok).toBe(false);
    expect(result.values).toBeNull();
    expect(result.fieldErrors.company).toBe("companyRequired");
    expect(result.fieldErrors.name).toBe("nameRequired");
    expect(result.fieldErrors.email).toBe("emailRequired");
    expect(result.fieldErrors.teamSize).toBe("teamSizeRequired");
    expect(result.fieldErrors.needs).toBe("needsRequired");
  });

  it("rejects a malformed email with emailInvalid (no send)", () => {
    const result = validate({ email: "not-an-email" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.email).toBe("emailInvalid");
  });

  it("caps each field at its named max", () => {
    const result = validateQuoteSubmission(
      "c".repeat(QUOTE_COMPANY_MAX + 1),
      "n".repeat(QUOTE_NAME_MAX + 1),
      `${"e".repeat(QUOTE_EMAIL_MAX + 1)}@x.com`,
      "p".repeat(QUOTE_PHONE_MAX + 1),
      okTeamSize,
      "m".repeat(QUOTE_MESSAGE_MAX + 1),
    );
    expect(result.fieldErrors.company).toBe("companyTooLong");
    expect(result.fieldErrors.name).toBe("nameTooLong");
    expect(result.fieldErrors.email).toBe("emailTooLong");
    expect(result.fieldErrors.phone).toBe("phoneTooLong");
    expect(result.fieldErrors.needs).toBe("needsTooLong");
  });

  it("accepts field values exactly at the cap", () => {
    const result = validateQuoteSubmission(
      "c".repeat(QUOTE_COMPANY_MAX),
      "n".repeat(QUOTE_NAME_MAX),
      okEmail,
      "5".repeat(QUOTE_PHONE_MAX),
      okTeamSize,
      "m".repeat(QUOTE_MESSAGE_MAX),
    );
    expect(result.ok).toBe(true);
  });

  it("caps a 100k hostile needs body before it can reach the template (edge 5)", () => {
    const hostile = "<script>".repeat(20000);
    const result = validate({ needs: hostile });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.needs).toBe("needsTooLong");
  });

  it("strips CR/LF + control chars from company and name (subject-line hygiene)", () => {
    const result = validateQuoteSubmission(
      "Acme\r\nBcc: victim@example.com",
      "Ana\nInjected",
      okEmail,
      "",
      okTeamSize,
      "Un mensaje válido",
    );
    expect(result.ok).toBe(true);
    // Control runs collapse to a single space; no residual newline survives.
    expect(result.values?.company).toBe("Acme Bcc: victim@example.com");
    expect(result.values?.name).toBe("Ana Injected");
    expect(result.values?.company).not.toContain("\n");
    expect(result.values?.name).not.toContain("\n");
  });

  it("treats a control-char-only company as required (stripped to empty)", () => {
    const result = validate({ company: "\r\n\t" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.company).toBe("companyRequired");
  });

  describe("team-size enum (edge 1)", () => {
    it("accepts every allowed team-size value", () => {
      for (const size of QUOTE_TEAM_SIZES) {
        const result = validate({ teamSize: size });
        expect(result.ok, `size ${size}`).toBe(true);
        expect(result.values?.teamSize).toBe(size);
      }
    });

    it("rejects an empty team size as teamSizeRequired", () => {
      const result = validate({ teamSize: "" });
      expect(result.ok).toBe(false);
      expect(result.fieldErrors.teamSize).toBe("teamSizeRequired");
    });

    it("rejects a tampered/crafted enum value as teamSizeInvalid (never trusts it)", () => {
      const result = validate({ teamSize: "9999-billion" });
      expect(result.ok).toBe(false);
      expect(result.values).toBeNull();
      expect(result.fieldErrors.teamSize).toBe("teamSizeInvalid");
    });

    it("rejects a near-miss value not in the exact enum set", () => {
      const result = validate({ teamSize: "1-9" });
      expect(result.ok).toBe(false);
      expect(result.fieldErrors.teamSize).toBe("teamSizeInvalid");
    });
  });

  it("returns null values on any failure (no partial trust)", () => {
    const result = validate({ email: "bad" });
    expect(result.ok).toBe(false);
    expect(result.values).toBeNull();
  });
});

describe("isQuoteHoneypotTripped", () => {
  it("is false for an empty / whitespace honeypot (human)", () => {
    expect(isQuoteHoneypotTripped("")).toBe(false);
    expect(isQuoteHoneypotTripped("   ")).toBe(false);
  });

  it("is true for any filled honeypot (bot)", () => {
    expect(isQuoteHoneypotTripped("http://spam")).toBe(true);
  });
});
