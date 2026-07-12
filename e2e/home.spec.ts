import { expect, test } from "@playwright/test"

/**
 * Home / shell smoke + i18n default (T2 AC-1, AC-5, AC-7, AC-12).
 *
 * `/` with no locale cookie must render Spanish (es-MX) with NO URL prefix and
 * `<html lang="es-MX">`, regardless of the browser Accept-Language — automatic
 * detection is disabled by design (AC-1). The persistent shell (header wordmark,
 * footer store name + copyright) renders server-side on the first paint.
 */

test.use({ locale: "en-US" }) // English browser — must still land on Spanish (AC-1)

test.describe("/ renders the Spanish shell by default (AC-1, AC-12)", () => {
  test("serves es-MX with no prefix and lang=es-MX even for an English browser", async ({
    page,
  }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)
    // No locale prefix in the URL (as-needed prefixing, Spanish default).
    expect(new URL(page.url()).pathname).toBe("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "es-MX")
  })

  test("has real Spanish metadata (not the create-next-app splash) (AC-12)", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/PosturPro/i)
    await expect(page).not.toHaveTitle(/create next app/i)
  })

  test("renders the persistent header + footer chrome (AC-5, AC-7)", async ({
    page,
  }) => {
    await page.goto("/")
    // Wordmark links home.
    const wordmark = page.getByTestId("header-wordmark")
    await expect(wordmark).toBeVisible()
    await expect(wordmark).toHaveAttribute("href", "/")
    // Footer store name + a copyright line carrying the current year.
    await expect(page.getByTestId("footer-store-name")).toBeVisible()
    const copyright = page.getByTestId("footer-copyright")
    await expect(copyright).toBeVisible()
    await expect(copyright).toContainText(String(new Date().getFullYear()))
  })

  test("renders the localized homepage placeholder heading + CTAs", async ({
    page,
  }) => {
    await page.goto("/")
    // The homepage owns the single <h1>. Query by tag (not role+accessible-name)
    // so the assertion is stable during the hydration window in which Radix's
    // force-mounted (closed) drawer can transiently perturb the a11y name tree.
    await expect(page.locator("main h1")).toHaveText(/sillas ergonómicas/i)
    await expect(page.getByTestId("home-cta-catalog")).toBeVisible()
    await expect(page.getByTestId("home-link-brands")).toBeVisible()
  })

  test("has no horizontal scroll on the homepage (AC-14)", async ({ page }) => {
    await page.goto("/")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
