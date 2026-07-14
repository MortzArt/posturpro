/**
 * Cart non-secret tunables and route segments (T6).
 *
 * A2 split (see `src/lib/config.ts` header): content moved VERBATIM from the
 * former monolithic `config.ts`. `CHECKOUT_PATH` lives here (rather than in the
 * checkout module) because it is the cart's forward-link target and the checkout
 * module imports it from here — keeping the cart's own routes together.
 */

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
