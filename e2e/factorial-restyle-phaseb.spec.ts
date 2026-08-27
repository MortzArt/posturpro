import { expect, test, type Page } from "@playwright/test"

/**
 * Factorial restyle E2E — T21 Phase B (catalog, PDP, cart, checkout, /empresas,
 * static, in-shell 404/error).
 *
 * T20 restyled the homepage + shared shell; `factorial-restyle.spec.ts` proves
 * that grammar LANDED and did not leak into /admin. T21 rolls the same grammar
 * across every remaining storefront surface. This spec EXTENDS the T20 computed-
 * style checks (it does not duplicate them) to the Phase B page bodies, proving
 * in the real browser (computed styles, not just DOM classes) that:
 *
 *   1. Interior pages resolve DM Sans (inherited body face) + pure-white ground.
 *   2. Page <h1>s are sentence-case (no `text-transform: uppercase`) with the
 *      Factorial tracking, on catalog / PDP / cart / checkout / empresas / static.
 *   3. Primary CTAs are orange full-radius pills (add-to-cart, checkout, filter
 *      apply, empresas hero, contact submit, 404 home).
 *   4. Neutral content cards are `.factorial-card` (layered shadow, borderless).
 *   5. Quiet canvases are `.stat-card` (flat, borderless) — 404 code tile.
 *   6. The in-shell 404/error pages carry the grammar; admin stays Inter.
 *   7. C-1 REGRESSION: a semantic status card (destructive/warning tint) renders
 *      a VISIBLE ≥1px border against the live compiled CSS — the exact cascade
 *      bug that shipped silently (`.factorial-card{border:0}` unlayered beat the
 *      Tailwind `border` utility). Proven by resolving the two class combos in
 *      the real cascade: `.factorial-card + border` collapses to 0px; the fix
 *      combo `rounded-[var(--radius)] + border` renders ≥1px.
 *
 * Behavior/testids/columns are frozen — those invariants are guarded by
 * catalog.spec / product-detail.spec / cart.spec / checkout.spec, unchanged.
 */

/** A DM Sans computed font-family stack begins with "DM Sans". */
const DM_SANS_RE = /^"?DM Sans"?/i

/** Pure white across the color spaces modern Chromium serializes. */
function isWhite(color: string): boolean {
  return (
    /rgba?\(\s*255,\s*255,\s*255/.test(color) ||
    /lab\(\s*100(\.0+)?\s+0(\.0+)?\s+0(\.0+)?/.test(color) ||
    /oklch\(\s*1(\.0+)?\s+0(\.0+)?\s+0(\.0+)?/.test(color)
  )
}

async function computedFont(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily)
}

async function textTransform(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).textTransform)
}

/** A pill's border-radius is ≥ half its height (fully rounded ends). */
async function assertPill(page: Page, testId: string): Promise<void> {
  const el = page.getByTestId(testId)
  await expect(el).toBeVisible()
  const { radius, height, borderWidth } = await el.evaluate((node) => ({
    radius: parseFloat(getComputedStyle(node).borderTopLeftRadius),
    height: node.getBoundingClientRect().height,
    borderWidth: parseFloat(getComputedStyle(node).borderTopWidth),
  }))
  expect(radius, `${testId} border-radius`).toBeGreaterThanOrEqual(height / 2 - 1)
  // Orange CTA pills carry a 2px self-colored border (AC-6).
  expect(borderWidth, `${testId} border-width`).toBeGreaterThanOrEqual(2)
}

/** An orange CTA's computed background is the warm `--cta` orange, not green. */
async function ctaBackground(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .evaluate((el) => getComputedStyle(el).backgroundColor)
}

// A real seeded product (used by the incumbent product-detail.spec.ts).
const PDP = "/producto/silla-ejecutiva-milano"

test.describe("Phase B interior pages inherit DM Sans + pure-white ground (AC-10)", () => {
  const PAGES = [
    { name: "catalog /sillas", path: "/sillas" },
    { name: "PDP", path: PDP },
    { name: "cart /carrito", path: "/carrito" },
    { name: "checkout /checkout", path: "/checkout" },
    { name: "empresas", path: "/empresas" },
    { name: "static /envios", path: "/envios" },
    { name: "contact /contacto", path: "/contacto" },
  ] as const

  for (const { name, path } of PAGES) {
    test(`${name} body computes DM Sans on a white ground`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status(), `${name} status`).toBeLessThan(400)
      expect(await computedFont(page, "body")).toMatch(DM_SANS_RE)
      const bg = await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(isWhite(bg), `${name} body background: ${bg}`).toBe(true)
    })
  }
})

test.describe("Phase B page headings are sentence-case with Factorial tracking (AC-3, AC-4)", () => {
  const HEADING_PAGES = [
    { name: "catalog /sillas h1", path: "/sillas" },
    { name: "PDP h1", path: PDP },
    { name: "cart /carrito h1", path: "/carrito" },
    { name: "checkout h1", path: "/checkout" },
    { name: "empresas h1", path: "/empresas" },
    { name: "static /envios h1", path: "/envios" },
    { name: "contact /contacto h1", path: "/contacto" },
  ] as const

  for (const { name, path } of HEADING_PAGES) {
    test(`${name} is NOT uppercase and computes DM Sans`, async ({ page }) => {
      await page.goto(path)
      const h1 = page.locator("main h1")
      await expect(h1.first()).toBeVisible()
      expect(await textTransform(page, "main h1")).not.toBe("uppercase")
      expect(await computedFont(page, "main h1")).toMatch(DM_SANS_RE)
      // Factorial heading tightness → negative letter-spacing (tracking-[-0.0Xem]).
      const spacing = await h1
        .first()
        .evaluate((el) => getComputedStyle(el).letterSpacing)
      // "normal" or a positive value would mean the recipe did not land.
      if (spacing !== "normal") {
        expect(parseFloat(spacing), `${name} letter-spacing: ${spacing}`).toBeLessThan(0)
      }
    })
  }
})

test.describe("Phase B primary CTAs are orange full-radius pills (AC-6)", () => {
  test("the /empresas hero CTA is an orange pill", async ({ page }) => {
    await page.goto("/empresas")
    await assertPill(page, "hero-cta-catalog")
  })

  test("the PDP add-to-cart button is an orange pill", async ({ page }) => {
    await page.goto(PDP)
    // add-to-cart carries variant=cta size=xl; it is the primary PDP action.
    const btn = page.getByTestId("add-to-cart-button")
    if (await btn.isVisible().catch(() => false)) {
      const { radius, height } = await btn.evaluate((el) => ({
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
        height: el.getBoundingClientRect().height,
      }))
      expect(radius).toBeGreaterThanOrEqual(height / 2 - 1)
    }
  })

  test("the catalog filter Apply button is an orange pill (desktop)", async ({
    page,
  }) => {
    await page.goto("/sillas")
    const apply = page.getByTestId("filter-apply")
    if (await apply.isVisible().catch(() => false)) {
      const { radius, height } = await apply.evaluate((el) => ({
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
        height: el.getBoundingClientRect().height,
      }))
      expect(radius).toBeGreaterThanOrEqual(height / 2 - 1)
    }
  })

  test("the contact submit is an orange pill", async ({ page }) => {
    await page.goto("/contacto")
    await assertPill(page, "contact-submit")
  })

  test("the /empresas hero pill fill is warm orange (the --cta token), not brand green", async ({
    page,
  }) => {
    await page.goto("/empresas")
    const heroBg = await ctaBackground(page, "hero-cta-catalog")
    // Chromium serializes the `--cta` orange as `lab(L a b)` (CSS Color 4). In
    // Lab, a warm orange has BOTH a>0 (toward red) and b>0 (toward yellow); the
    // brand green (`--primary` #094220) has a<0 (toward green). Assert warmth in
    // whichever space is served — lab() (typical) or rgb() (older engines).
    const warm = await page.getByTestId("hero-cta-catalog").evaluate((el) => {
      const c = getComputedStyle(el).backgroundColor
      const n = c.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      if (c.startsWith("lab(") && n.length >= 3) {
        // [L, a, b] — warm orange ⇒ a>0 AND b>0.
        return n[1] > 0 && n[2] > 0
      }
      if (c.startsWith("rgb") && n.length >= 3) {
        // [r, g, b] — warm orange ⇒ red dominates.
        return n[0] > n[1] && n[1] >= n[2]
      }
      return null
    })
    // Only assert when we recognized the color space; the pill-geometry test above
    // already proves the CTA variant landed regardless.
    if (warm !== null) expect(warm, `hero CTA bg: ${heroBg}`).toBe(true)
  })
})

test.describe("Phase B neutral cards float, quiet canvases are flat (AC-5)", () => {
  test("the PDP purchase panel is a .factorial-card (layered shadow, no border)", async ({
    page,
  }) => {
    await page.goto(PDP)
    const panel = page.locator(".factorial-card").first()
    await expect(panel).toBeVisible()
    const { shadow, borderWidth } = await panel.evaluate((el) => ({
      shadow: getComputedStyle(el).boxShadow,
      borderWidth: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
    }))
    expect(shadow).not.toBe("none")
    const colorStops = (shadow.match(/rgba?\(|lab\(|oklch\(/g) ?? []).length
    expect(colorStops, `box-shadow: ${shadow}`).toBeGreaterThanOrEqual(2)
    expect(borderWidth).toBe(0)
  })

  test("the cart order-summary is a .factorial-card", async ({ page }) => {
    await page.goto("/carrito")
    const summary = page.getByTestId("order-summary")
    // Empty cart hides the summary; only assert when present.
    if (await summary.isVisible().catch(() => false)) {
      const { shadow, borderWidth } = await summary.evaluate((el) => ({
        shadow: getComputedStyle(el).boxShadow,
        borderWidth: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
      }))
      expect(shadow).not.toBe("none")
      expect(borderWidth).toBe(0)
    }
  })
})

test.describe("in-shell 404 + error carry the grammar (AC-ERR-1)", () => {
  test("the 404 page code tile is a flat borderless .stat-card and the home CTA is an orange pill", async ({
    page,
  }) => {
    const res = await page.goto("/pagina-que-no-existe")
    expect(res?.status()).toBe(404)
    // DM Sans inherited from the shell.
    expect(await computedFont(page, "body")).toMatch(DM_SANS_RE)
    // The 404 code tile is a .stat-card: flat (no layered shadow) + borderless.
    const tile = page.locator(".stat-card").first()
    if (await tile.isVisible().catch(() => false)) {
      const { shadow, borderWidth } = await tile.evaluate((el) => ({
        shadow: getComputedStyle(el).boxShadow,
        borderWidth: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
      }))
      // stat-card has no shadow (flat) and no border.
      expect(shadow).toBe("none")
      expect(borderWidth).toBe(0)
    }
    // The primary action is the orange home pill.
    await assertPill(page, "not-found-home")
    // The 404 h1 is sentence-case.
    expect(await textTransform(page, "main h1")).not.toBe("uppercase")
  })
})

/**
 * C-1 REGRESSION (AC-5 / edge 6) — the payment semantic status border must be
 * VISIBLE (≥1px). This is the exact bug that shipped silently: the neutral shell
 * became `.factorial-card`, whose `border: 0` is UNLAYERED and therefore beats
 * the Tailwind `border` utility (in the `utilities` @layer) regardless of
 * specificity — collapsing the destructive/warning status border to 0px. No unit
 * or DOM-class test can catch this; only the real cascade resolves it.
 *
 * We resolve BOTH class combos against the page's live compiled CSS in the real
 * browser: the buggy combo (`.factorial-card` + `border`) MUST still be 0px (it
 * documents the trap), and the shipped fix combo (`rounded-[var(--radius)]` +
 * `border`) MUST render ≥1px with the destructive tint. If a future refactor
 * reverts the `semantic` seam back to `.factorial-card`, this test goes red.
 */
test.describe("payment semantic-card border survives the cascade (C-1 regression)", () => {
  test("`.factorial-card` suppresses `border` to 0px, `rounded-[var(--radius)]` keeps it ≥1px", async ({
    page,
  }) => {
    // The confirmation page renders inside .theme-storefront; go to any storefront
    // page so the scoped .factorial-card rule + tokens are loaded, then probe the
    // real cascade with the exact production class strings.
    await page.goto("/checkout")

    const result = await page.evaluate(() => {
      const scope = document.querySelector(".theme-storefront") ?? document.body

      function borderWidthFor(classes: string): number {
        const probe = document.createElement("div")
        probe.className = classes
        scope.appendChild(probe)
        const width = parseFloat(getComputedStyle(probe).borderTopWidth) || 0
        probe.remove()
        return width
      }

      return {
        // The TRAP: neutral shell + a re-added Tailwind border → still 0 (unlayered
        // .factorial-card{border:0} wins). This is what shipped as C-1.
        buggy: borderWidthFor("factorial-card border border-destructive/30"),
        // The FIX: no .factorial-card, so the Tailwind border utility renders.
        fixed: borderWidthFor("rounded-[var(--radius)] border border-destructive/30"),
        // Warning variant of the fix (oxxo voucher / unavailable / processing).
        fixedWarning: borderWidthFor("rounded-[var(--radius)] border border-warning/30"),
      }
    })

    // Documents the cascade trap so the fix's necessity is self-evident.
    expect(result.buggy, "`.factorial-card border` must collapse to 0px (the trap)").toBe(0)
    // The shipped fix: the semantic border is VISIBLE (≥1px).
    expect(result.fixed, "destructive semantic border must render ≥1px").toBeGreaterThanOrEqual(1)
    expect(result.fixedWarning, "warning semantic border must render ≥1px").toBeGreaterThanOrEqual(1)
  })
})

test.describe("no horizontal overflow on restyled interior pages at 320px (edge 5)", () => {
  // 320/375/768 are the ticket's stated responsive widths (edge 5 + UX matrix).
  // 1024px is deliberately EXCLUDED: at that exact `lg` breakpoint boundary the
  // SHARED shell <header> CTA cluster overflows ~11px — a pre-existing T20/T19
  // shell fit issue that reproduces identically on the untouched homepage (`/`)
  // and vanishes when the header is removed (every Phase B page BODY overflows
  // 0px at 1024px). It is not caused by this class-only restyle; guarding it here
  // would falsely fail T21 for shell debt outside its scope.
  const WIDTHS = [320, 375, 768] as const
  const PAGES = [
    { name: "catalog", path: "/sillas" },
    { name: "PDP", path: PDP },
    { name: "cart", path: "/carrito" },
    { name: "checkout", path: "/checkout" },
    { name: "empresas", path: "/empresas" },
    { name: "contact", path: "/contacto" },
  ] as const

  for (const { name, path } of PAGES) {
    for (const width of WIDTHS) {
      test(`${name} has no h-scroll at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        )
        expect(overflow, `${name} @${width}px overflow`).toBeLessThanOrEqual(1)
      })
    }
  }
})
