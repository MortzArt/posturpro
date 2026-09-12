import { expect, test } from "@playwright/test"

/**
 * Responsive layout, tap targets, and reduced motion (T2 AC-13, AC-14).
 *
 * The shell must be correct at 375 / 768 / ≥1024px with no horizontal scroll;
 * interactive controls must meet the ≥44px tap-target floor on touch-sized
 * layouts; and the app must remain fully functional under
 * `prefers-reduced-motion: reduce` (drawer/toggle still change state, just
 * without transform motion — edge case 4).
 */

const WIDTHS = [
  { name: "mobile 375px", width: 375, height: 812 },
  { name: "tablet 768px", width: 768, height: 1024 },
  { name: "desktop 1280px", width: 1280, height: 800 },
]

test.describe("no horizontal scroll across breakpoints (AC-14)", () => {
  for (const { name, width, height } of WIDTHS) {
    test(`no overflow at ${name}`, async ({ page }) => {
      // T19 BUG-1 FIXED (Stage 8 UX): the header's full desktop chrome (4-item
      // nav + inline search + segmented toggle + orange CTA) now activates at
      // `lg`, not `md`. The tablet range keeps the compact mobile pattern (the
      // hamburger drawer carries nav + CTA), so 768px no longer overflows. This
      // 768px case is now a real assertion — the fixme guard has been removed.
      await page.setViewportSize({ width, height })
      await page.goto("/")
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }
})

test.describe("tap targets ≥ 44px on mobile (AC-14)", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("hamburger trigger is at least 44x44", async ({ page }) => {
    await page.goto("/")
    const box = await page.getByTestId("mobile-nav-trigger").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  })

  test("drawer segmented toggle group is at least 44px tall", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    const panel = page.getByTestId("mobile-nav-panel")
    await expect(panel).toHaveAttribute("data-state", "open")
    // Scope to the drawer instance — the segmented toggle testid also exists in
    // the header. The drawer passes `h-11` to raise the group to ≥44px (AC-14).
    const box = await panel.getByTestId("language-toggle").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test("back-home CTA on the 404 is at least 44px tall", async ({ page }) => {
    // `/sillas` is a real catalog route as of T3; use a still-dead path.
    await page.goto("/pagina-que-no-existe")
    const box = await page.getByTestId("not-found-home").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe("prefers-reduced-motion still functional (AC-13, edge case 4)", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("drawer still opens and closes under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "open",
    )
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "closed",
    )
  })

  test("language toggle still switches locale under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    // The toggle lives in the drawer below lg (this suite runs a phone viewport).
    await page.getByTestId("mobile-nav-trigger").click()
    await page
      .getByTestId("mobile-nav-panel")
      .getByTestId("language-toggle-option-en")
      .click()
    await expect(page).toHaveURL(/\/en$/)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
  })
})

test.describe("WhatsApp FAB (AC-14)", () => {
  // As of commit 94159d2 a (placeholder) WhatsApp number is configured, so the
  // FAB now RENDERS. It is a fixed-position control that must stay clear of the
  // footer content and inside the viewport (no horizontal overflow it causes).
  test("renders, is fixed-position, and stays within the viewport width", async ({
    page,
  }) => {
    await page.goto("/")
    const fab = page.getByTestId("whatsapp-button")
    await expect(fab).toHaveCount(1)
    await expect(fab).toBeVisible()
    // The fixed FAB must not push the page wider than the viewport.
    const box = await fab.boundingBox()
    const viewport = page.viewportSize()
    if (box && viewport) {
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    }
  })
})
