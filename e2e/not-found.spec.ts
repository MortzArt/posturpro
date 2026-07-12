import { expect, test } from "@playwright/test"

/**
 * 404 / invalid-locale routing (T2 AC-10, edge case 1, edge case 8).
 *
 * Invalid locale segments (`/fr`) and dead in-locale routes (`/sillas`) must
 * render the localized friendly 404 INSIDE the shell (header + footer) with a
 * "back to home" action and an HTTP 404 status — never a blank page or a crash.
 */

test.describe("localized 404 inside the shell (AC-10)", () => {
  test("invalid locale /fr returns 404 with the localized 404 in the shell (edge case 1)", async ({
    page,
  }) => {
    const response = await page.goto("/fr")
    expect(response?.status()).toBe(404)
    // Shell chrome still present.
    await expect(page.getByTestId("header-wordmark")).toBeVisible()
    await expect(page.getByTestId("footer-copyright")).toBeVisible()
    // Localized 404 body + back-home CTA (default locale = Spanish).
    await expect(page.getByTestId("not-found-home")).toBeVisible()
    await expect(page.locator("main h1")).toHaveText(/página no encontrada/i)
  })

  test("dead in-locale route /sillas renders the 404 inside the shell", async ({
    page,
  }) => {
    const response = await page.goto("/sillas")
    expect(response?.status()).toBe(404)
    await expect(page.getByTestId("header-wordmark")).toBeVisible()
    await expect(page.getByTestId("not-found-home")).toBeVisible()
  })

  test("back-home CTA returns to the homepage", async ({ page }) => {
    await page.goto("/sillas")
    await page.getByTestId("not-found-home").click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator("main h1")).toHaveText(/sillas ergonómicas/i)
  })

  test("deep link /en/anything renders the English 404 in the shell (edge case 8)", async ({
    page,
  }) => {
    const response = await page.goto("/en/anything")
    expect(response?.status()).toBe(404)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(page.locator("main h1")).toHaveText(/page not found/i)
  })

  test("the 404 page has no horizontal scroll (AC-14)", async ({ page }) => {
    await page.goto("/fr")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
