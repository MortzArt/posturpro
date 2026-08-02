/**
 * Unit tests for the pure contact-form submission guards (T13 AC-13, AC-15,
 * edge 7). Trim-then-validate, length caps, email shape, honeypot.
 */
import { describe, expect, it } from "vitest";
import {
  validateContactSubmission,
  isContactHoneypotTripped,
} from "./submit-guard";
import {
  CONTACT_NAME_MAX,
  CONTACT_EMAIL_MAX,
  CONTACT_SUBJECT_MAX,
  CONTACT_MESSAGE_MAX,
} from "@/lib/config";

const okEmail = "buyer@example.com";

describe("validateContactSubmission", () => {
  it("accepts a valid submission and returns trimmed values", () => {
    const result = validateContactSubmission(
      "  Ana  ",
      `  ${okEmail}  `,
      "  Pregunta  ",
      "  Hola  ",
    );
    expect(result.ok).toBe(true);
    expect(result.fieldErrors).toEqual({});
    expect(result.values).toEqual({
      name: "Ana",
      email: okEmail,
      subject: "Pregunta",
      message: "Hola",
    });
  });

  it("treats a blank optional subject as valid (empty string)", () => {
    const result = validateContactSubmission("Ana", okEmail, "   ", "Hola");
    expect(result.ok).toBe(true);
    expect(result.values.subject).toBe("");
  });

  it("flags whitespace-only required fields as required (trim BEFORE length)", () => {
    const result = validateContactSubmission("   ", "   ", "", "   ");
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.name).toBe("nameRequired");
    expect(result.fieldErrors.email).toBe("emailRequired");
    expect(result.fieldErrors.message).toBe("messageRequired");
  });

  it("rejects a malformed email with emailInvalid (no send)", () => {
    const result = validateContactSubmission("Ana", "not-an-email", "", "Hola");
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.email).toBe("emailInvalid");
  });

  it("caps each field at its named max", () => {
    const result = validateContactSubmission(
      "n".repeat(CONTACT_NAME_MAX + 1),
      `${"e".repeat(CONTACT_EMAIL_MAX + 1)}@x.com`,
      "s".repeat(CONTACT_SUBJECT_MAX + 1),
      "m".repeat(CONTACT_MESSAGE_MAX + 1),
    );
    expect(result.fieldErrors.name).toBe("nameTooLong");
    expect(result.fieldErrors.email).toBe("emailTooLong");
    expect(result.fieldErrors.subject).toBe("subjectTooLong");
    expect(result.fieldErrors.message).toBe("messageTooLong");
  });

  it("accepts field values exactly at the cap", () => {
    const result = validateContactSubmission(
      "n".repeat(CONTACT_NAME_MAX),
      okEmail,
      "s".repeat(CONTACT_SUBJECT_MAX),
      "m".repeat(CONTACT_MESSAGE_MAX),
    );
    expect(result.ok).toBe(true);
  });

  it("caps a 100k hostile message before it can reach the template (edge 7)", () => {
    const hostile = "<script>".repeat(20000);
    const result = validateContactSubmission("Ana", okEmail, "", hostile);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.message).toBe("messageTooLong");
  });

  it("strips CR/LF + control chars from name and subject (subject-line hygiene)", () => {
    const result = validateContactSubmission(
      "Ana\r\nBcc: victim@example.com",
      okEmail,
      "Hola\nSubject-Injected",
      "Un mensaje válido",
    );
    expect(result.ok).toBe(true);
    // Control runs collapse to a single space; no residual newline survives.
    expect(result.values.name).toBe("Ana Bcc: victim@example.com");
    expect(result.values.subject).toBe("Hola Subject-Injected");
    expect(result.values.name).not.toContain("\n");
    expect(result.values.subject).not.toContain("\n");
  });

  it("treats a control-char-only name as required (stripped to empty)", () => {
    const result = validateContactSubmission("\r\n\t", okEmail, "", "Hola");
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.name).toBe("nameRequired");
  });
});

describe("isContactHoneypotTripped", () => {
  it("is false for an empty / whitespace honeypot (human)", () => {
    expect(isContactHoneypotTripped("")).toBe(false);
    expect(isContactHoneypotTripped("   ")).toBe(false);
  });

  it("is true for any filled honeypot (bot)", () => {
    expect(isContactHoneypotTripped("http://spam")).toBe(true);
  });
});
