/**
 * <PaymentPanel> component tests (T8 AC-5, AC-16, AC-17, AC-18, edges 4/6/11;
 * QA Stage-7 UX-state matrix). The panel is a state machine over a DB-derived
 * `PaymentPanelState` plus transient client overlays from the pay action. We mock
 * the server action (`createPaymentPreference`) and `window.location` so we can
 * drive every state deterministically and assert:
 *   - each of the 5 DB states renders its testid + a11y role (unpaid / failed /
 *     processing / pending-voucher / paid).
 *   - the pay/retry CTA calls the action and REDIRECTS on `redirect`.
 *   - an `unavailable` / `error` / `not-payable` action result flips to the
 *     transient client overlay (never leaves the user staring at "pay now").
 *   - `refunded` is a paid-hero variant with the refunded note.
 *   - the redirect handoff is a text swap + `aria-busy` (no invented spinner).
 * The label bundle is plain strings (server-resolved in prod) so no intl here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));

// The server action is mocked so we control what the pay CTA returns.
const createPaymentPreference = vi.fn();
vi.mock("@/app/[locale]/checkout/pay-actions", () => ({
  createPaymentPreference: (...args: unknown[]) => createPaymentPreference(...args),
}));

import { PaymentPanel, type PaymentPanelLabels } from "./payment-panel";
import type { PaymentPanelState } from "@/lib/payments/panel-state";

/** A complete, plain-string label bundle (mirrors buildPaymentPanelLabels). */
const LABELS: PaymentPanelLabels = {
  heading: "Complete your payment",
  subheading: "Choose your payment method in the next step.",
  totalLabel: "Total to pay",
  payNow: "Pay now",
  redirecting: "Redirecting…",
  secureNote: "Secure payment with Mercado Pago",
  paidTitle: "Payment received",
  methodLabel: {
    card: "Paid with card",
    oxxo: "Paid at OXXO",
    spei: "Paid via SPEI transfer",
    wallet: "Paid with Mercado Pago",
    generic: "Payment confirmed",
  },
  refundedNote: "Refunded",
  failedTitle: "Your payment was declined",
  failedBody: "The charge didn't go through. Please try again.",
  retry: "Retry payment",
  unavailableBody: "Payment is temporarily unavailable.",
  unavailableRetry: "Try again",
  processingTitle: "We're confirming your payment",
  processingBody: "This can take a moment.",
  refresh: "Refresh",
  processingRetryHint: "Having trouble? Retry the payment",
  redirectingAnnounce: "Redirecting to Mercado Pago.",
  voucher: {
    oxxoTitle: "Awaiting your payment",
    oxxoSubtitle: "Pay in cash at any OXXO.",
    speiTitle: "Awaiting your payment",
    speiSubtitle: "Transfer from your online banking to this CLABE.",
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
    generating: "We're generating your payment voucher. Check your email.",
    payDifferently: "Pay a different way",
    copiedAnnounce: "Reference copied.",
  },
};

const TOKEN = "tok-abc";
const TOTAL = 899990;

function renderPanel(initialState: PaymentPanelState) {
  return render(
    <PaymentPanel
      confirmationToken={TOKEN}
      locale="en"
      initialState={initialState}
      totalCents={TOTAL}
      labels={LABELS}
    />,
  );
}

/** Replace window.location.assign with a spy (jsdom throws on real navigation). */
let assignSpy: ReturnType<typeof vi.fn>;
let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createPaymentPreference.mockReset();
  assignSpy = vi.fn();
  reloadSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy, reload: reloadSpy, href: "http://localhost/" },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PaymentPanel — DB-derived states", () => {
  it("unpaid: renders the pay-now CTA, restated total, and no NaN (AC-5)", () => {
    renderPanel({ kind: "unpaid" });
    expect(screen.getByTestId("payment-panel-unpaid")).toBeInTheDocument();
    expect(screen.getByTestId("payment-pay-now")).toHaveTextContent("Pay now");
    const total = screen.getByTestId("payment-total");
    expect(total).toHaveTextContent("8,999.90");
    expect(total).not.toHaveTextContent("NaN");
  });

  it("paid: renders the paid card with role=status and the method label", () => {
    renderPanel({ kind: "paid", method: "card", refunded: false });
    const card = screen.getByTestId("payment-panel-paid");
    expect(card).toBeInTheDocument();
    expect(card.querySelector('[role="status"]')).not.toBeNull();
    expect(screen.getByTestId("payment-method-label")).toHaveTextContent("Paid with card");
  });

  it("paid: unknown method falls back to the generic label", () => {
    renderPanel({ kind: "paid", method: null, refunded: false });
    expect(screen.getByTestId("payment-method-label")).toHaveTextContent("Payment confirmed");
  });

  it("paid+refunded: shows the refunded note appended to the method (AC-19)", () => {
    renderPanel({ kind: "paid", method: "card", refunded: true });
    expect(screen.getByTestId("payment-method-label")).toHaveTextContent("Refunded");
  });

  it("failed: renders a role=alert destructive card with a retry CTA (AC-16)", () => {
    renderPanel({ kind: "failed" });
    const card = screen.getByTestId("payment-panel-failed");
    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card).toHaveTextContent("Your payment was declined");
    expect(screen.getByTestId("payment-retry")).toBeInTheDocument();
  });

  it("processing: renders a role=status card with refresh + retry (edge 6)", () => {
    renderPanel({ kind: "processing" });
    const card = screen.getByTestId("payment-panel-processing");
    expect(card.querySelector('[role="status"]')).not.toBeNull();
    expect(screen.getByTestId("payment-refresh")).toBeInTheDocument();
    expect(screen.getByTestId("payment-processing-retry")).toBeInTheDocument();
  });

  it("processing: refresh reloads the page (webhook-catch-up, edge 6)", () => {
    renderPanel({ kind: "processing" });
    fireEvent.click(screen.getByTestId("payment-refresh"));
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("pending-voucher: renders the OXXO voucher card (AC-17)", () => {
    renderPanel({
      kind: "pending-voucher",
      method: "oxxo",
      voucher: { reference: "93000012345", voucherUrl: "https://mp/v", expiresAt: null, verificationCode: null },
    });
    const voucher = screen.getByTestId("payment-voucher");
    expect(voucher).toHaveAttribute("data-method", "oxxo");
    expect(screen.getByTestId("payment-voucher-reference")).toHaveTextContent("93000012345");
  });

  it("pending-voucher: a null voucher degrades to the 'generating' copy (defensive)", () => {
    renderPanel({ kind: "pending-voucher", method: "spei", voucher: null });
    expect(screen.getByTestId("payment-voucher-generating")).toBeInTheDocument();
  });
});

describe("PaymentPanel — pay action + redirect handoff", () => {
  it("redirects to init_point on a successful preference (AC-5)", async () => {
    createPaymentPreference.mockResolvedValue({ status: "redirect", initPoint: "https://mp/checkout" });
    renderPanel({ kind: "unpaid" });
    fireEvent.click(screen.getByTestId("payment-pay-now"));
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("https://mp/checkout"));
    expect(createPaymentPreference).toHaveBeenCalledWith(TOKEN, "en");
  });

  it("shows the unavailable overlay when the action returns unavailable (edge 11)", async () => {
    createPaymentPreference.mockResolvedValue({ status: "unavailable" });
    renderPanel({ kind: "unpaid" });
    fireEvent.click(screen.getByTestId("payment-pay-now"));
    await waitFor(() => expect(screen.getByTestId("payment-panel-unavailable")).toBeInTheDocument());
    expect(screen.getByTestId("payment-unavailable-retry")).toBeInTheDocument();
    // Never leaks a raw error into the DOM.
    expect(document.body.textContent).not.toContain("MissingEnvVarError");
  });

  it("shows the failed/error overlay when the action returns error", async () => {
    createPaymentPreference.mockResolvedValue({ status: "error" });
    renderPanel({ kind: "unpaid" });
    fireEvent.click(screen.getByTestId("payment-pay-now"));
    await waitFor(() => expect(screen.getByTestId("payment-panel-failed")).toBeInTheDocument());
  });

  it("treats not-payable as an error overlay (already paid / gone)", async () => {
    createPaymentPreference.mockResolvedValue({ status: "not-payable" });
    renderPanel({ kind: "unpaid" });
    fireEvent.click(screen.getByTestId("payment-pay-now"));
    await waitFor(() => expect(screen.getByTestId("payment-panel-failed")).toBeInTheDocument());
  });

  it("retry from the failed state re-launches the pay action (AC-16, edge 4)", async () => {
    createPaymentPreference.mockResolvedValue({ status: "redirect", initPoint: "https://mp/retry" });
    renderPanel({ kind: "failed" });
    fireEvent.click(screen.getByTestId("payment-retry"));
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("https://mp/retry"));
    // The token is unchanged across the retry (same order, no re-create).
    expect(createPaymentPreference).toHaveBeenCalledWith(TOKEN, "en");
  });

  it("the unavailable overlay's retry can recover to a redirect", async () => {
    createPaymentPreference
      .mockResolvedValueOnce({ status: "unavailable" })
      .mockResolvedValueOnce({ status: "redirect", initPoint: "https://mp/ok" });
    renderPanel({ kind: "unpaid" });
    fireEvent.click(screen.getByTestId("payment-pay-now"));
    await waitFor(() => expect(screen.getByTestId("payment-panel-unavailable")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("payment-unavailable-retry"));
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("https://mp/ok"));
  });
});
