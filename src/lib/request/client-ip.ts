/**
 * Best-effort client-IP resolution for per-IP rate limiters (extracted T8
 * Security stage; the Q&A and checkout actions carried identical copies).
 *
 * TRUST MODEL: the leftmost `x-forwarded-for` hops are client-forgeable, so
 * prefer, in order: Vercel's trusted single-value header, the RIGHTMOST XFF hop
 * (the one our own edge wrote), `x-real-ip`, then a shared "unknown" bucket
 * (conservative — no-IP callers share one limit, never bypass it).
 *
 * RESIDUAL RISK: without a trusted edge that overwrites/appends XFF, the rightmost
 * hop is whatever the client sent — the limiter is then only best-effort (as the
 * ticket accepts) and each limiter's hard key-cap is the memory backstop.
 */
import { headers } from "next/headers";

/** Resolve the best-effort client IP, or the shared "unknown" bucket. */
export async function clientIp(): Promise<string> {
  const headerList = await headers();

  const vercelForwarded = headerList.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwarded) {
    return vercelForwarded;
  }

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const rightmost = hops.at(-1);
    if (rightmost) {
      return rightmost;
    }
  }

  return headerList.get("x-real-ip")?.trim() ?? "unknown";
}
