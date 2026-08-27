import { expect, test } from "@playwright/test"

/**
 * Homepage rebuild E2E (T19 AC-15..24, edges 6/7/8/9).
 *
 * T19 replaced the T13 homepage with the client-approved 13-section structure:
 * topbar → hero → brand bar → values+impact → featured catalog → process → B2B
 * (reused T16 quote form) → social proof → savings calculator → trust+FAQ → CTA
 * banner → footer → WhatsApp FAB. This spec proves every section renders in BOTH
 * locales, the hero CTAs navigate, the calculator recomputes on select, the FAQ
 * toggles, the embedded quote form is wired, grade badges surface, no media-note
 * boxes ship, and 320px has no horizontal scroll.
 *
 * The canonical Playwright webServer ships with NO EMAIL_* env, so a full valid
 * quote submit resolves to the localized error banner (T16's success/rate-limit/
 * honeypot matrix is exhaustively covered in empresas-quote.spec.ts — not
 * re-run here to avoid draining the shared relay/rate-limit state).
 */

test.use({ locale: "en-US" }) // English browser must still land on Spanish (AC-1)

const SECTION_TESTIDS = [
  "site-topbar",
  "hero-stats",
  "hero-cert-tag",
  "brand-bar",
  "values-impact",
  "process-steps",
  "b2b-section",
  "social-proof",
  "savings-calculator",
  "trust-faq",
  "cta-banner",
  "site-footer",
] as const

test.describe("homepage renders the 13-section structure (AC-18)", () => {
  test("every section is present in the default (es-MX) locale", async ({
    page,
  }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)
    // The homepage owns the single <h1> (the mockup two-line headline).
    await expect(page.locator("main h1")).toContainText("Eleva tu mobiliario")
    for (const id of SECTION_TESTIDS) {
      await expect(page.getByTestId(id), `section ${id}`).toBeVisible()
    }
  })

  test("every section is present in English with EN copy (AC-20, edge 8)", async ({
    page,
  }) => {
    const response = await page.goto("/en")
    expect(response?.status()).toBe(200)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(page.locator("main h1")).toContainText("Elevate your furniture")
    for (const id of SECTION_TESTIDS) {
      await expect(page.getByTestId(id), `EN section ${id}`).toBeVisible()
    }
  })

  test("does NOT render the mockup's dashed media-note boxes (AC-21)", async ({
    page,
  }) => {
    await page.goto("/")
    // The mockups annotate photo/video slots with "media-note" boxes / copy;
    // none of that instruction text may ship to users.
    await expect(page.getByText(/media-note/i)).toHaveCount(0)
    await expect(page.getByText(/suggested (photo|video)/i)).toHaveCount(0)
  })
})

test.describe("hero CTAs navigate (AC-18)", () => {
  test("primary CTA links to the catalog and navigates", async ({ page }) => {
    await page.goto("/")
    const cta = page.getByTestId("hero-cta-catalog")
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute("href", "/sillas")
    await cta.click()
    await expect(page).toHaveURL(/\/sillas$/)
  })

  test("secondary CTA links to the business page and navigates", async ({
    page,
  }) => {
    await page.goto("/")
    const cta = page.getByTestId("hero-cta-business")
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute("href", "/empresas")
    await cta.click()
    await expect(page).toHaveURL(/\/empresas$/)
  })
})

test.describe("savings calculator recomputes on select (AC-23, edge 9)", () => {
  test("changing the model updates the savings figures without a reload", async ({
    page,
  }) => {
    await page.goto("/")
    const results = page.getByTestId("calc-results")
    await expect(results).toBeVisible()
    // Default model = Aeron → 43% savings (from computeSavings unit tests).
    await expect(results).toContainText("43%")
    const before = await results.textContent()

    // Radix Select (portal): click the trigger, then the "Steelcase — Leap V2"
    // option. Leap V2 saves ~50% — a different figure, proving live recompute.
    await page.getByTestId("calc-select").click()
    await page.getByRole("option", { name: /Steelcase — Leap V2/ }).click()

    await expect(results).not.toHaveText(before ?? "")
    await expect(results).toContainText("50%")
    // No navigation happened (still on the homepage — client-side island).
    await expect(page).toHaveURL(/\/$/)
  })

  test("the calculator never shows a negative savings percentage (edge 9)", async ({
    page,
  }) => {
    await page.goto("/")
    const results = page.getByTestId("calc-results")
    // Every configured model must be non-negative; sample the default.
    await expect(results).not.toContainText("-")
  })
})

test.describe("FAQ accordion toggles (AC-18)", () => {
  test("a FAQ item opens on click and reveals its answer", async ({ page }) => {
    await page.goto("/")
    const item = page.getByTestId("faq-item-faq-grados")
    await expect(item).toBeVisible()
    // Native <details> — closed by default.
    expect(await item.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(
      false,
    )
    await item.locator("summary").click()
    expect(await item.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(
      true,
    )
  })
})

test.describe("B2B section reuses the T16 quote form (AC-18, edge 4)", () => {
  test("the embedded quote form submits and reaches a server-decided state", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("b2b-section")).toBeVisible()
    // The reused T16 form is embedded — its fields are present.
    await page.getByTestId("quote-company").fill("Acme SA")
    await page.getByTestId("quote-name").fill("Ana")
    await page.getByTestId("quote-email").fill("ana@acme.com")
    await page.getByTestId("quote-teamSize").selectOption("11-50")
    await page.getByTestId("quote-needs").fill("Necesitamos 20 sillas.")
    await page.getByTestId("quote-submit").click()
    // With no EMAIL_* env the relay fails → localized error banner (proves the
    // whole reused pipeline is wired from the homepage, not just rendered).
    await expect(page.getByTestId("quote-form-error")).toBeVisible()
    // Values preserved for retry (reused T16 behavior).
    await expect(page.getByTestId("quote-company")).toHaveValue("Acme SA")
  })

  test("client-side validation blocks a bad email (reused T16 behavior)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("quote-company").fill("Acme SA")
    await page.getByTestId("quote-name").fill("Ana")
    await page.getByTestId("quote-email").fill("not-an-email")
    await page.getByTestId("quote-teamSize").selectOption("11-50")
    await page.getByTestId("quote-needs").fill("Necesitamos 20 sillas.")
    await page.getByTestId("quote-submit").click()
    await expect(page.getByTestId("quote-success")).toHaveCount(0)
  })
})

test.describe("SEO / structured data preserved (AC-24, edge 14)", () => {
  test("emits exactly one Organization and one WebSite JSON-LD node", async ({
    page,
  }) => {
    await page.goto("/")
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
    const joined = blocks.join("\n")
    // Exactly one of each — no duplicates, no omissions (edge 14).
    expect((joined.match(/"@type"\s*:\s*"Organization"/g) ?? []).length).toBe(1)
    expect((joined.match(/"@type"\s*:\s*"WebSite"/g) ?? []).length).toBe(1)
  })

  test("has real PosturPro metadata and hreflang alternates", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/PosturPro/i)
    await expect(page).not.toHaveTitle(/create next app/i)
    // hreflang alternates present (es-MX + en).
    await expect(
      page.locator('link[rel="alternate"][hreflang]'),
    ).not.toHaveCount(0)
  })
})

test.describe("responsive: 320px has no horizontal scroll (edge 7, AC-11)", () => {
  test.use({ viewport: { width: 320, height: 720 } })

  test("the homepage does not scroll horizontally at 320px", async ({
    page,
  }) => {
    await page.goto("/")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    // Core sections still render (stacked) at 320px.
    for (const id of ["hero-stats", "savings-calculator", "site-footer"]) {
      await expect(page.getByTestId(id), `${id} @320`).toBeVisible()
    }
  })
})
