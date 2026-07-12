/**
 * WhatsApp deep-link builder tests (T2 AC-8, edge case 7).
 */
import { describe, expect, it } from "vitest";
import {
  buildWhatsAppUrl,
  isWhatsAppConfigured,
  normalizeWhatsAppPhone,
} from "./whatsapp";

describe("normalizeWhatsAppPhone", () => {
  it("strips +, spaces, and dashes to bare digits", () => {
    expect(normalizeWhatsAppPhone("+52 155-1234-5678")).toBe("5215512345678");
  });

  it("returns empty string for empty or punctuation-only input", () => {
    expect(normalizeWhatsAppPhone("")).toBe("");
    expect(normalizeWhatsAppPhone("+ - ()")).toBe("");
  });
});

describe("isWhatsAppConfigured", () => {
  it("is false for empty / punctuation-only values (edge case 7)", () => {
    expect(isWhatsAppConfigured("")).toBe(false);
    expect(isWhatsAppConfigured("   ")).toBe(false);
    expect(isWhatsAppConfigured("++--")).toBe(false);
  });

  it("is true when digits are present", () => {
    expect(isWhatsAppConfigured("5215512345678")).toBe(true);
    expect(isWhatsAppConfigured("+52 155 1234 5678")).toBe(true);
  });
});

describe("buildWhatsAppUrl", () => {
  it("returns null when the phone is not configured (edge case 7)", () => {
    expect(buildWhatsAppUrl("", "Hola")).toBeNull();
    expect(buildWhatsAppUrl("()", "Hola")).toBeNull();
  });

  it("builds a wa.me link with URL-encoded message", () => {
    const url = buildWhatsAppUrl("5215512345678", "Hola, ¿precio?");
    expect(url).toBe(
      "https://wa.me/5215512345678?text=Hola%2C%20%C2%BFprecio%3F",
    );
  });

  it("normalizes the phone before inserting it", () => {
    const url = buildWhatsAppUrl("+52 155-1234-5678", "Hi");
    expect(url).toBe("https://wa.me/5215512345678?text=Hi");
  });

  it("omits the query when the message is empty", () => {
    expect(buildWhatsAppUrl("5215512345678", "")).toBe(
      "https://wa.me/5215512345678",
    );
  });
});
