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

/** The discriminated result the <PaymentPanel> consumes. */
export type PayActionResult =
  | { status: "redirect"; initPoint: string }
  | { status: "unavailable" } // MP env missing / MP 5xx / timeout (edge 11)
  | { status: "not-payable" } // not a payable pending order (already paid / gone)
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
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
