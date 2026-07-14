/**
 * Centralized, non-secret configuration constants for PosturPro.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every placeholder / tunable value that is NOT a secret lives here so that
 * swapping real values later is a single, discoverable edit. Secrets (Supabase
 * keys) live in `.env.local` and are read exclusively through `src/lib/env.ts`.
 *
 * MONEY CONVENTION
 * ----------------
 * All monetary values across PosturPro are stored and computed as INTEGER
 * CENTS (MXN centavos). Never store or compute money as a float. The ONLY
 * place cents are converted to a human-readable string is `formatMXN()` in
 * `src/lib/money.ts`. Constants below therefore end in `_CENTS`.
 *
 * HOW TO SWAP REAL VALUES
 * -----------------------
 * - Shipping amounts: these constants are only the SEED DEFAULTS written into
 *   the `store_settings` table by `scripts/seed.ts`. At runtime the app reads
 *   the (admin-editable, see T10) `store_settings` row — NOT these constants.
 *   To change the live store values, edit the `store_settings` row (or the
 *   admin UI in T10), not this file. Edit here only to change the seed default.
 * - Currency: PosturPro is single-currency (MXN) in Phase 1. Changing it
 *   requires more than this constant (tax logic, formatting locale) — treat as
 *   a project-wide change, not a config swap.
 * - Storage bucket: `SUPABASE_STORAGE_BUCKET` must match the bucket created in
 *   the Supabase dashboard. If you rename the bucket, update it here AND in
 *   `next.config.ts` is unaffected (host is the same), but seeded image URLs
 *   embed the bucket name, so re-run the seed after changing it.
 * - Seed image base URL: `SEED_IMAGE_BASE_URL` is where placeholder product
 *   photos are fetched from for seed data. To use real product photography,
 *   upload images to the Supabase Storage bucket and update the per-product
 *   image paths in `scripts/seed-data/products.ts`, then re-run the seed.
 */

/** ISO 4217 currency code. PosturPro is single-currency in Phase 1. */
export const CURRENCY = "MXN" as const;

/** BCP-47 locale used by `Intl.NumberFormat` for MXN formatting. */
export const CURRENCY_LOCALE = "es-MX" as const;

/**
 * Canonical default UI locale (BCP-47 with region), aligned with
 * `CURRENCY_LOCALE`. This is the SAME tag next-intl resolves and the SAME tag a
 * future Supabase `translations` content lookup (T3+) must use — do NOT
 * introduce a second locale source of truth. The store serves this locale at
 * `/` with no URL prefix; English is the explicit opt-in under `/en` (see
 * `src/i18n/routing.ts`). If you localize to another market, change it here AND
 * in `src/i18n/routing.ts` (they must stay in sync).
 */
export const DEFAULT_LOCALE = "es-MX" as const;

/**
 * WhatsApp contact number in E.164 format, DIGITS ONLY, no `+`, spaces, or
 * dashes (e.g. Mexico City mobile → `5215512345678`). This is NON-SECRET
 * config, not an env var — safe to ship in the client bundle.
 *
 * HOW TO SWAP THE REAL VALUE
 * --------------------------
 * Replace the empty string with the store's real WhatsApp number. While it is
 * empty (`""`), the floating WhatsApp button is NOT rendered at all — this is
 * the intentional guard that prevents a broken `wa.me/` link with no number
 * (T2 edge case 7). Do not prefix with `+`; `wa.me` wants bare digits.
 */
export const WHATSAPP_PHONE_E164 = "" as const;

/**
 * Prefilled Spanish message inserted into the `wa.me` deep link (URL-encoded at
 * the call site). Kept in config (not a dictionary) because it is a fixed
 * business value, not a translated UI string, and the store's WhatsApp audience
 * is Spanish-speaking regardless of the site's UI locale. Swap freely.
 */
export const WHATSAPP_PREFILL_MESSAGE_ES =
  "Hola, tengo una pregunta sobre las sillas de PosturPro." as const;

/**
 * Seed default for flat-rate shipping, in integer cents (MXN centavos).
 * 50000 cents = MX$500.00. Runtime source of truth is `store_settings`.
 */
export const SHIPPING_FLAT_RATE_CENTS = 50_000;

/**
 * Seed default for the order subtotal (in cents) at/above which shipping is
 * free. 1_000_000 cents = MX$10,000.00. Runtime source of truth is
 * `store_settings`.
 */
export const FREE_SHIPPING_THRESHOLD_CENTS = 1_000_000;

/** Supabase Storage bucket that holds public product images. */
export const SUPABASE_STORAGE_BUCKET = "product-images" as const;

/**
 * Base URL for placeholder product images used by the seed script.
 *
 * Uses picsum.photos seeded URLs (`/{slug}-{n}/800/800`) which return a real,
 * deterministic 800x800 image per seed string — so seeded catalog data renders
 * something during T2–T5 development instead of 404ing. Swap for real Supabase
 * Storage URLs when real photography is available (see header).
 */
export const SEED_IMAGE_BASE_URL = "https://picsum.photos/seed" as const;

/** Default store identity written by the seed (admin-editable in T10). */
export const SEED_STORE_NAME = "PosturPro" as const;

/** Default store contact email written by the seed (admin-editable in T10). */
export const SEED_STORE_CONTACT_EMAIL = "hola@posturpro.mx" as const;

/* ========================================================================= *
 * CATALOG (T3) — non-secret tunables, single-sourced here (Rule 4).
 * ========================================================================= */

/**
 * Products shown per catalog/category/brand/style grid page (T3 AC-9).
 * 12 is divisible by the 2 / 3 / 4 grid columns, so the last row is never
 * ragged at any breakpoint. Change this and pagination math + skeleton count
 * follow automatically (both read this constant).
 */
export const PRODUCTS_PER_PAGE = 12;

/**
 * Absolute upper bound on the `?page` value that is ever treated as distinct
 * (T3 security — cache-key cardinality / DoS bound). The `?page` query param is
 * attacker-controlled and flows into the `unstable_cache` key. Without a ceiling
 * an attacker could mint an unbounded number of distinct cache entries (and one
 * DB count+read per distinct value) with `?page=1`, `?page=2`, … `?page=1e9`,
 * random junk, etc. — unbounded cache growth + amplified DB load.
 *
 * The page always clamps to `[1, lastPage]` for the actual read, and no real
 * catalog will approach this many pages (12 items/page × 100 000 pages = 1.2M
 * products), so any value above this is functionally identical to "last page"
 * and is collapsed to a SINGLE cache key. This bounds distinct cache keys per
 * listing to `MAX_PAGE + 1` regardless of how many junk values are requested.
 */
export const MAX_PAGE = 100_000;

/**
 * Inclusive upper bound for the "low stock" badge state (T3 AC-8). Effective
 * stock `1..LOW_STOCK_THRESHOLD` renders "Solo quedan {n}"; `> threshold`
 * renders "En stock"; `0` renders "Agotado".
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * ISR revalidation window (seconds) for cached catalog reads and the static
 * store-settings read (T3 AC-11). Catalog pages become static/ISR; admin CRUD
 * (T10) busts the relevant `unstable_cache` tag on demand, so this is only the
 * fallback staleness ceiling, not the primary freshness mechanism. 5 minutes.
 */
export const CATALOG_REVALIDATE_SECONDS = 300;

/* ------------------------------------------------------------------------- *
 * Catalog route segments — locale-agnostic Spanish paths (T3 routing
 * decision). The locale-aware `Link` adds the `/en` prefix automatically, so
 * these are single-sourced here rather than hardcoded across pages/breadcrumbs.
 * ------------------------------------------------------------------------- */

/** All-products catalog grid. */
export const CATALOG_PATH = "/sillas" as const;
/** Category index. */
export const CATEGORIES_PATH = "/categorias" as const;
/** Brand index. */
export const BRANDS_PATH = "/marcas" as const;
/** Style index. */
export const STYLES_PATH = "/estilos" as const;

/** Build the canonical category detail path for a slug. */
export function categoryPath(slug: string): string {
  return `${CATEGORIES_PATH}/${slug}`;
}
/** Build the canonical brand detail path for a slug. */
export function brandPath(slug: string): string {
  return `${BRANDS_PATH}/${slug}`;
}
/** Build the canonical style detail path for a slug. */
export function stylePath(slug: string): string {
  return `${STYLES_PATH}/${slug}`;
}
/**
 * Canonical product-detail (PDP) path for a slug (T3 AC-12). The route is
 * owned by T4 and may 404 via the catch-all until it ships — T3 only links to
 * it. Single-sourced so T4 need not hunt for hardcoded strings.
 */
export function productPath(slug: string): string {
  return `/producto/${slug}`;
}

/* ========================================================================= *
 * SEARCH / FILTERS / SORTING (T5) — non-secret tunables, single-sourced (AC-9).
 * ========================================================================= */

/**
 * URL query-param names for search/filter/sort state (AC-9). Spanish, matching
 * the store's Spanish route paths, single-sourced so pages, links, and the
 * parse lib never drift. `page` is the existing pagination param (reused).
 */
export const SEARCH_PARAM_KEYS = {
  q: "q",
  categoria: "categoria",
  marca: "marca",
  estilo: "estilo",
  color: "color",
  material: "material",
  precioMin: "precioMin",
  precioMax: "precioMax",
  disponibilidad: "disponibilidad", // "todos" opts into out-of-stock
  orden: "orden",
  page: "page",
} as const;

/** A single SEARCH_PARAM_KEYS map type (for typed component props). */
export type SearchParamKeys = typeof SEARCH_PARAM_KEYS;

/**
 * The closed set of sort keys (AC-7). Spanish values that appear verbatim in
 * the URL (`?orden=precio-asc`). Any value outside this set is dropped and the
 * default is used, so an attacker cannot inject a sort expression (edge 3).
 */
export const SORT_KEYS = [
  "mas-vendidas", // best-selling (default): sales_count DESC + tiebreak
  "precio-asc",
  "precio-desc",
  "novedades", // created_at DESC
  "nombre-asc",
  "nombre-desc",
] as const;

/** Default sort when `?orden` is absent or unknown — matches the T3 default. */
export const DEFAULT_SORT = "mas-vendidas" as const;

/** The value of `?disponibilidad` that opts into out-of-stock products. */
export const AVAILABILITY_ALL = "todos" as const;

/**
 * Hard cap on the free-text `q` length enforced BEFORE the RPC (Constraint 3).
 * Free-text search is never cached (unbounded key cardinality = cache-key DoS);
 * capping the length bounds the DB work per request. 80 chars comfortably fits
 * any real product query.
 */
export const SEARCH_QUERY_MAX = 80;

/** Products shown in the no-results "popular chairs" strip (AC-16). */
export const POPULAR_PRODUCTS_MAX = 8;

/** Facet-list length past which the filter panel collapses to "Ver más". */
export const FILTER_FACET_COLLAPSE_AFTER = 6;

/**
 * Absolute ceiling on a price bound (cents) accepted from the URL. Bounds the
 * cache-key space for the filter-only cache (a price snaps to a bucket within
 * [0, this]) and rejects absurd values (edge 3). 100_000_000 cents = MX$1,000,000
 * — far above any real chair price.
 */
export const PRICE_BOUND_MAX_CENTS = 100_000_000;

/**
 * Bucket size (cents) a price bound snaps to for the FILTER-ONLY cache key
 * (Constraint 3). The slider shows the real catalog price domain for UX, but
 * the cache key uses the bucketed value so an attacker cannot mint a distinct
 * cache entry per arbitrary price. 10_000 cents = MX$100 buckets.
 */
export const PRICE_BUCKET_CENTS = 10_000;

/* ========================================================================= *
 * PRODUCT DETAIL PAGE (T4) — non-secret tunables, single-sourced here (Rule 4).
 * ========================================================================= */

/**
 * Maximum products shown in the recently-viewed strip (T4 AC-12). The strip is
 * client-only/localStorage (no accounts in Phase 1). Newest-first, current
 * product excluded. Change here and both the storage cap and the render cap
 * follow (both read this constant).
 */
export const RECENTLY_VIEWED_MAX = 8;

/**
 * localStorage key under which the recently-viewed card view models are stored
 * (T4 AC-12). Namespaced so it never collides with other persisted state. If
 * the stored shape ever changes incompatibly, bump the version suffix so stale
 * payloads are ignored rather than mis-rendered.
 */
export const RECENTLY_VIEWED_STORAGE_KEY = "posturpro:recently-viewed:v1" as const;

/* ========================================================================= *
 * CART (T6) — non-secret tunables, single-sourced here (Rule 4).
 * ========================================================================= */

/**
 * localStorage key under which the guest cart lines are stored (T6 AC-3, AC-14).
 * Namespaced + versioned so it never collides with other persisted state
 * (mirrors {@link RECENTLY_VIEWED_STORAGE_KEY}). If the stored `CartLine` shape
 * ever changes incompatibly, bump the `:v1` suffix so stale payloads are
 * ignored (fail the `isCartLine` guard → empty cart) rather than mis-rendered.
 */
export const CART_STORAGE_KEY = "posturpro:cart:v1" as const;

/**
 * UX sanity ceiling on a single cart line's quantity (T6 AC-13). NOT a business
 * rule — min/max order quantities are explicitly out of scope; real overselling
 * protection is enforced server-side at T7 checkout. This only bounds the
 * stepper and clamps tampered stored quantities to a sane range. 99 keeps the
 * header count pill legible (`99+` above it) and the line-total math small.
 */
export const MAX_CART_ITEM_QUANTITY = 99;

/**
 * Cart page route segment — locale-agnostic Spanish path (T6 AC-5). The
 * locale-aware `Link` adds the `/en` prefix automatically, so `/carrito`
 * becomes `/en/carrito` in English. Single-sourced so the header badge, mobile
 * nav, and empty-state CTA never hardcode it.
 */
export const CART_PATH = "/carrito" as const;

/**
 * Checkout route segment — owned by T7 (T6 AC-15). The cart's checkout CTA only
 * LINKS here; T6 builds no checkout page, so this route may 404 until T7 ships
 * (the same forward-link pattern T3 used for the then-unbuilt PDP route).
 */
export const CHECKOUT_PATH = "/checkout" as const;

/**
 * How long (ms) the PDP add-to-cart button shows its transient "Agregado ✓"
 * confirmation before reverting to the idle label (T6 AC-1, success state).
 * ~1.5s is long enough to register without nagging. Re-clicking during the
 * window re-adds and resets this timer (interruptible).
 */
export const ADD_TO_CART_CONFIRM_MS = 1_500;

/**
 * Q&A submission rate-limit window, in milliseconds (T4 AC-15). Within this
 * window a single IP+product may submit at most {@link QA_MAX_SUBMISSIONS_PER_WINDOW}
 * questions. Best-effort, in-memory, per-server-instance (resets on
 * redeploy/scale-out) — a durable/global limiter is a documented follow-up, not
 * this ticket. 60 seconds.
 */
export const QA_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Max Q&A submissions allowed per IP+product within {@link QA_RATE_LIMIT_WINDOW_MS}
 * (T4 AC-15). Above this the action rejects before any DB insert with a friendly
 * "please wait" message.
 */
export const QA_MAX_SUBMISSIONS_PER_WINDOW = 3;

/**
 * Max author-name length for a Q&A submission (T4 AC-14). MIRRORS the DB CHECK
 * `char_length(author_name) between 1 and 120` in `0004_content_qa.sql`. Client
 * caps input and server re-validates the TRIMMED value against this — the DB
 * CHECK is the floor, never the first line of defense.
 */
export const AUTHOR_NAME_MAX = 120;

/**
 * Max question length for a Q&A submission (T4 AC-14). MIRRORS the DB CHECK
 * `char_length(question) between 1 and 2000` in `0004_content_qa.sql`.
 */
export const QUESTION_MAX = 2000;

/**
 * Hard ceiling on the number of distinct keys the in-memory Q&A rate-limiter
 * map may hold at once (T4 M-2 — cache-key-cardinality DoS bound, mirroring
 * {@link MAX_PAGE} for the T3 read path). Each key is `ip|productId`; a bounded
 * `productId` (validated UUID) and a bounded IP source cap the theoretical
 * cardinality, but an attacker rotating either still grows the map. When the
 * map exceeds this size the limiter evicts idle/expired keys, then (if still
 * over) the oldest keys — so memory is bounded regardless of input. Sized well
 * above any legitimate concurrent-asker volume at seed scale.
 */
export const QA_RATE_LIMIT_MAX_KEYS = 10_000;

/**
 * Matches a canonical lowercase UUID (v1–v5), the shape Postgres emits for
 * `product_questions.product_id` (T4 M-2). The Q&A action validates the
 * client-supplied `productId` against this BEFORE it keys the rate-limiter or
 * reaches the DB, so arbitrary attacker strings can never mint rate-limit keys
 * or hit the insert. Anchored + fixed-length → no ReDoS, no partial matches.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Max characters of a product description surfaced in the `<meta name=
 * "description">` tag (T4 AC-3, m-1). AC-3 specifies a TRUNCATED description;
 * ~160 chars is the length Google renders before it clips, so longer copy is
 * sliced (on a word boundary, with an ellipsis) by {@link truncateForMeta}.
 */
export const MAX_META_DESCRIPTION = 160;

/**
 * Truncate a description for the `<meta name="description">` tag (T4 AC-3, m-1).
 * Trims first; returns it unchanged when within {@link MAX_META_DESCRIPTION};
 * otherwise slices to the last word boundary at or before the limit and appends
 * an ellipsis. Never splits a word or emits a trailing space before the "…".
 */
export function truncateForMeta(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_META_DESCRIPTION) {
    return trimmed;
  }
  const slice = trimmed.slice(0, MAX_META_DESCRIPTION);
  const lastSpace = slice.lastIndexOf(" ");
  const head = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${head.trimEnd()}…`;
}

/* ========================================================================= *
 * CHECKOUT (T7) — non-secret tunables, single-sourced here (BUILD_PLAN rule 4).
 *
 * HOW TO SWAP REAL VALUES
 * -----------------------
 * - MEXICAN_STATES / MEXICAN_CP_PATTERN: Phase-1 address validation. The CP is
 *   validated only as "5 digits"; a full authoritative CP↔state cross-check
 *   (SEPOMEX) is carrier/Phase-3 work — see dev-done.md follow-up. To localize
 *   to another market, replace the state list and CP pattern together and update
 *   the `shipping_country` default in checkout (currently 'MX' from the DB).
 * - ORDER_NUMBER_PREFIX / formatOrderNumber: display/format only. The actual
 *   uniqueness guarantee lives in the DB (a sequence-backed number produced by
 *   the `create_order` RPC in 0008_checkout.sql). Changing the prefix here also
 *   changes what the RPC-generated number must be prefixed with — keep both in
 *   sync (the RPC reads no TS constant, so the prefix string is duplicated there
 *   intentionally; if you change it, update the migration too).
 * - TAX_RATE: 0 in Phase 1 (no IVA line). Written to `tax_cents`/`tax_base_cents`
 *   as 0 so CFDI (Phase 3) needs no schema change. Raising it requires real tax
 *   logic (base computation, rounding rules, per-line vs. per-order) — treat as a
 *   project change, not a config swap.
 * - CHECKOUT_CONFIRMATION_SEGMENT / confirmationPath: the locale-agnostic
 *   confirmation route. The locale-aware `Link`/`redirect` add the `/en` prefix.
 * ========================================================================= */

/**
 * The 32 federal entities of Mexico (31 states + Ciudad de México), the closed
 * list a checkout `state` is validated against (T7 AC-4). SINGLE SOURCE for both
 * the `<Select>` options and the server-side re-validation. These are proper
 * nouns — identical in every UI locale — so they are config, not i18n keys
 * (only the field label/placeholder are translated). Order: alphabetical (the
 * order they render in the Select).
 */
export const MEXICAN_STATES = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Ciudad de México",
  "Coahuila",
  "Colima",
  "Durango",
  "Estado de México",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas",
] as const;

/** A single Mexican state name (union of {@link MEXICAN_STATES}). */
export type MexicanState = (typeof MEXICAN_STATES)[number];

/** Fast membership set for server-side state validation (built once). */
const MEXICAN_STATES_SET: ReadonlySet<string> = new Set(MEXICAN_STATES);

/** Whether a value is one of the 32 valid Mexican states (T7 AC-4). */
export function isMexicanState(value: string): value is MexicanState {
  return MEXICAN_STATES_SET.has(value);
}

/**
 * Mexican postal code shape (T7 AC-4): EXACTLY 5 digits. Anchored + fixed-length
 * (no ReDoS). This is the ONLY structural check on a CP in Phase 1 — there is no
 * CP↔state authority table (SEPOMEX is a Phase-3/carrier upgrade, documented as
 * a known follow-up in dev-done.md).
 */
export const MEXICAN_CP_PATTERN = /^\d{5}$/;

/**
 * Max length of the optional free-text delivery notes (T7). Bounds the stored
 * value and the textarea `maxLength`. Not a DB CHECK (the column is unbounded
 * `text`) — this is an app-level sanity cap mirroring the Q&A `QUESTION_MAX`
 * discipline so a hostile payload can't bloat the order row.
 */
export const DELIVERY_NOTES_MAX = 1_000;

/**
 * Max length of the optional RFC field (T7). Mexican RFC is 12–13 chars; we cap
 * generously at 20 and do NOT validate its SHAPE in Phase 1 (CFDI invoicing is
 * Phase 3 — the value is captured and stored only). Trimmed + upper-cased on the
 * server before storage.
 */
export const RFC_MAX = 20;

/** Max length of the contact phone (T7). Bounded sanity cap; not shape-checked. */
export const CONTACT_PHONE_MAX = 30;

/**
 * Max length of a single free-text address/name/city field (T7). Mirrors the
 * `customers_full_name_nonblank` discipline: trim → non-blank → bounded. The DB
 * columns are unbounded `text`; this app cap keeps a hostile payload sane.
 */
export const ADDRESS_FIELD_MAX = 200;

/**
 * Basic email shape for contact validation (T7 AC-5). Deliberately permissive —
 * "one or more non-space/@ chars, an @, one or more non-space/@ chars, a dot, a
 * TLD" — a full RFC 5322 validator is overkill and rejects valid addresses. The
 * real proof an email works is delivery (the confirmation email is T9). Anchored,
 * no backtracking blowup.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Discount-code display prefix for the confirmation/order number. Combined with
 * a zero-padded DB sequence by {@link formatOrderNumber}. Human-legible, short,
 * unambiguous. The RPC in 0008_checkout.sql generates the canonical unique
 * number using this SAME prefix — if you change it here, change it there too.
 */
export const ORDER_NUMBER_PREFIX = "PP" as const;

/**
 * Effective tax rate in Phase 1: ZERO. No IVA line is computed or displayed.
 * Written to `orders.tax_cents` / `orders.tax_base_cents` as 0 so the immutable
 * financial snapshot already has the columns CFDI (Phase 3) needs — no schema
 * rework later. This is a documented placeholder; see the CHECKOUT header block.
 */
export const TAX_RATE = 0;

/**
 * Confirmation route segment appended under {@link CHECKOUT_PATH} (T7 AC-13).
 * Locale-agnostic Spanish path; the locale-aware `Link`/`redirect` add `/en`.
 * The order number is the final dynamic segment.
 */
export const CHECKOUT_CONFIRMATION_SEGMENT = "confirmacion" as const;

/**
 * Build the locale-agnostic confirmation path for an order number (T7 AC-13).
 * e.g. `PP-000123` → `/checkout/confirmacion/PP-000123`. The order number is
 * URL-encoded defensively (it is DB-generated and safe, but the boundary stays
 * honest). The locale-aware `redirect`/`Link` prefixes `/en` when needed.
 */
export function confirmationPath(orderNumber: string): string {
  return `${CHECKOUT_PATH}/${CHECKOUT_CONFIRMATION_SEGMENT}/${encodeURIComponent(orderNumber)}`;
}
