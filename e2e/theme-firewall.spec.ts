import { expect, test } from "@playwright/test"

/**
 * Theme-firewall visual smoke (T15 AC-2, AC-11, AC-12) — the AC the whole reskin
 * hinges on. Cheap + durable: asserts the storefront/admin theming boundary via
 * DOM signals only (no computed colors/fonts, so it survives future palette
 * tweaks), catching any regression that lets the cobalt world bleed into /admin
 * or drops the direction contract.
 *
 *   - Storefront `<body>` carries `.theme-storefront` (the token/font scope) — on
 *     both locales — and its markup contains the direction-contract HTML comment
 *     (`d43cafe8`, AC-2, greppable in the served HTML).
 *   - Admin `<body>` (login, unauthenticated) does NOT carry `.theme-storefront`
 *     and its markup does NOT contain the direction contract → admin resolves the
 *     untouched neutral world (AC-11/12 firewall).
 */

test.describe("storefront carries the theme scope + direction contract (AC-2, AC-12)", () => {
  test("es-MX storefront body has .theme-storefront and emits the contract", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.locator("body")).toHaveClass(/theme-storefront/)
    const html = await page.content()
    expect(html).toContain("d43cafe8")
    expect(html).toContain("impeccable:direction-contract")
  })

  test("en storefront body also has .theme-storefront (both locales)", async ({
    page,
  }) => {
    await page.goto("/en")
    await expect(page.locator("body")).toHaveClass(/theme-storefront/)
    const html = await page.content()
    expect(html).toContain("d43cafe8")
  })
})

test.describe("admin is firewalled from the storefront world (AC-11)", () => {
  test("admin login body has NO .theme-storefront and NO direction contract", async ({
    page,
  }) => {
    await page.goto("/admin/login")
    await expect(page.getByTestId("admin-login-form")).toBeVisible()
    await expect(page.locator("body")).not.toHaveClass(/theme-storefront/)
    const html = await page.content()
    expect(html).not.toContain("d43cafe8")
    expect(html).not.toContain("impeccable:direction-contract")
  })
})
