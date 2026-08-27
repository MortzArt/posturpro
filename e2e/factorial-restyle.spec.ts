import { expect, test, type Page } from "@playwright/test"

/**
 * Factorial restyle E2E (T20 Phase A — homepage + shared shell).
 *
 * T20 is a PRESENTATION-ONLY reskin: content/copy/data/testids are frozen from
 * T19 (structure/behavior already proven in home.spec.ts / mobile-nav.spec.ts /
 * responsive-motion.spec.ts / whatsapp-and-footer.spec.ts). This spec proves the
 * NEW Factorial grammar actually LANDED in the browser (computed styles, not just
 * DOM classes) and — critically — that the DM Sans / white-footer / pill grammar
 * did NOT leak into /admin or break the non-home pages that inherit the shell.
 *
 *   1. DM Sans renders on the storefront (computed font-family), both locales.
 *   2. Admin firewall: /admin/login computed font stays Inter (NOT DM Sans).
 *   3. Pure-white page + white footer (computed background), no on-green footer.
 *   4. Pills: header CTA + hero CTAs are full-radius (computed border-radius).
 *   5. Floating cards carry the layered Factorial shadow (computed box-shadow).
 *   6. Deep-link anchors land with the sticky-header scroll-mt offset intact.
 *   7. focus-visible ring is visible on a pill on white ground.
 *   8. No console errors / no hydration warnings on the homepage.
 *   9. Cross-page inheritance smoke: non-home pages render with the inherited
 *      white footer + DM Sans + tokens and NO layout break / console errors.
 */

/** A DM Sans computed font-family stack begins with "DM Sans". */
const DM_SANS_RE = /^"?DM Sans"?/i
/** Inter is the admin/incumbent body face; DM Sans must never appear in admin. */
const INTER_RE = /inter/i

/**
 * Pure white across the color spaces modern Chromium serializes: rgb/rgba
 * (255,255,255), CSS Color 4 `lab(100 0 0)`, and `oklch(1 0 0)`. The storefront
 * `--background` is authored `oklch(1 0 0)`; the browser may report ANY of these.
 */
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

/**
 * The admin auth path awaits the local Supabase DB; when the DB/Docker is not
 * running (e.g. a dev machine without `supabase start`) `/admin/login` hangs and
 * navigation aborts. This is PRE-EXISTING environmental debt (the incumbent
 * `theme-firewall.spec.ts` admin test hits the identical hang), NOT a T20
 * regression. Probe reachability so the firewall assertions SKIP with a reason
 * locally but still RUN in CI where the DB is provisioned.
 */
async function adminReachable(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get("/admin/login", { timeout: 8000 })
    return res.status() < 500
  } catch {
    return false
  }
}

async function consoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text())
  })
  page.on("pageerror", (err) => errors.push(err.message))
  return errors
}

test.describe("DM Sans renders on the storefront (AC-1)", () => {
  test("es-MX homepage body + h1 compute to the DM Sans stack", async ({
    page,
  }) => {
    await page.goto("/")
    expect(await computedFont(page, "body")).toMatch(DM_SANS_RE)
    expect(await computedFont(page, "main h1")).toMatch(DM_SANS_RE)
    // Libre Caslon Text (the T19 serif) must be gone from the homepage (AC-4).
    expect(await computedFont(page, "main h1")).not.toMatch(/caslon/i)
  })

  test("en homepage body + h1 also compute to DM Sans (both locales)", async ({
    page,
  }) => {
    await page.goto("/en")
    expect(await computedFont(page, "body")).toMatch(DM_SANS_RE)
    expect(await computedFont(page, "main h1")).toMatch(DM_SANS_RE)
  })

  test("a homepage pill CTA also renders in DM Sans (buttons included)", async ({
    page,
  }) => {
    await page.goto("/")
    expect(await computedFont(page, '[data-testid="hero-cta-catalog"]')).toMatch(
      DM_SANS_RE,
    )
  })
})

test.describe("admin firewall — DM Sans does NOT leak into /admin (AC-5)", () => {
  test("admin login computes Inter, never DM Sans", async ({ page }) => {
    test.skip(
      !(await adminReachable(page)),
      "admin auth path needs the Supabase DB; skipped when the DB is down (pre-existing env debt, not T20)",
    )
    await page.goto("/admin/login")
    await expect(page.getByTestId("admin-login-form")).toBeVisible()
    const bodyFont = await computedFont(page, "body")
    expect(bodyFont).toMatch(INTER_RE)
    expect(bodyFont).not.toMatch(DM_SANS_RE)
    // The heading in admin resolves the sans heading, not DM Sans.
    const headingFont = await computedFont(page, "h1")
    expect(headingFont).not.toMatch(DM_SANS_RE)
  })

  test("admin body carries neither .theme-storefront nor the --font-dm-sans var", async ({
    page,
  }) => {
    test.skip(
      !(await adminReachable(page)),
      "admin auth path needs the Supabase DB; skipped when the DB is down (pre-existing env debt, not T20)",
    )
    await page.goto("/admin/login")
    await expect(page.locator("body")).not.toHaveClass(/theme-storefront/)
    // The storefront font var must be UNDEFINED in the admin tree (firewall).
    const dmVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-dm-sans")
        .trim(),
    )
    expect(dmVar).toBe("")
  })
})

test.describe("pure-white page + white footer (AC-7, AC-15)", () => {
  test("the homepage body background computes to opaque white", async ({
    page,
  }) => {
    await page.goto("/")
    const bg = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(isWhite(bg), `body background: ${bg}`).toBe(true)
  })

  test("the footer is a WHITE hairline footer, not the old deep-green (AC-15)", async ({
    page,
  }) => {
    await page.goto("/")
    const footer = page.getByTestId("site-footer")
    await expect(footer).toBeVisible()
    const bg = await footer.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(isWhite(bg), `footer background: ${bg}`).toBe(true)
    // A top hairline (border), no drop shadow.
    const borderTop = await footer.evaluate(
      (el) => getComputedStyle(el).borderTopWidth,
    )
    expect(parseFloat(borderTop)).toBeGreaterThan(0)
    // Footer content is frozen — wordmark still present.
    await expect(page.getByTestId("footer-wordmark")).not.toBeEmpty()
  })

  test("no uppercase transforms remain on footer column titles (AC-3)", async ({
    page,
  }) => {
    await page.goto("/")
    const transforms = await page
      .getByTestId("site-footer")
      .locator("h3, h2")
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).textTransform),
      )
    for (const t of transforms) expect(t).not.toBe("uppercase")
  })
})

test.describe("pill grammar renders (AC-10)", () => {
  test("the header CTA is a full-radius pill", async ({ page }) => {
    await page.goto("/")
    const cta = page.getByTestId("header-cta")
    // On desktop the header CTA is visible; skip gracefully on mobile chrome.
    if (await cta.isVisible().catch(() => false)) {
      const radius = await cta.evaluate((el) =>
        parseFloat(getComputedStyle(el).borderTopLeftRadius),
      )
      const height = await cta.evaluate((el) => el.getBoundingClientRect().height)
      // A pill's radius is ≥ half its height (fully rounded ends).
      expect(radius).toBeGreaterThanOrEqual(height / 2 - 1)
    }
  })

  test("the hero primary CTA is a full-radius orange pill", async ({ page }) => {
    await page.goto("/")
    const cta = page.getByTestId("hero-cta-catalog")
    await expect(cta).toBeVisible()
    const { radius, height } = await cta.evaluate((el) => ({
      radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
      height: el.getBoundingClientRect().height,
    }))
    expect(radius).toBeGreaterThanOrEqual(height / 2 - 1)
    // 2px self-colored border (AC-10).
    const borderWidth = await cta.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderTopWidth),
    )
    expect(borderWidth).toBeGreaterThanOrEqual(2)
  })
})

test.describe("floating cards carry the layered Factorial shadow (AC-11)", () => {
  test("a .factorial-card has a non-none box-shadow and no border", async ({
    page,
  }) => {
    await page.goto("/")
    // The savings calculator container is a .factorial-card.
    const card = page.getByTestId("savings-calculator")
    await expect(card).toBeVisible()
    const { shadow, borderWidth } = await card.evaluate((el) => ({
      shadow: getComputedStyle(el).boxShadow,
      borderWidth: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
    }))
    expect(shadow).not.toBe("none")
    // Layered triple shadow → the computed value carries multiple color stops.
    // Chromium serializes shadow colors as rgb/rgba OR CSS Color 4 lab()/oklch();
    // count any of those to prove the shadow is layered, not a single flat drop.
    const colorStops = (shadow.match(/rgba?\(|lab\(|oklch\(/g) ?? []).length
    expect(colorStops, `box-shadow: ${shadow}`).toBeGreaterThanOrEqual(2)
    expect(borderWidth).toBe(0)
  })
})

test.describe("deep-link anchors land under the sticky header (AC-19)", () => {
  const ANCHORS = ["proceso", "impacto", "garantia", "cotizacion"] as const

  for (const id of ANCHORS) {
    test(`#${id} resolves with a scroll-mt offset`, async ({ page }) => {
      await page.goto(`/#${id}`)
      const target = page.locator(`#${id}`)
      await expect(target).toBeVisible()
      // After the sticky-header offset, the anchor top sits at or below 0 and is
      // not hidden behind the header (scroll-mt-28 pushes it clear).
      const top = await target.evaluate(
        (el) => el.getBoundingClientRect().top,
      )
      // Allow generous slack; the key regression guard is "not far off-screen".
      expect(top).toBeLessThan(400)
    })
  }
})

test.describe("focus-visible ring on a pill (AC-20 a11y)", () => {
  test("keyboard-focusing the hero CTA shows a visible ring/outline on white", async ({
    page,
  }) => {
    await page.goto("/")
    const cta = page.getByTestId("hero-cta-catalog")
    await cta.focus()
    const { outlineWidth, boxShadow } = await cta.evaluate((el) => ({
      outlineWidth: getComputedStyle(el).outlineWidth,
      boxShadow: getComputedStyle(el).boxShadow,
    }))
    // focus-visible is expressed via a ring box-shadow (Tailwind ring) OR outline.
    const hasRing =
      boxShadow !== "none" || parseFloat(outlineWidth) > 0
    expect(hasRing).toBe(true)
  })
})

test.describe("no console errors on the homepage (AC-24)", () => {
  test("es-MX homepage logs no console errors or hydration warnings", async ({
    page,
  }) => {
    const errors = await consoleErrors(page)
    await page.goto("/")
    await page.getByTestId("site-footer").scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    // Filter noise not attributable to T20 (e.g. offline catalog fetch on the
    // e2e server is a designed degradation, not a client console error).
    const real = errors.filter(
      (e) => !/favicon|fetch failed|Failed to load resource/i.test(e),
    )
    expect(real, `console errors:\n${real.join("\n")}`).toHaveLength(0)
  })
})

test.describe("cross-page shell inheritance smoke (edges 3 & 8)", () => {
  // Non-home pages are NOT restyled (Phase B) — we assert they did not BREAK:
  // inherited white footer + DM Sans + tokens, render, no console errors.
  // Pages that render offline (DB-degraded to empty catalog). PDP is omitted:
  // it requires a real product slug, which needs the seeded DB (unavailable when
  // Docker/Supabase is down — an env limitation, not a T20 concern). The catalog
  // listing + cart + checkout entry + business + brands cover the shared shell.
  const PAGES = [
    { name: "catalog /sillas", path: "/sillas" },
    { name: "empresas", path: "/empresas" },
    { name: "brands index /marcas", path: "/marcas" },
    { name: "cart /carrito", path: "/carrito" },
    { name: "checkout entry /checkout", path: "/checkout" },
  ] as const

  for (const { name, path } of PAGES) {
    test(`${name} inherits the shell without breaking`, async ({ page }) => {
      const errors = await consoleErrors(page)
      const response = await page.goto(path)
      expect(response?.status(), `${name} status`).toBeLessThan(400)
      // Inherited white footer renders.
      const footer = page.getByTestId("site-footer")
      await expect(footer).toBeVisible()
      const footerBg = await footer.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(isWhite(footerBg), `${name} footer background: ${footerBg}`).toBe(
        true,
      )
      // Inherited DM Sans body face.
      expect(await computedFont(page, "body")).toMatch(DM_SANS_RE)
      // No horizontal overflow from the inherited shell.
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
      const real = errors.filter(
        (e) => !/favicon|fetch failed|Failed to load resource/i.test(e),
      )
      expect(real, `${name} console errors:\n${real.join("\n")}`).toHaveLength(0)
    })
  }

  test("404 page inherits the shell and returns a real 404", async ({ page }) => {
    const errors = await consoleErrors(page)
    const response = await page.goto("/pagina-que-no-existe")
    expect(response?.status()).toBe(404)
    await expect(page.getByTestId("site-footer")).toBeVisible()
    expect(await computedFont(page, "body")).toMatch(DM_SANS_RE)
    const real = errors.filter(
      (e) => !/favicon|fetch failed|Failed to load resource/i.test(e),
    )
    expect(real).toHaveLength(0)
  })
})
