/**
 * <OxxoSpeiInstructions> component tests (T8 AC-17; QA Stage-7 voucher-degradation
 * matrix). The voucher card is DEFENSIVE by design: every field is nullable and
 * rendered only if present — no `undefined`, no "Invalid Date", no empty `<a href>`
 * (dev principle 7). It is amber/neutral, never green (pending is not success). We
 * assert:
 *   - a fully-populated OXXO voucher renders reference / amount / expiry / link.
 *   - a SPEI voucher swaps the title + reference label (CLABE).
 *   - EVERY field missing degrades gracefully (generating copy, no-url copy, no
 *     expiry row) with NO crash and NO "Invalid Date".
 *   - an invalid ISO expiry is dropped (no "Invalid Date" leaks).
 *   - the expiry is locale-formatted (es-MX vs en produce different month text).
 *   - a11y: role=status; pay-differently button; copy is feature-detected.
 * Copy is feature-detected via navigator.clipboard — under jsdom it is absent, so
 * the copy button is hidden and the reference stays select-all (asserted).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { OxxoSpeiInstructions, type VoucherLabels } from "./oxxo-spei-instructions";

const LABELS: VoucherLabels = {
  oxxoTitle: "Awaiting your payment",
  oxxoSubtitle: "Pay in cash at any OXXO.",
  speiTitle: "Awaiting your SPEI payment",
  speiSubtitle: "Transfer to this CLABE.",
  referenceLabel: "Reference",
  clabeLabel: "Interbank CLABE",
  amountLabel: "Amount",
  expiresLabel: "Expires",
  copy: "Copy",
  copied: "Copied",
  copyAria: "Copy payment reference",
  viewVoucher: "View voucher",
  viewVoucherAria: "View voucher (opens in a new tab)",
  noVoucherUrl: "We've emailed you the voucher.",
  generating: "We're generating your payment voucher.",
  payDifferently: "Pay a different way",
  copiedAnnounce: "Reference copied.",
};

const AMOUNT = 899990;

interface Overrides {
  method?: "oxxo" | "spei";
  reference?: string | null;
  voucherUrl?: string | null;
  expiresAt?: string | null;
  locale?: string;
}

const onPayDifferently = vi.fn();

function renderVoucher(o: Overrides = {}) {
  return render(
    <OxxoSpeiInstructions
      method={o.method ?? "oxxo"}
      reference={o.reference === undefined ? "93000012345678" : o.reference}
      voucherUrl={o.voucherUrl === undefined ? "https://mp.example/voucher" : o.voucherUrl}
      expiresAt={o.expiresAt === undefined ? "2026-07-20T18:00:00.000Z" : o.expiresAt}
      amountCents={AMOUNT}
      locale={o.locale ?? "en"}
      labels={LABELS}
      onPayDifferently={onPayDifferently}
      payDifferentlyPending={false}
    />,
  );
}

beforeEach(() => {
  onPayDifferently.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("OxxoSpeiInstructions — fully populated", () => {
  it("OXXO: renders reference, amount, expiry, and the view-voucher link (AC-17)", () => {
    renderVoucher({ method: "oxxo" });
    const card = screen.getByTestId("payment-voucher");
    expect(card).toHaveAttribute("data-method", "oxxo");
    expect(card).toHaveAttribute("role", "status");
    expect(card).toHaveTextContent("Awaiting your payment");
    expect(screen.getByTestId("payment-voucher-reference")).toHaveTextContent("93000012345678");
    expect(screen.getByTestId("payment-voucher-amount")).toHaveTextContent("8,999.90");
    expect(screen.getByTestId("payment-voucher-expires")).toBeInTheDocument();
    const link = screen.getByTestId("payment-voucher-link");
    expect(link).toHaveAttribute("href", "https://mp.example/voucher");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("SPEI: swaps the title and shows the CLABE reference label", () => {
    renderVoucher({ method: "spei" });
    const card = screen.getByTestId("payment-voucher");
    expect(card).toHaveAttribute("data-method", "spei");
    expect(card).toHaveTextContent("Awaiting your SPEI payment");
    expect(card).toHaveTextContent("Interbank CLABE");
  });

  it("reference is select-all for manual copy (clipboard fallback)", () => {
    renderVoucher({});
    const ref = screen.getByTestId("payment-voucher-reference");
    expect(ref.className).toContain("select-all");
  });

  it("is NOT styled as success (amber border, not emerald/green)", () => {
    renderVoucher({});
    const card = screen.getByTestId("payment-voucher");
    expect(card.className).toContain("amber");
    expect(card.className).not.toContain("emerald");
  });
});

describe("OxxoSpeiInstructions — defensive degradation", () => {
  it("no reference → 'generating' copy, no reference block, no crash", () => {
    renderVoucher({ reference: null });
    expect(screen.getByTestId("payment-voucher-generating")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-voucher-reference")).toBeNull();
  });

  it("no voucher URL → the no-url fallback copy, no empty <a href>", () => {
    renderVoucher({ voucherUrl: null });
    expect(screen.getByTestId("payment-voucher-no-url")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-voucher-link")).toBeNull();
  });

  it("no expiry → the expiry row is omitted (no 'Expires' label)", () => {
    renderVoucher({ expiresAt: null });
    expect(screen.queryByTestId("payment-voucher-expires")).toBeNull();
  });

  it("ALL fields missing → renders the amount + fallbacks, never crashes", () => {
    renderVoucher({ reference: null, voucherUrl: null, expiresAt: null });
    expect(screen.getByTestId("payment-voucher")).toBeInTheDocument();
    expect(screen.getByTestId("payment-voucher-generating")).toBeInTheDocument();
    expect(screen.getByTestId("payment-voucher-no-url")).toBeInTheDocument();
    expect(screen.getByTestId("payment-voucher-amount")).toHaveTextContent("8,999.90");
    expect(document.body.textContent).not.toContain("Invalid Date");
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("an INVALID ISO expiry is dropped (never renders 'Invalid Date')", () => {
    renderVoucher({ expiresAt: "not-a-date" });
    expect(screen.queryByTestId("payment-voucher-expires")).toBeNull();
    expect(document.body.textContent).not.toContain("Invalid Date");
  });
});

describe("OxxoSpeiInstructions — locale + interaction", () => {
  it("formats the expiry per locale (es-MX vs en differ)", () => {
    const iso = "2026-07-20T18:00:00.000Z";
    const { unmount } = renderVoucher({ expiresAt: iso, locale: "en" });
    const en = screen.getByTestId("payment-voucher-expires").textContent ?? "";
    unmount();
    renderVoucher({ expiresAt: iso, locale: "es-MX" });
    const es = screen.getByTestId("payment-voucher-expires").textContent ?? "";
    expect(en).not.toBe("");
    expect(es).not.toBe("");
    // Locale-formatted output differs between en and es-MX (month name / order).
    expect(en).not.toBe(es);
  });

  it("pay-differently button invokes the callback (AC-16 fresh attempt)", () => {
    renderVoucher({});
    fireEvent.click(screen.getByTestId("payment-voucher-pay-differently"));
    expect(onPayDifferently).toHaveBeenCalledOnce();
  });

  it("hides the copy button when navigator.clipboard is unavailable (jsdom)", () => {
    // jsdom does not implement navigator.clipboard → copy is feature-detected off.
    renderVoucher({});
    expect(screen.queryByTestId("payment-voucher-copy")).toBeNull();
  });
});
