"use server";

/**
 * Payment server action(s) (T8 AC-4, AC-5, AC-16, edge 11). Invoked by the
 * confirmation page's <PaymentPanel> pay/retry CTA.
 *
 * `createPaymentPreference(token, locale)` turns a pending order into an MP
 * Checkout Pro preference and returns its `init_point` for the client to redirect
 * to — or a typed error state (`unavailable` / `error`) the panel renders as a
 * friendly banner (never a stack trace, never a raw MP error). Retrying builds a
 * FRESH preference for the SAME order (no re-create_order, no stock re-decrement,
 * token unchanged, AC-16).
 *
 * The absolute origin for MP's back_urls / notification_url is derived from the
 * request headers (works on localhost / preview / prod), with an optional
 * `NEXT_PUBLIC_SITE_URL` override for opaque-proxy environments.
 */
import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { createPreferenceForOrder } from "@/lib/payments/preference";
import { checkPreferenceRateLimit } from "@/lib/payments/preference-rate-limit";
import { clientIp } from "@/lib/request/client-ip";

/** The discriminated result the <PaymentPanel> consumes. */
export type PayActionResult =
  | { status: "redirect"; initPoint: string }
  | { status: "unavailable" } // MP env missing / MP 5xx / timeout (edge 11)
  | { status: "not-payable" } // not a payable pending order (already paid / gone)
  | { status: "rate-limited" } // too many attempts from this IP (SEC-H-1)
  | { status: "error" }; // generic failure → retry

/**
 * Create (or re-create) a Checkout Pro preference for the pending order addressed
 * by `token`, using `locale` for the back_urls. Returns the redirect target or a
 * typed error. Never throws to the client.
 */
export async function createPaymentPreference(
  token: string,
  locale: string,
): Promise<PayActionResult> {
  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;

  // Abuse control (SEC-H-1): throttle per IP BEFORE any DB read or MP API call.
  // This unauthenticated action makes a live, rate-quota'd MP `Preference.create`
  // call per invocation; without this a single valid token could amplify into
  // unbounded MP/DB load. Best-effort in-memory; runs before all side effects.
  const ip = await clientIp();
  if (!checkPreferenceRateLimit(ip)) {
    return { status: "rate-limited" };
  }

  const origin = await resolveOrigin();
  if (!origin) {
    console.error("[payments] pay action: could not resolve request origin");
    return { status: "error" };
  }

  const result = await createPreferenceForOrder(token, activeLocale, origin);
  switch (result.status) {
    case "created":
      return { status: "redirect", initPoint: result.initPoint };
    case "unavailable":
      return { status: "unavailable" };
    case "not-payable":
      return { status: "not-payable" };
    case "error":
      return { status: "error" };
  }
}

/**
 * Resolve the absolute request origin (scheme + host) for MP callback URLs.
 * Priority: explicit `NEXT_PUBLIC_SITE_URL` (opaque proxies) → forwarded
 * proto+host → `host` header. Returns null if nothing is resolvable.
 */
async function resolveOrigin(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    return null;
  }
  // Trust x-forwarded-proto when present (behind a proxy); otherwise default to
  // https EXCEPT for local development hosts, which are plain http. `isLocalHost`
  // covers localhost, IPv4 loopback, IPv6 loopback (`[::1]`), and `.local` mDNS.
  const proto = headerList.get("x-forwarded-proto") ?? (isLocalHost(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Whether a host header points at a local development machine (m-4). */
function isLocalHost(host: string): boolean {
  const bare = host.toLowerCase().split(":")[0].replace(/^\[|\]$/g, "");
  return (
    bare === "localhost" ||
    bare === "::1" ||
    bare.startsWith("127.") ||
    bare.endsWith(".local")
  );
}
