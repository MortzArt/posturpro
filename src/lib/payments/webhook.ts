/**
 * PURE Mercado Pago webhook signature verification (T8 AC-8, edge 3, edge 12).
 * No HTTP, no DB — so the trust boundary is exhaustively unit-testable
 * (valid / missing / malformed / mismatched / replay-safe).
 *
 * THE SCHEME (MP docs, research §"x-signature Verification")
 * ---------------------------------------------------------
 *  - Header `x-signature: ts=<ts>,v1=<hex-hmac>` (comma-separated k=v parts).
 *  - Manifest (EXACT): `id:<data.id-lowercased>;request-id:<x-request-id>;ts:<ts>;`
 *    Each segment ends with `;`. If a segment's source value is absent, the
 *    segment is OMITTED (MP builds the manifest only from present values).
 *  - Digest: HMAC-SHA256(manifest, WEBHOOK_SECRET) → hex.
 *  - Compare to `v1` with `crypto.timingSafeEqual` (constant-time; NEVER `===`,
 *    which leaks timing).
 *  - `data.id` gotcha: lowercase it before building the manifest (docs). Numeric
 *    ids are unaffected; alphanumeric ids must be normalized.
 *  - `ts` is used AS-IS (raw string) in the manifest — never reformatted (ms vs s
 *    ambiguity). AFTER the HMAC verifies, `ts` is ALSO parsed and checked for
 *    freshness (M-4): a captured-but-stale signature is rejected so a valid
 *    `x-signature` cannot be replayed indefinitely at the signature layer (the DB
 *    dedupe is a second line, not the first).
 *
 * A missing / malformed / mismatched / STALE signature returns `{ ok: false }`
 * and the route responds 401 with NO DB read and NO state change.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * How far `ts` may deviate from now before a signature is rejected as a replay
 * (M-4). MP delivers within seconds; a 5-minute window absorbs clock skew and
 * legitimate retry latency while closing the indefinite-replay window. Documented
 * constant so the intent is explicit and tunable.
 */
export const WEBHOOK_REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/** Milliseconds per second — for the ts (seconds vs ms) normalization. */
const MS_PER_SECOND = 1000;
/** A ts in SECONDS is < this; a ts in MILLISECONDS is >= this (~ year 2001+). */
const MS_EPOCH_THRESHOLD = 1e12;

/** The inputs the pure verifier needs, extracted from the request by the route. */
export interface WebhookSignatureInput {
  /** Raw `x-signature` header value (`ts=...,v1=...`). */
  signatureHeader: string | null;
  /** Raw `x-request-id` header value. */
  requestId: string | null;
  /**
   * The `data.id` MP signed the manifest with — the QUERY-STRING `data.id` ONLY,
   * never the body id (C-1). Null when the query param is absent.
   */
  dataId: string | null;
  /** The HMAC key (`MERCADOPAGO_WEBHOOK_SECRET`). */
  secret: string;
  /**
   * Wall-clock "now" in ms, for the replay-window check (M-4). Injectable so the
   * verifier stays pure and deterministically testable. Defaults to `Date.now()`.
   */
  now?: number;
  /** Replay tolerance override (ms) for tests; defaults to {@link WEBHOOK_REPLAY_TOLERANCE_MS}. */
  toleranceMs?: number;
}

/** The parsed `ts`/`v1` parts of an `x-signature` header. */
interface ParsedSignature {
  ts: string;
  v1: string;
}

/**
 * Parse `ts=<ts>,v1=<hex>` into its parts. Returns `null` if either part is
 * absent/blank or the header is malformed — the caller treats that as a failed
 * verification (401), never a crash (edge 12).
 */
export function parseSignatureHeader(
  header: string | null,
): ParsedSignature | null {
  if (!header || header.trim() === "") {
    return null;
  }
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") {
      ts = value;
    } else if (key === "v1") {
      v1 = value;
    }
  }
  if (!ts || !v1) {
    return null;
  }
  return { ts, v1 };
}

/**
 * Build the exact manifest MP signs. `data.id` is lowercased (docs gotcha);
 * absent segments (no request-id, no data.id) are OMITTED. `ts` is verbatim.
 */
export function buildManifest(input: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string {
  let manifest = "";
  if (input.dataId) {
    manifest += `id:${input.dataId.toLowerCase()};`;
  }
  if (input.requestId) {
    manifest += `request-id:${input.requestId};`;
  }
  manifest += `ts:${input.ts};`;
  return manifest;
}

/**
 * Verify a webhook signature in constant time. Returns `{ ok: true }` only when
 * the header parses AND the recomputed HMAC matches `v1` byte-for-byte. Any
 * failure (missing header, blank secret, hex-length mismatch, digest mismatch)
 * returns `{ ok: false, reason }` — the route responds 401, no side effects.
 */
export function verifyWebhookSignature(
  input: WebhookSignatureInput,
): { ok: true } | { ok: false; reason: string } {
  if (!input.secret || input.secret.trim() === "") {
    // No secret configured — cannot verify anything. Fail closed.
    return { ok: false, reason: "missing_secret" };
  }
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) {
    return { ok: false, reason: "malformed_signature_header" };
  }

  const manifest = buildManifest({
    dataId: input.dataId,
    requestId: input.requestId,
    ts: parsed.ts,
  });
  const expectedHex = createHmac("sha256", input.secret)
    .update(manifest)
    .digest("hex");

  if (!timingSafeHexEqual(expectedHex, parsed.v1)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  // Replay window (M-4): the HMAC is authentic, but a captured-valid signature
  // must not verify forever. Reject a `ts` that is too far from now. This runs
  // AFTER the HMAC check so an attacker can't probe the window with unsigned ts.
  const now = input.now ?? Date.now();
  const toleranceMs = input.toleranceMs ?? WEBHOOK_REPLAY_TOLERANCE_MS;
  const tsMs = parseTsMs(parsed.ts);
  if (tsMs === null) {
    return { ok: false, reason: "unparseable_ts" };
  }
  if (Math.abs(now - tsMs) > toleranceMs) {
    return { ok: false, reason: "stale_timestamp" };
  }
  return { ok: true };
}

/**
 * Parse MP's `ts` into epoch milliseconds, resolving the seconds-vs-milliseconds
 * ambiguity (MP has historically sent both). A value below {@link MS_EPOCH_THRESHOLD}
 * is treated as SECONDS and scaled to ms; at/above it is already ms. Returns null
 * for a non-numeric / non-finite / non-positive ts.
 */
export function parseTsMs(ts: string): number | null {
  const raw = Number(ts);
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw < MS_EPOCH_THRESHOLD ? raw * MS_PER_SECOND : raw;
}

/**
 * Constant-time comparison of two hex strings. Returns false immediately if the
 * lengths differ (a length check is not a timing leak — the SECRET-derived
 * digest is fixed length, so an attacker learns nothing from it) and otherwise
 * uses `timingSafeEqual` over the decoded bytes. Guards against a `v1` that is
 * not valid hex (which would make Buffer lengths mismatch → false).
 */
function timingSafeHexEqual(expectedHex: string, providedHex: string): boolean {
  if (expectedHex.length !== providedHex.length) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");
  // A non-hex `providedHex` decodes to a shorter buffer → length mismatch → false.
  if (expected.length !== provided.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}
