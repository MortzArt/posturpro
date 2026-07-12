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

  test("compact language toggle is at least 44px tall", async ({ page }) => {
    await page.goto("/")
    const box = await page.getByTestId("language-toggle-compact").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
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
    await page.getByTestId("language-toggle-compact").click()
    await expect(page).toHaveURL(/\/en$/)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
  })
})

test.describe("WhatsApp FAB does not overlap footer content (AC-14)", () => {
  // Only meaningful when the FAB renders; with the empty placeholder it does
  // not, so this asserts the safe-absence baseline. If a number is configured
  // later, extend this to assert bounding-box separation from the footer.
  test("no FAB overlap because the FAB is absent by config", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("whatsapp-button")).toHaveCount(0)
  })
})
