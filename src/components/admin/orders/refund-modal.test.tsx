/**
 * RefundModal tests (T12 AC-10 / edge 7, M-1). The refund path MUST thread the
 * action's REAL `emailSent` value to `onRefunded`, so the parent can flag a
 * refund whose customer email failed with "· correo no enviado". The original bug
 * called `onRefunded()` with no argument and the parent hardcoded `true`, hiding a
 * failed refund-issued email on the single most sensitive action. These tests pin
 * that the value propagates for BOTH outcomes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RefundModal } from "./refund-modal";
import type { RefundOrderActionResult } from "@/lib/admin/orders/order-action-types";

const refundOrderMock = vi.fn<() => Promise<RefundOrderActionResult>>();

vi.mock("@/app/admin/(app)/orders/actions", () => ({
  refundOrder: (...args: unknown[]) => refundOrderMock(...(args as [])),
}));

afterEach(() => {
  cleanup();
  refundOrderMock.mockReset();
});

function renderModal(onRefunded: (emailSent: boolean) => void) {
  return render(
    <RefundModal
      open
      onOpenChange={() => {}}
      orderId="11111111-1111-1111-1111-111111111111"
      orderNumber="PP-000123"
      totalCents={19900}
      refundedCents={0}
      onRefunded={onRefunded}
    />,
  );
}

/** Drive the two-step modal (full refund) to submission. */
async function submitFullRefund(): Promise<void> {
  fireEvent.click(screen.getByTestId("refund-continue"));
  const confirm = await screen.findByTestId("refund-confirm-input");
  fireEvent.change(confirm, { target: { value: "REEMBOLSAR" } });
  fireEvent.click(screen.getByTestId("refund-submit"));
}

describe("RefundModal onRefunded propagation (M-1)", () => {
  it("threads emailSent=true when the refund-issued email was sent", async () => {
    refundOrderMock.mockResolvedValue({ ok: true, kind: "full", emailSent: true });
    const onRefunded = vi.fn();
    renderModal(onRefunded);

    await submitFullRefund();

    await waitFor(() => expect(onRefunded).toHaveBeenCalledTimes(1));
    expect(onRefunded).toHaveBeenCalledWith(true);
  });

  it("threads emailSent=false when the refund succeeded but the email failed", async () => {
    refundOrderMock.mockResolvedValue({ ok: true, kind: "full", emailSent: false });
    const onRefunded = vi.fn();
    renderModal(onRefunded);

    await submitFullRefund();

    await waitFor(() => expect(onRefunded).toHaveBeenCalledTimes(1));
    // The regression this test guards: the failed-email signal must NOT be lost.
    expect(onRefunded).toHaveBeenCalledWith(false);
  });

  it("does NOT call onRefunded on a failed refund (shows the friendly error)", async () => {
    refundOrderMock.mockResolvedValue({ ok: false, reason: "mp-error" });
    const onRefunded = vi.fn();
    renderModal(onRefunded);

    await submitFullRefund();

    // The step-2 confirm input surfaces the friendly error via its associated
    // FieldError (m-3 wiring: testid `<input-testid>-error`).
    await screen.findByTestId("refund-confirm-input-error");
    expect(onRefunded).not.toHaveBeenCalled();
  });
});
