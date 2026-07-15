/**
 * Non-secret admin constants (T10) — cookie name, route paths, session lifetime,
 * rate-limit config, and the data-driven nav definition. No magic values leak
 * into JSX / middleware / actions; everything references a named constant here.
 *
 * This module is NON-SECRET and Next-import-free, so it is safe to import from
 * the Edge middleware, server actions, server components, AND client components
 * alike (the nav definition is rendered by the client `AdminNav`). Secrets live
 * only in `src/lib/env.ts` (`getAdminEnv`), never here.
 */
import type { IconSvgElement } from "@hugeicons/react";
import {
  Settings01Icon,
  Package01Icon,
  ShoppingCart01Icon,
  FolderLibraryIcon,
  Message01Icon,
} from "@hugeicons/core-free-icons";

/**
 * Admin session cookie name. DELIBERATELY distinct from `NEXT_LOCALE` and any
 * cart cookie (AC-13). Not a `__Host-` prefix: that would force `Path=/`, but we
 * scope the cookie to `Path=/admin` so it is never sent to storefront routes
 * (keeps the admin session fully separate — AC-13).
 */
export const ADMIN_SESSION_COOKIE_NAME = "posturpro_admin_session" as const;

/** Path the admin session cookie is scoped to (never sent to the storefront). */
export const ADMIN_COOKIE_PATH = "/admin" as const;

/** Login route (the ONE admin path reachable while unauthenticated). */
export const ADMIN_LOGIN_PATH = "/admin/login" as const;

/** Admin root — redirects to the settings landing (no dead dashboard). */
export const ADMIN_ROOT_PATH = "/admin" as const;

/** Settings landing (the single working section in Phase 1). */
export const ADMIN_SETTINGS_PATH = "/admin/settings" as const;

/** Path prefix the middleware guard matches (all admin routes). */
export const ADMIN_PATH_PREFIX = "/admin" as const;

/**
 * Bounded session lifetime in seconds (AC-5). Default 8 hours: long enough for a
 * full working day, short enough that a stolen cookie expires. A cookie whose
 * issued-at is older than this is rejected server-side even if its signature is
 * valid (edge 2). Overridable via `ADMIN_SESSION_MAX_AGE_SECONDS` for tuning.
 */
const DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Resolve the session max-age (env override → default), clamped to > 0. */
export function getSessionMaxAgeSeconds(
  source: Record<string, string | undefined> = process.env,
): number {
  const raw = source.ADMIN_SESSION_MAX_AGE_SECONDS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  return parsed;
}

/** Login rate-limit window (ms). Failed attempts are counted per client IP. */
export const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Max login attempts per IP per window before "demasiados intentos" (AC-15). */
export const ADMIN_LOGIN_MAX_ATTEMPTS = 10;

/** Hard ceiling on distinct rate-limit keys (cardinality-DoS bound). */
export const ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS = 10_000;

/** Session payload format version — lets a future format change invalidate old cookies. */
export const ADMIN_SESSION_VERSION = 1 as const;

/** The admin sections; drives nav + active-state resolution. */
export type AdminSectionId =
  | "settings"
  | "products"
  | "taxonomy"
  | "qa"
  | "orders";

/** Route for the taxonomy manager (brands/categories/styles/tags, tabbed). */
export const ADMIN_TAXONOMY_PATH = "/admin/taxonomy" as const;

/** Route for the Q&A inbox. */
export const ADMIN_QA_PATH = "/admin/qa" as const;

/** Route for the product list (T11 landing surface). */
export const ADMIN_PRODUCTS_PATH = "/admin/products" as const;

/** A single admin nav entry (data-driven so T11/T12 flip `status` without JSX edits). */
export interface AdminNavItem {
  id: AdminSectionId;
  /** es-MX label authored inline (NOT in the next-intl catalogs — AC-2 decision). */
  label: string;
  /** Target route. Ignored for `soon` items (rendered non-interactive). */
  href: string;
  /** hugeicons glyph. */
  icon: IconSvgElement;
  /** `live` → link + active state; `soon` → disabled + "próximamente" badge. */
  status: "live" | "soon";
  /**
   * Optional group label rendered ABOVE the first item carrying it (T11
   * "CATÁLOGO" grouping). Consecutive items sharing a group render one header.
   */
  group?: string;
}

/** The "Catálogo" nav group label (T11 §3.2). */
export const ADMIN_NAV_GROUP_CATALOG = "Catálogo" as const;

/**
 * The admin nav definition (AC-11). Settings is live; Products/Orders are
 * `soon` placeholders so T11/T12 slot in by flipping `status` to `"live"` and
 * setting `href` — no shell/nav rewrite.
 */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    id: "settings",
    label: "Configuración",
    href: ADMIN_SETTINGS_PATH,
    icon: Settings01Icon,
    status: "live",
  },
  {
    id: "products",
    label: "Productos",
    href: ADMIN_PRODUCTS_PATH,
    icon: Package01Icon,
    status: "live",
    group: ADMIN_NAV_GROUP_CATALOG,
  },
  {
    id: "taxonomy",
    label: "Taxonomía",
    href: ADMIN_TAXONOMY_PATH,
    icon: FolderLibraryIcon,
    status: "live",
    group: ADMIN_NAV_GROUP_CATALOG,
  },
  {
    id: "qa",
    label: "Preguntas",
    href: ADMIN_QA_PATH,
    icon: Message01Icon,
    status: "live",
    group: ADMIN_NAV_GROUP_CATALOG,
  },
  {
    id: "orders",
    label: "Pedidos",
    href: "/admin/orders",
    icon: ShoppingCart01Icon,
    status: "soon",
  },
] as const;
