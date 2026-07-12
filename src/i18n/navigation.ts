import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

/**
 * Locale-aware navigation primitives bound to the routing config (T2 AC-6).
 *
 * These wrappers understand `localePrefix: "as-needed"`, so:
 * - `<Link href="/sillas">` renders `/sillas` in Spanish and `/en/sillas` in
 *   English — callers pass locale-agnostic hrefs; the prefix is added
 *   automatically.
 * - `useRouter().replace(pathname, { locale })` rewrites only the locale
 *   segment while preserving the current path, and lets next-intl persist the
 *   choice to the `NEXT_LOCALE` cookie. `usePathname()` returns the path
 *   WITHOUT the locale prefix, so it round-trips cleanly through `replace`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
