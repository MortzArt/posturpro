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

  test("shell is exposed to assistive tech when the drawer is closed, hidden only while open (AC-17 regression)", async ({
    page,
  }) => {
    // Regression for the Radix `forceMount` + modal `hideOthers` leak: a
    // force-mounted-while-closed dialog kept `aria-hidden="true"` on the shell
    // wrapper (header, main, footer, EVERY heading) permanently, hiding the
    // whole page from screen readers on every route. With the closed drawer
    // unmounted, the shell must be fully in the accessibility tree.
    await page.goto("/")
    // Closed: the h1 (and headings generally) are reachable via role.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const shellWrapper = page.locator("main").locator("..")
    await expect(shellWrapper).not.toHaveAttribute("aria-hidden", "true")

    // Open: Radix's modal correctly hides the background from AT while the
    // drawer is the active modal layer.
    await page.getByTestId("mobile-nav-trigger").click()
    await expect(page.getByTestId("mobile-nav-panel")).toHaveAttribute(
      "data-state",
      "open",
    )
    await expect(shellWrapper).toHaveAttribute("aria-hidden", "true")

    // Close (Esc): the guard is released — the shell is exposed again.
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("mobile-nav-panel")).toHaveCount(0)
    await expect(shellWrapper).not.toHaveAttribute("aria-hidden", "true")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
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
    // Navigates to the (now live, T3) catalog route; the drawer closes.
    await expect(page).toHaveURL(/\/sillas$/)
    // Once fully closed, the drawer portal UNMOUNTS (this is what clears Radix's
    // modal `hideOthers` guard so the shell is exposed to AT again). So the
    // panel is detached from the DOM — a stronger guarantee than `data-state`.
    await expect(page.getByTestId("mobile-nav-panel")).toHaveCount(0)
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
