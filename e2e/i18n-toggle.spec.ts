import { expect, test, type Page } from "@playwright/test"

/**
 * Language toggle + locale routing/persistence (T2 AC-6, AC-17, edge cases 3, 5, 8).
 *
 * The toggle rewrites the current URL segment via next-intl navigation (no full
 * reload), preserves the path, and persists the choice in the `NEXT_LOCALE`
 * cookie so return visits honor it. Two variants render responsively: a
 * segmented group (≥ md) and a compact single button (< md); these tests drive
 * whichever is visible so they pass in both the desktop and mobile projects.
 */

/**
 * Click the visible header toggle to switch INTO the target locale.
 *
 * Both toggle variants render simultaneously (CSS hides one per breakpoint) and
 * the segmented option testids also appear inside the force-mounted drawer, so
 * every click is scoped to the header to avoid strict-mode duplicate matches.
 */
async function switchTo(page: Page, target: "es-MX" | "en"): Promise<void> {
  const header = page.locator("header")
  const compact = header.getByTestId("language-toggle-compact")
  if (await compact.isVisible()) {
    // Compact button shows the OTHER locale and flips on tap.
    await compact.click()
    return
  }
  await header.getByTestId(`language-toggle-option-${target}`).click()
}

test.describe("language toggle (AC-6, AC-17)", () => {
  test("switches / (es-MX) → /en and swaps strings to English", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "es-MX")

    await switchTo(page, "en")

    await expect(page).toHaveURL(/\/en$/)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    // English nav label now present (was "Sillas" in Spanish).
    await expect(page.getByTestId("header-nav-catalog")).toHaveText(/chairs/i)
  })

  test("does not full-page reload when toggling (client navigation)", async ({
    page,
  }) => {
    await page.goto("/")
    // Tag the document; a full reload would wipe this marker.
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: boolean }).__noReload = true
    })
    await switchTo(page, "en")
    await expect(page).toHaveURL(/\/en$/)
    const survived = await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload === true,
    )
    expect(survived).toBe(true)
  })

  test("persists the choice via NEXT_LOCALE cookie across a fresh visit (edge case 3)", async ({
    page,
    context,
  }) => {
    await page.goto("/")
    await switchTo(page, "en")
    await expect(page).toHaveURL(/\/en$/)

    // next-intl writes `NEXT_LOCALE` via a middleware round-trip that completes
    // asynchronously AFTER the client-side URL updates (the toggle navigates via
    // `router.replace`, so the cookie's `Set-Cookie` lands on the subsequent RSC
    // request, not synchronously with the URL change). Reading the cookie the
    // instant `toHaveURL` resolves is therefore a race — which side wins is
    // nondeterministic across dev/prod and worker scheduling. Poll until the
    // cookie settles: the assertion still proves the real product guarantee
    // (the choice IS persisted to `NEXT_LOCALE=en`), just without the race.
    await expect
      .poll(async () => {
        const cookies = await context.cookies()
        return cookies.find((c) => c.name === "NEXT_LOCALE")?.value
      })
      .toBe("en")
  })

  test("preserves the current path when switching locale (AC-6)", async ({
    page,
  }) => {
    // A dead in-locale route still renders the shell (404); the toggle must keep
    // the path and only swap the locale segment.
    await page.goto("/sillas")
    await switchTo(page, "en")
    await expect(page).toHaveURL(/\/en\/sillas$/)
  })

  test("deep link /en/anything renders English with the toggle reflecting EN (edge case 8)", async ({
    page,
  }) => {
    await page.goto("/en")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    // Segmented (desktop) exposes aria-pressed; compact (mobile) shows the ES target.
    const header = page.locator("header")
    const enOption = header.getByTestId("language-toggle-option-en")
    if (await enOption.isVisible()) {
      await expect(enOption).toHaveAttribute("aria-pressed", "true")
    } else {
      await expect(header.getByTestId("language-toggle-compact")).toHaveText(
        /ES/i,
      )
    }
  })

  test("rapid double-toggle converges without desync (edge case 5)", async ({
    page,
  }) => {
    await page.goto("/")
    await switchTo(page, "en")
    await expect(page).toHaveURL(/\/en$/)
    await switchTo(page, "es-MX")
    await expect(page).toHaveURL(/\/$/) // back to unprefixed Spanish
    // URL and rendered strings agree — no stuck loading, last press wins.
    await expect(page.locator("html")).toHaveAttribute("lang", "es-MX")
    await expect(page.getByTestId("header-nav-catalog")).toHaveText(/sillas/i)
  })
})
