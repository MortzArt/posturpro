import { expect, test } from "@playwright/test"

/**
 * T16 B2B landing e2e — `/empresas` (both locales), nav/footer link, the quote
 * form (labeled fields + off-screen honeypot + validation + team-size enum +
 * default error-on-submit). Selectors prefer data-testid / getByRole so a
 * message-key edit never breaks these.
 *
 * The SUCCESS path needs EMAIL_OWNER_ADDRESS + EMAIL_DEV_PREVIEW=1 (not wired in
 * the e2e env), so with no EMAIL_* the relay returns {ok:false} and the form
 * shows the ERROR state — that IS the correct default behavior (edge 3). We
 * therefore assert render, validation, honeypot invisibility, and error-on-submit
 * here; the success mapping is proven exhaustively at the action level
 * (empresas/actions.test.ts).
 */

test.describe("B2B landing renders in both locales (AC-1, AC-2)", () => {
  for (const { path, lang } of [
    { path: "/empresas", lang: "es-MX" },
    { path: "/en/empresas", lang: "en" },
  ] as const) {
    test(`${path} resolves 200 with the pitch sections + form`, async ({
      page,
    }) => {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator("html")).toHaveAttribute("lang", lang)
      await expect(page.locator("main h1")).not.toBeEmpty()
      // Persuade spine: pillars, process, and the quote form all present.
      await expect(page.getByTestId("b2b-pillars")).toBeVisible()
      await expect(page.getByTestId("b2b-process")).toBeVisible()
      await expect(page.getByTestId("quote-form")).toBeVisible()
    })
  }

  test("has no horizontal overflow at 375px or 768px (AC-12)", async ({
    page,
  }) => {
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/empresas")
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(1)
    }
  })

  test("the hero CTA scroll-anchors to the quote form (AC-2)", async ({
    page,
  }) => {
    await page.goto("/empresas")
    const cta = page.getByTestId("hero-cta-catalog")
    await expect(cta).toHaveAttribute("href", "#cotizacion")
    // The process section is an anchor target for the hero secondary link.
    await expect(page.getByTestId("hero-link-brands")).toHaveAttribute(
      "href",
      "#como-funciona",
    )
    await expect(page.locator("#como-funciona")).toHaveCount(1)
    await expect(page.locator("#cotizacion")).toHaveCount(1)
  })
})

test.describe("quote form (AC-4, AC-6, AC-7, AC-11)", () => {
  test("renders labeled fields incl. the native team-size select + INVISIBLE honeypot", async ({
    page,
  }) => {
    await page.goto("/empresas")
    await expect(page.getByTestId("quote-company")).toBeVisible()
    await expect(page.getByTestId("quote-name")).toBeVisible()
    await expect(page.getByTestId("quote-email")).toBeVisible()
    await expect(page.getByTestId("quote-phone")).toBeVisible()
    await expect(page.getByTestId("quote-needs")).toBeVisible()
    await expect(page.getByTestId("quote-submit")).toBeVisible()

    // Team size is a NATIVE <select> (keyboard/SR/mobile-picker correct).
    const select = page.getByTestId("quote-teamSize")
    await expect(select).toBeVisible()
    expect(await select.evaluate((el) => el.tagName)).toBe("SELECT")
    // It offers the enum options (placeholder + the four ranges).
    const optionCount = await select.locator("option").count()
    expect(optionCount).toBe(5)

    // Honeypot: present in the DOM, off-screen, aria-hidden, out of tab order.
    const honeypot = page.locator('input[name="company_url"]')
    await expect(honeypot).toHaveCount(1)
    await expect(honeypot).toHaveAttribute("tabindex", "-1")
    await expect(honeypot).toHaveAttribute("autocomplete", "off")
    const wrapper = page.locator('[aria-hidden="true"]', { has: honeypot })
    await expect(wrapper).toHaveCount(1)
    const offScreenLeft = await wrapper.evaluate(
      (el) => getComputedStyle(el).left,
    )
    expect(parseInt(offScreenLeft, 10)).toBeLessThan(-1000)
  })

  test("submitting empty required fields shows inline errors and sends nothing", async ({
    page,
  }) => {
    await page.goto("/empresas")
    await page.getByTestId("quote-submit").click()
    await expect(page.getByTestId("quote-company-error")).toBeVisible()
    await expect(page.getByTestId("quote-needs-error")).toBeVisible()
    // team-size left on its placeholder → required error.
    await expect(page.getByTestId("quote-teamSize-error")).toBeVisible()
    await expect(page.getByTestId("quote-success")).toHaveCount(0)
  })

  test("an invalid email is rejected with a field error", async ({ page }) => {
    await page.goto("/empresas")
    await page.getByTestId("quote-company").fill("Acme SA")
    await page.getByTestId("quote-name").fill("Ana")
    await page.getByTestId("quote-email").fill("not-an-email")
    await page.getByTestId("quote-teamSize").selectOption("11-50")
    await page.getByTestId("quote-needs").fill("Necesitamos 20 sillas.")
    await page.getByTestId("quote-submit").click()
    await expect(page.getByTestId("quote-email-error")).toBeVisible()
    await expect(page.getByTestId("quote-success")).toHaveCount(0)
  })

  test("a valid submission with no EMAIL_* env shows the error state + retry (edge 3)", async ({
    page,
  }) => {
    await page.goto("/empresas")
    await page.getByTestId("quote-company").fill("Acme SA")
    await page.getByTestId("quote-name").fill("Ana")
    await page.getByTestId("quote-email").fill("ana@acme.com")
    await page.getByTestId("quote-phone").fill("5512345678")
    await page.getByTestId("quote-teamSize").selectOption("51-200")
    await page.getByTestId("quote-needs").fill("Necesitamos 40 sillas para diseño.")
    await page.getByTestId("quote-submit").click()
    // With no owner address configured the relay returns {ok:false} → error banner.
    await expect(page.getByTestId("quote-form-error")).toBeVisible()
    // The raw provider reason is NEVER surfaced (AC-6) — only the localized copy.
    await expect(page.getByTestId("quote-form-error")).not.toContainText(
      /owner address/i,
    )
    // Input values are preserved so the user can retry.
    await expect(page.getByTestId("quote-company")).toHaveValue("Acme SA")
    await expect(page.getByTestId("quote-teamSize")).toHaveValue("51-200")
  })
})

test.describe("nav + footer link to /empresas (AC-8, zero dead links)", () => {
  test("the desktop nav item resolves to a real 200 page", async ({ page }) => {
    await page.goto("/")
    const navLink = page.locator('header a[href="/empresas"]').first()
    await expect(navLink).toHaveCount(1)
    const response = await page.goto("/empresas")
    expect(response?.status()).toBe(200)
  })

  test("the footer link resolves to a real 200 page", async ({ page }) => {
    await page.goto("/")
    const href = await page
      .getByTestId("footer-link-offices")
      .getAttribute("href")
    expect(href).toBe("/empresas")
    const response = await page.goto(href as string)
    expect(response?.status()).toBe(200)
  })
})
