/**
 * Reusable best-effort in-memory sliding-window rate limiter (extracted T8
 * Security stage from the proven checkout limiter so multiple unauthenticated
 * write/amplification paths share ONE audited implementation instead of copies).
 *
 * MEMORY SAFETY (cardinality-DoS bound): (a) timestamps older than the window are
 * pruned before every count; (b) a key is deleted when it goes empty; (c) a hard
 * ceiling evicts idle/expired then oldest keys, so the map size is bounded
 * regardless of IP rotation.
 *
 * BEST-EFFORT: per-instance memory (a horizontally-scaled deploy has one map per
 * instance) and IP-keyed (shared NATs bucket together; a spoofable XFF weakens it
 * without a trusted edge). DB atomicity / third-party idempotency remain the hard
 * backstops; this only trims the abuse rate.
 *
 * No `import "server-only"`: pure in-memory logic with no secret, imported only by
 * `"use server"` actions and unit-tested. The `server-only` guard exists to keep
 * secrets out of the client bundle — there is nothing secret here to protect.
 */

/** A rate limiter instance over one in-memory attempt log. */
export interface SlidingWindowLimiter {
  /** Record an attempt for `key`; returns true if within the allowed rate. */
  check(key: string, now?: number): boolean;
  /** Test-only: clear all state between cases. */
  reset(): void;
  /** Test-only: current distinct-key count (asserts the ceiling holds). */
  keyCount(): number;
}

/** Configuration for a {@link SlidingWindowLimiter}. */
export interface SlidingWindowConfig {
  /** Window length in ms. */
  windowMs: number;
  /** Max attempts per key within the window. */
  maxPerWindow: number;
  /** Hard ceiling on distinct keys (cardinality-DoS bound). */
  maxKeys: number;
}

/** Build a sliding-window limiter with its own private attempt log. */
export function createSlidingWindowLimiter(
  config: SlidingWindowConfig,
): SlidingWindowLimiter {
  /** timestamps (ms epoch) of recent attempts, keyed. */
  const attemptLog = new Map<string, number[]>();

  /**
   * Drop keys whose every timestamp is older than the window, then — if still
   * over the ceiling — the oldest-inserted keys (Map preserves insertion order)
   * until back under `maxKeys`. Called only when the ceiling is breached, so the
   * O(n) sweep is rare.
   */
  function evictToCeiling(windowStart: number): void {
    for (const [key, timestamps] of attemptLog) {
      if (timestamps.every((timestamp) => timestamp <= windowStart)) {
        attemptLog.delete(key);
      }
    }
    while (attemptLog.size >= config.maxKeys) {
      const oldest = attemptLog.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      attemptLog.delete(oldest);
    }
  }

  return {
    check(key: string, now: number = Date.now()): boolean {
      const windowStart = now - config.windowMs;
      const recent = (attemptLog.get(key) ?? []).filter(
        (timestamp) => timestamp > windowStart,
      );

      if (recent.length >= config.maxPerWindow) {
        attemptLog.set(key, recent);
        return false;
      }

      recent.push(now);
      if (!attemptLog.has(key) && attemptLog.size >= config.maxKeys) {
        evictToCeiling(windowStart);
      }
      attemptLog.set(key, recent);
      return true;
    },
    reset(): void {
      attemptLog.clear();
    },
    keyCount(): number {
      return attemptLog.size;
    },
  };
}
