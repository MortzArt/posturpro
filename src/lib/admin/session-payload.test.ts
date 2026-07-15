import { describe, expect, it } from "vitest";
import {
  decodePayload,
  encodePayload,
  fromBase64Url,
  isWithinMaxAge,
  splitCookie,
  toBase64Url,
} from "./session-payload";
import { ADMIN_SESSION_VERSION } from "./constants";

describe("base64url codec", () => {
  it("round-trips arbitrary strings", () => {
    for (const value of ["", "hello", '{"v":1,"iat":123}', "áéí😀"]) {
      expect(fromBase64Url(toBase64Url(value))).toBe(value);
    }
  });

  it("produces URL-safe output (no +, /, =)", () => {
    const encoded = toBase64Url("a".repeat(20));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("encodePayload / decodePayload (AC-4)", () => {
  it("encodes then decodes a payload at the current version", () => {
    const encoded = encodePayload(1_700_000_000);
    expect(decodePayload(encoded)).toEqual({
      v: ADMIN_SESSION_VERSION,
      iat: 1_700_000_000,
    });
  });

  it("rejects a malformed base64url payload", () => {
    expect(decodePayload("!!!not-base64!!!")).toBeNull();
  });

  it("rejects non-JSON payloads", () => {
    expect(decodePayload(toBase64Url("not json"))).toBeNull();
  });

  it("rejects a wrong-version payload (format bump → re-login)", () => {
    const encoded = toBase64Url(
      JSON.stringify({ v: ADMIN_SESSION_VERSION + 99, iat: 1 }),
    );
    expect(decodePayload(encoded)).toBeNull();
  });

  it("rejects a payload missing iat / with a non-number iat", () => {
    expect(decodePayload(toBase64Url(JSON.stringify({ v: 1 })))).toBeNull();
    expect(
      decodePayload(toBase64Url(JSON.stringify({ v: 1, iat: "x" }))),
    ).toBeNull();
  });

  it("rejects a non-finite iat — Infinity / NaN (m-2)", () => {
    // `JSON.stringify(Infinity)` → "null", so hand-build the JSON literal. A
    // JSON number of `1e400` parses to Infinity. If the `!Number.isFinite` guard
    // were dropped, an Infinity iat would sail through `isWithinMaxAge`.
    const infinityPayload = toBase64Url('{"v":1,"iat":1e400}');
    expect(JSON.parse('{"iat":1e400}').iat).toBe(Infinity); // sanity: literal → Infinity
    expect(decodePayload(infinityPayload)).toBeNull();

    const negInfinityPayload = toBase64Url('{"v":1,"iat":-1e400}');
    expect(decodePayload(negInfinityPayload)).toBeNull();
  });
});

describe("splitCookie (edge 1)", () => {
  it("splits a well-formed value", () => {
    expect(splitCookie("payload.signature")).toEqual({
      payloadPart: "payload",
      signaturePart: "signature",
    });
  });

  it("rejects missing/empty/extra parts", () => {
    expect(splitCookie(undefined)).toBeNull();
    expect(splitCookie(null)).toBeNull();
    expect(splitCookie("")).toBeNull();
    expect(splitCookie("nopart")).toBeNull();
    expect(splitCookie("a.b.c")).toBeNull();
    expect(splitCookie(".sig")).toBeNull();
    expect(splitCookie("payload.")).toBeNull();
  });
});

describe("isWithinMaxAge (AC-5, edge 2)", () => {
  const maxAge = 8 * 60 * 60;
  const now = 1_700_000_000;

  it("accepts a fresh payload", () => {
    expect(isWithinMaxAge({ v: 1, iat: now }, maxAge, now)).toBe(true);
  });

  it("accepts a payload exactly at the boundary", () => {
    expect(isWithinMaxAge({ v: 1, iat: now - maxAge }, maxAge, now)).toBe(true);
  });

  it("rejects an expired payload (edge 2)", () => {
    expect(isWithinMaxAge({ v: 1, iat: now - maxAge - 1 }, maxAge, now)).toBe(false);
  });

  it("rejects a future-dated payload (clock skew / forgery)", () => {
    expect(isWithinMaxAge({ v: 1, iat: now + 100 }, maxAge, now)).toBe(false);
  });
});
