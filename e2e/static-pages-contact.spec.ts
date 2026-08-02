import { expect, test } from "@playwright/test"

/**
 * T13 storefront e2e — static pages, homepage featured sections, showroom, and
 * the contact form. Runs against the seeded storefront (30 products, 5 brands,
 * 9 static pages + en overlay). Selectors prefer data-testid / getByRole /
 * getByLabel over copy so a message-key edit never breaks these.
 *
 * The contact SUCCESS path needs EMAIL_OWNER_ADDRESS + EMAIL_DEV_PREVIEW=1 which
 * are blocked-on-user (not wired in the e2e env), so with no EMAIL_* the relay
 * returns {ok:false} and the form shows the ERROR state — that IS the correct
 * default behavior (edge 4). We therefore assert validation, honeypot
 * invisibility, and the error-on-submit path here; the success mapping is proven
 * exhaustively at the action level (contacto/actions.test.ts).
 */

test.describe("homepage featured sections (T13 AC-7, AC-9)", () => {
  test("renders the featured chairs + brands sections from the seeded catalog", async ({
    page,
  }) => {
    await page.goto("/")
    // Seeded catalog is non-empty → both sections present (not omitted).
    await expect(page.getByTestId("featured-products")).toBeVisible()
    await expect(page.getByTestId("featured-brands")).toBeVisible()
    // At least one brand tile renders.
    await expect(
      page.getByTestId("featured-brand-tile").first(),
    ).toBeVisible()
    // "View all" affordances link to the catalog + brands index.
    await expect(
      page.getByTestId("featured-products-view-all"),
    ).toHaveAttribute("href", "/sillas")
    await expect(
      page.getByTestId("featured-brands-view-all"),
    ).toHaveAttribute("href", "/marcas")
  })

  test("has no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto("/")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe("generic static pages (T13 AC-1, AC-2, AC-5, edge 10)", () => {
  const GENERIC_SLUGS = [
    "sobre-nosotros",
    "envios",
    "devoluciones",
    "garantia",
    "preguntas-frecuentes",
    "aviso-de-privacidad",
    "terminos",
  ] as const

  for (const slug of GENERIC_SLUGS) {
    test(`/${slug} resolves 200 with an <h1> and prose body`, async ({
      page,
    }) => {
      const response = await page.goto(`/${slug}`)
      expect(response?.status()).toBe(200)
      await expect(page.locator("main h1")).not.toBeEmpty()
      await expect(page.getByTestId("static-page-body")).toBeVisible()
    })
  }

  test("the FAQ page supports a native #anchor deep-link (no JS)", async ({
    page,
  }) => {
    await page.goto("/preguntas-frecuentes")
    // At least one headed section renders an <h2 id> the deep-link can target.
    const firstHeading = page.locator("[data-testid='static-page-body'] h2[id]").first()
    await expect(firstHeading).toBeVisible()
    const id = await firstHeading.getAttribute("id")
    expect(id).toBeTruthy()
    // Deep-linking to the anchor lands on that section on first paint (no JS):
    // a fresh cross-document load of the fragment URL returns 200 and the target
    // becomes the URL's :target. Use a fresh navigation (query-buster) so it is a
    // real document load, not a same-document hash change (which yields no
    // response object).
    const response = await page.goto(`/preguntas-frecuentes?v=1#${id}`)
    expect(response?.status()).toBe(200)
    await expect(page.locator(`h2#${id}`)).toBeVisible()
    // The URL carries the fragment so the browser scroll-anchors it natively.
    expect(new URL(page.url()).hash).toBe(`#${id}`)
  })

  test("an unknown / reserved slug renders the in-shell 404 (edge 10)", async ({
    page,
  }) => {
    const response = await page.goto("/envios-y-devoluciones")
    // The generic route guards via isStaticPageSlug → old combined slug 404s.
    expect(response?.status()).toBe(404)
    await expect(page.getByTestId("header-wordmark")).toBeVisible()
  })
})

test.describe("static pages in English (T13 AC-4)", () => {
  test("/en/sobre-nosotros renders the English overlay in the en shell", async ({
    page,
  }) => {
    const response = await page.goto("/en/sobre-nosotros")
    expect(response?.status()).toBe(200)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(page.locator("main h1")).not.toBeEmpty()
    await expect(page.getByTestId("static-page-body")).toBeVisible()
  })

  test("/en/terminos (a legal page) resolves 200 in English", async ({
    page,
  }) => {
    const response = await page.goto("/en/terminos")
    expect(response?.status()).toBe(200)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
  })
})

test.describe("showroom page (T13 AC-18)", () => {
  test("renders address/hours text and degrades the map gracefully in both locales", async ({
    page,
  }) => {
    for (const path of ["/showroom", "/en/showroom"]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator("main h1")).not.toBeEmpty()
      // Address + hours body always renders (Option-A: copy lives in the body).
      await expect(page.getByTestId("static-page-body")).toBeVisible()
      // Map slot degrades: no SDK, no broken external link when unconfigured.
      // (SHOWROOM_MAP_URL is null in Phase 1 → the deep-link is omitted.)
      await expect(page.getByTestId("showroom-map-link")).toHaveCount(0)
    }
  })
})

test.describe("contact form (T13 AC-11, AC-13, AC-15, AC-20)", () => {
  test("renders the labeled form with an INVISIBLE honeypot (AC-15, AC-20)", async ({
    page,
  }) => {
    await page.goto("/contacto")
    await expect(page.getByTestId("contact-form")).toBeVisible()
    // Fields are label-associated (queryable by role/label).
    await expect(page.getByTestId("contact-name")).toBeVisible()
    await expect(page.getByTestId("contact-email")).toBeVisible()
    await expect(page.getByTestId("contact-message")).toBeVisible()
    await expect(page.getByTestId("contact-submit")).toBeVisible()

    // The honeypot must be present in the DOM but hidden from a real user AND
    // from assistive tech, and out of the tab order. It is positioned off-screen
    // (left:-9999px) rather than display:none so bots that skip hidden fields
    // still fill it — Playwright's toBeVisible() checks render, not viewport
    // bounds, so assert the actual hiding mechanism instead of pixel position.
    const honeypot = page.locator('input[name="website"]')
    await expect(honeypot).toHaveCount(1)
    // Not focusable via the keyboard (tabIndex=-1) and no autofill.
    await expect(honeypot).toHaveAttribute("tabindex", "-1")
    await expect(honeypot).toHaveAttribute("autocomplete", "off")
    // Wrapped in an aria-hidden, off-screen container (invisible to users + AT).
    const wrapper = page.locator('[aria-hidden="true"]', {
      has: honeypot,
    })
    await expect(wrapper).toHaveCount(1)
    const offScreenLeft = await wrapper.evaluate(
      (el) => getComputedStyle(el).left,
    )
    // Rendered far off-screen (negative left), never within the viewport.
    expect(parseInt(offScreenLeft, 10)).toBeLessThan(-1000)
  })

  test("submitting empty required fields shows inline errors and sends nothing (AC-13)", async ({
    page,
  }) => {
    await page.goto("/contacto")
    await page.getByTestId("contact-submit").click()
    // A field-level error surfaces via role=alert / aria-describedby.
    await expect(page.getByTestId("contact-name-error")).toBeVisible()
    await expect(page.getByTestId("contact-message-error")).toBeVisible()
    // No success banner — the submit was rejected client/server-side.
    await expect(page.getByTestId("contact-success")).toHaveCount(0)
  })

  test("an invalid email is rejected with a field error (AC-13)", async ({
    page,
  }) => {
    await page.goto("/contacto")
    await page.getByTestId("contact-name").fill("Ana")
    await page.getByTestId("contact-email").fill("not-an-email")
    await page.getByTestId("contact-message").fill("Hola, una pregunta.")
    await page.getByTestId("contact-submit").click()
    await expect(page.getByTestId("contact-email-error")).toBeVisible()
    await expect(page.getByTestId("contact-success")).toHaveCount(0)
  })

  test("a valid submission with no EMAIL_* env shows the localized error state + retry (edge 4)", async ({
    page,
  }) => {
    await page.goto("/contacto")
    await page.getByTestId("contact-name").fill("Ana")
    await page.getByTestId("contact-email").fill("ana@example.com")
    await page.getByTestId("contact-message").fill("Hola, ¿tienen envío a Monterrey?")
    await page.getByTestId("contact-submit").click()
    // With no owner address configured the relay returns {ok:false} → error banner.
    await expect(page.getByTestId("contact-form-error")).toBeVisible()
    // The raw provider reason is NEVER surfaced (AC-16) — only the localized copy.
    await expect(page.getByTestId("contact-form-error")).not.toContainText(
      /owner address/i,
    )
    // Input values are preserved so the user can retry.
    await expect(page.getByTestId("contact-name")).toHaveValue("Ana")
  })
})

test.describe("footer navigation resolves (T13 AC-10)", () => {
  test("every footer static-page link navigates to a real 200 page", async ({
    page,
  }) => {
    await page.goto("/")
    const linkTestIds = [
      "footer-link-about",
      "footer-link-shipping",
      "footer-link-returns",
      "footer-link-warranty",
      "footer-link-faq",
      "footer-link-contact",
      "footer-link-privacy",
      "footer-link-terms",
      "footer-link-showroom",
    ] as const
    for (const testId of linkTestIds) {
      const href = await page.getByTestId(testId).getAttribute("href")
      expect(href, testId).toBeTruthy()
      const response = await page.goto(href as string)
      expect(response?.status(), `${testId} → ${href}`).toBe(200)
      await page.goBack()
    }
  })
})
