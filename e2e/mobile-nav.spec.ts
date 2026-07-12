import { expect, test } from "@playwright/test"

/**
 * Mobile nav drawer (T2 AC-5, AC-13, AC-14, edge cases 4 & 6).
 *
 * Below `md` the primary nav collapses to a hamburger that opens a left slide-in
 * drawer (Radix Dialog: focus trap, Esc-to-close, scroll-lock, focus restore).
 * These tests pin an explicit 375px viewport so they are deterministic in BOTH
 * Playwright projects (they exercise mobile-only chrome).
 */

test.use({ viewport: { width: 375, height: 812 } })

test.describe("mobile drawer at 375px (AC-5)", () => {
  test("hamburger is visible and the inline desktop nav is hidden", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("mobile-nav-trigger")).toBeVisible()
    await expect(page.getByTestId("header-nav-catalog")).toBeHidden()
  })

  test("opening the hamburger reveals the drawer with the nav items", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()

    const panel = page.getByTestId("mobile-nav-panel")
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute("data-state", "open")
    await expect(page.getByTestId("mobile-nav-item-catalog")).toBeVisible()
    await expect(page.getByTestId("mobile-nav-item-contact")).toBeVisible()
  })

  test("traps focus inside the open drawer", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "open",
    )

    // Tab several times; focus must stay within the drawer panel (Radix trap).
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab")
      const focusInPanel = await page.evaluate(() => {
        const panel = document.querySelector(
          '[data-testid="mobile-nav-panel"]',
        )
        return panel != null && panel.contains(document.activeElement)
      })
      expect(focusInPanel).toBe(true)
    }
  })

  test("Escape closes the drawer and restores focus to the trigger", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("mobile-nav-trigger")
    await trigger.click()
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "open",
    )

    await page.keyboard.press("Escape")
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "closed",
    )
    // Radix restores focus to the trigger on close.
    await expect(trigger).toBeFocused()
  })

  test("the close button dismisses the drawer", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    await page.getByTestId("mobile-nav-close").click()
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "closed",
    )
  })

  test("clicking the scrim dismisses the drawer", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    // Click near the right edge (the panel is 85vw on the left; scrim on right).
    await page.getByTestId("mobile-nav-overlay").click({
      position: { x: 360, y: 400 },
    })
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "closed",
    )
  })

  test("a drawer nav link navigates and closes the drawer", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    await page.getByTestId("mobile-nav-item-catalog").click()
    // Navigates to the (dead) catalog route → shell 404, drawer gone.
    await expect(page).toHaveURL(/\/sillas$/)
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "closed",
    )
  })

  test("no horizontal scroll with the drawer open (AC-14, edge case 6)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("mobile-nav-trigger").click()
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "open",
    )
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test("header row (wordmark + hamburger + toggle) fits without overflow (edge case 6)", async ({
    page,
  }) => {
    await page.goto("/")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
